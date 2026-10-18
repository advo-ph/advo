/**
 * The owner-only floating chat widget — two tabs, Updates and Ask.
 *
 * Gates on `useRoles().isOwner` itself (never rendered at all for a non-owner,
 * not just visually hidden — matches the server-side `requireOwner` gate).
 *
 * Positioned so it never overlaps two other fixed, bottom-anchored surfaces:
 * the global JobProgressWidget (App.tsx, also bottom-right — this widget
 * sits one z-index below it so an active job card is never hidden behind the
 * chat bubble), and, on mobile, AdminBottomNav's floating pill (which spans
 * full width at the very bottom) — the mobile bubble anchors well above it.
 * Both this widget and JobProgressWidget pad with
 * `max(..., env(safe-area-inset-bottom))` so they clear the iPhone home
 * indicator inside the native app.
 *
 * Phones get a bottom sheet (Radix Dialog: focus trap, Escape, scroll lock)
 * that tracks `window.visualViewport`, so the composer rides above the iOS
 * keyboard instead of being covered by it — dvh alone doesn't shrink for the
 * keyboard on iOS Safari. Desktop gets a non-modal floating panel.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowUp, AudioLines, CloudOff, Loader2, MessageCircle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoles } from "@/hooks/useRoles";
import { useIsMobile } from "@/hooks/useMobile";
import { useChatChannel, type ChatChannel, type ChatMessage } from "@/hooks/useChat";
import { ChatMessageBubble } from "@/components/admin/ChatMessageBubble";

/** Clears the home indicator on iOS and leaves 24px everywhere else. */
const SAFE_BOTTOM = "max(1.5rem, calc(env(safe-area-inset-bottom) + 1.5rem))";
/**
 * On mobile the collapsed bubble must also clear AdminBottomNav's floating
 * pill (fixed, bottom-0, full-width hit area) — 5.5rem matches the anchor
 * AdminBottomNav's own "More" sheet already uses to sit above itself.
 */
const SAFE_BOTTOM_MOBILE = "max(5.5rem, calc(env(safe-area-inset-bottom) + 5.5rem))";
const SAFE_RIGHT = "max(1rem, calc(env(safe-area-inset-right) + 1rem))";
/** 0.75rem lines the bubble up with the pill's own px-3 edge on a phone. */
const SAFE_RIGHT_MOBILE = "max(0.75rem, calc(env(safe-area-inset-right) + 0.75rem))";
/** Strip of dimmed page kept above the sheet, below the notch/status bar. */
const SHEET_TOP_GAP = "max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))";
/** Same-sender turns closer together than this read as one block. */
const GROUP_GAP_MS = 5 * 60_000;
const PANEL_ID = "advo-chat-panel";

type ChatChannelState = ReturnType<typeof useChatChannel>;

/**
 * Updates-only: the owner's free text is only ever treated as an answer to
 * the most recent unanswered `input_mode='text'` bot prompt (server-side
 * rule, chat.service.ts's `sendOwnerText`). Anything typed with no such
 * prompt pending is stored as a "disconnected note" and nothing happens —
 * previously the input was always shown, so that dead end was the default
 * experience. Mirroring the same rule client-side lets the input hide itself
 * until there's actually a question to answer.
 */
function findPendingTextPrompt(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender === "bot" && m.inputMode === "text" && !m.answeredOptionId) return m;
  }
  return null;
}

function hasOpenButtonPrompt(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => m.sender === "bot" && m.inputMode === "buttons" && !m.answeredOptionId && (m.options?.length ?? 0) > 0,
  );
}

// ─── Day separators + same-sender grouping ──────────────────────────────

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function isSameRun(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.sender === b.sender &&
    // A button prompt always closes its run: its options sit under it.
    a.inputMode !== "buttons" &&
    dayKey(a.createdAt) === dayKey(b.createdAt) &&
    Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) <= GROUP_GAP_MS
  );
}

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: number; message: ChatMessage; isGroupStart: boolean; isGroupEnd: boolean };

function buildRows(messages: ChatMessage[]): Row[] {
  const rows: Row[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)) {
      rows.push({ kind: "day", key: `day-${dayKey(m.createdAt)}-${i}`, label: dayLabel(m.createdAt) });
    }
    rows.push({
      kind: "message",
      key: m.chatMessageId,
      message: m,
      isGroupStart: !prev || !isSameRun(prev, m),
      isGroupEnd: !next || !isSameRun(m, next),
    });
  });
  return rows;
}

// ─── iOS keyboard tracking ──────────────────────────────────────────────

type ViewportFit = { height: number; bottomInset: number };

/**
 * The iOS keyboard shrinks the *visual* viewport but not the layout viewport
 * (or `dvh`), so a `bottom: 0` sheet ends up underneath it. This reports how
 * much of the layout viewport the keyboard covers, so the sheet can sit on
 * top of the keyboard and fit the visible area. Pinch-zoom also shrinks the
 * visual viewport — ignored, only a keyboard should move the sheet.
 */
function useVisualViewportFit(enabled: boolean): ViewportFit | null {
  const [fit, setFit] = useState<ViewportFit | null>(null);

  useEffect(() => {
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !viewport) {
      setFit(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (Math.abs(viewport.scale - 1) > 0.01) return;
        const bottomInset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
        setFit({ height: Math.round(viewport.height), bottomInset });
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return fit;
}

// ─── Small pieces ───────────────────────────────────────────────────────

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        // Dark ink on ADVO orange in both themes: white-on-orange is ~2.9:1.
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-none tabular-nums text-neutral-950",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function DaySeparator({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div role="separator" className="mt-6 flex items-center gap-3 first:mt-1">
      <span className="h-px flex-1 bg-border/70" />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  );
}

function EmptyState({ channel, isOffline }: { channel: ChatChannel; isOffline: boolean }) {
  const content = isOffline
    ? {
        icon: CloudOff,
        title: "Ask is off right now",
        body: "No AI key is set up on the server yet, so questions can't be answered. Updates still work.",
      }
    : channel === "updates"
      ? {
          icon: AudioLines,
          title: "No updates yet",
          body: "When a new Plaud meeting comes in, it shows up here so you can pick its project.",
        }
      : {
          icon: Sparkles,
          title: "Ask about your work",
          body: "Projects, meetings, or the calendar. You get a short, plain answer.",
        };
  const Icon = content.icon;
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-muted/60 text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-[15px] font-semibold tracking-tight text-foreground md:text-sm">{content.title}</p>
      <p className="mt-1.5 max-w-[17rem] text-[13px] leading-relaxed text-muted-foreground">{content.body}</p>
    </div>
  );
}

function OfflineNotice() {
  return (
    <div
      role="status"
      className="mx-4 mt-3 flex shrink-0 items-start gap-3 rounded-xl border border-border/70 bg-muted/50 px-3 py-2.5 md:mx-3"
    >
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-snug text-foreground">Ask is off right now</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          No AI key is set up yet, so new questions can't be answered.
        </p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="mt-4 flex flex-col items-start">
      <div className="flex h-9 items-center gap-1 rounded-[1.125rem] rounded-bl-md bg-muted px-4" aria-hidden>
        {[0, 1, 2].map((i) =>
          reduceMotion ? (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
          ) : (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -2.5, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.16 }}
            />
          ),
        )}
      </div>
      <span className="mt-1 px-1 text-[11px] leading-4 text-muted-foreground/80">Thinking…</span>
    </div>
  );
}

function ErrorLine({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="mx-3 mb-2 flex shrink-0 items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 py-1 pl-3 pr-1 text-danger md:mx-2.5"
    >
      <AlertCircle className="mt-3 h-4 w-4 shrink-0 md:mt-1.5" aria-hidden />
      <p className="min-w-0 flex-1 py-2.5 text-[13px] leading-snug [overflow-wrap:anywhere] md:py-1">{error}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-7 md:w-7"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

// ─── One channel's pane ─────────────────────────────────────────────────

function ChatPane({
  channel,
  state,
  draft,
  onDraftChange,
  isKeyboardOpen,
}: {
  channel: ChatChannel;
  state: ChatChannelState;
  draft: string;
  onDraftChange: (value: string) => void;
  isKeyboardOpen: boolean;
}) {
  const { messages, sendText, answer, isSending, error, clearError, askAvailable } = state;
  const reduceMotion = useReducedMotion();
  const inputId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPinnedRef = useRef(true);
  const hasScrolledRef = useRef(false);
  const [pendingAnswer, setPendingAnswer] = useState<{ messageId: number; optionId: string } | null>(null);

  // useChatChannel forces this channel's unreadCount to 0 and advances
  // last-seen on its own while `active` is true (see useChat.ts) — no
  // explicit markSeen() call needed here.

  const isOffline = channel === "ask" && askAvailable === false;
  const pendingPrompt = channel === "updates" ? findPendingTextPrompt(messages) : null;
  const showInput = channel === "ask" || pendingPrompt !== null;
  const showThinking = isSending && channel === "ask";
  const rows = useMemo(() => buildRows(messages), [messages]);

  // New turns append at the bottom. `scrollIntoView` can walk up and scroll
  // an ancestor (the whole mobile sheet, even the page) on some browsers;
  // scrolling the list's own container keeps the motion local to the pane.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: hasScrolledRef.current && !reduceMotion ? "smooth" : "auto" });
    hasScrolledRef.current = true;
    isPinnedRef.current = true;
  }, [messages.length, showThinking, reduceMotion]);

  // The list shrinks when the keyboard opens, the composer grows, or the
  // error line appears — stay on the latest turn if that's where you were.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (isPinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-grow the composer up to ~5 lines, then scroll inside it.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft, showInput]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || isSending || isOffline) return;
    try {
      await sendText(body);
      onDraftChange("");
    } catch {
      // error state is already set by useChatChannel; keep the draft so the
      // owner doesn't have to retype it, and surface the line below.
    }
  };

  const handleAnswer = (messageId: number, optionId: string) => {
    if (isSending) return;
    setPendingAnswer({ messageId, optionId });
    answer(messageId, optionId)
      .catch(() => {
        // Surfaced by the error line; nothing else to do here.
      })
      .finally(() => setPendingAnswer(null));
  };

  const canSend = draft.trim().length > 0 && !isSending && !isOffline;
  const placeholder = isOffline
    ? "Ask is off right now"
    : isSending
      ? "Sending…"
      : channel === "ask"
      ? "Ask about projects, meetings…"
      : pendingPrompt && pendingPrompt.body.length <= 40
        ? pendingPrompt.body
        : "Type your answer…";
  const bottomPad = isKeyboardOpen ? "0.625rem" : "max(0.625rem, env(safe-area-inset-bottom))";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isOffline && messages.length > 0 && <OfflineNotice />}

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) isPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={channel === "updates" ? "Updates" : "Ask conversation"}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 md:px-3"
      >
        {messages.length === 0 && !showThinking ? (
          <EmptyState channel={channel} isOffline={isOffline} />
        ) : (
          <div className="flex flex-col">
            {rows.map((row) =>
              row.kind === "day" ? (
                <DaySeparator key={row.key} label={row.label} />
              ) : (
                <ChatMessageBubble
                  key={row.key}
                  message={row.message}
                  isGroupStart={row.isGroupStart}
                  isGroupEnd={row.isGroupEnd}
                  isLocked={isSending}
                  pendingOptionId={pendingAnswer?.messageId === row.message.chatMessageId ? pendingAnswer.optionId : null}
                  onAnswer={(optionId) => handleAnswer(row.message.chatMessageId, optionId)}
                />
              ),
            )}
            {showThinking && <TypingIndicator />}
          </div>
        )}
      </div>

      {error && <ErrorLine error={error} onDismiss={clearError} />}

      {showInput ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="shrink-0 border-t border-border/60 px-3 pt-2.5 md:px-2.5 md:pt-2"
          style={{ paddingBottom: bottomPad }}
        >
          <div
            className={cn(
              "flex items-end gap-2 rounded-[1.375rem] border border-input bg-background py-1 pl-4 pr-1 transition-[border-color,box-shadow] duration-150 md:rounded-[1.125rem] md:pl-3",
              "focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/20",
              isOffline && "bg-muted/40",
            )}
          >
            <label htmlFor={inputId} className="sr-only">
              {channel === "ask" ? "Ask a question" : `Reply: ${pendingPrompt?.body ?? ""}`}
            </label>
            <textarea
              id={inputId}
              ref={textareaRef}
              rows={1}
              // While sending, the text already shows as the optimistic bubble
              // above; the draft itself is kept (and comes back on failure).
              value={isSending ? "" : draft}
              onChange={(e) => {
                onDraftChange(e.target.value);
                if (error) clearError();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={placeholder}
              enterKeyHint="send"
              autoComplete="off"
              // readOnly, not disabled: disabling the focused field drops the
              // phone keyboard mid-send. Typing is still blocked until it lands.
              readOnly={isSending}
              disabled={isOffline}
              aria-busy={isSending || undefined}
              // 16px on phones — anything smaller makes iOS Safari zoom in on focus.
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-base leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed md:min-h-8 md:py-1.5 md:text-sm md:leading-5"
            />
            <button
              type="submit"
              aria-label={isSending ? "Sending" : "Send"}
              disabled={!canSend}
              className={cn(
                // 40px circle, 48px hit area (the ::before) on phones.
                "relative mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground before:absolute before:-inset-1 before:content-[''] md:before:hidden",
                "transition-[opacity,transform] duration-150 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-25 md:h-8 md:w-8",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isSending && "disabled:opacity-60",
              )}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowUp className="h-[18px] w-[18px] md:h-4 md:w-4" strokeWidth={2.25} aria-hidden />
              )}
            </button>
          </div>
        </form>
      ) : (
        channel === "updates" &&
        // Empty list: the empty state already says it all.
        messages.length > 0 && (
          <p
            className="shrink-0 border-t border-border/60 px-4 pt-3 text-center text-xs text-muted-foreground"
            style={{ paddingBottom: `max(0.75rem, env(safe-area-inset-bottom))` }}
          >
            {hasOpenButtonPrompt(messages) ? "Tap a choice above to answer." : "Nothing to reply to right now."}
          </p>
        )
      )}
    </div>
  );
}

// ─── Panel chrome shared by the sheet and the desktop panel ─────────────

function ChatPanel({
  variant,
  titleId,
  activeTab,
  onTabChange,
  updates,
  ask,
  drafts,
  onDraftChange,
  onClose,
  isKeyboardOpen = false,
}: {
  variant: "sheet" | "panel";
  titleId: string;
  activeTab: ChatChannel;
  onTabChange: (tab: ChatChannel) => void;
  updates: ChatChannelState;
  ask: ChatChannelState;
  drafts: Record<ChatChannel, string>;
  onDraftChange: (channel: ChatChannel, value: string) => void;
  onClose: () => void;
  isKeyboardOpen?: boolean;
}) {
  const titleClass = "text-[15px] font-semibold leading-tight tracking-tight text-foreground md:text-sm";
  const askAvailable = ask.askAvailable;
  const subtitle =
    activeTab === "updates" ? "From your Plaud meetings" : askAvailable === false ? "Off right now" : "Projects, meetings, calendar";
  const statusDot =
    activeTab === "ask" && askAvailable !== null ? (askAvailable ? "bg-success" : "bg-muted-foreground/60") : null;

  // Keyboard up (or a very short window): drop the icon + subtitle so the
  // messages keep as much of the visible area as possible.
  const compact = isKeyboardOpen;
  const hideWhenCompact = cn(compact && "hidden", "[@media(max-height:560px)]:hidden");

  const tabClass =
    "h-full gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground data-[state=active]:shadow-none focus-visible:ring-offset-0 md:text-[13px]";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as ChatChannel)}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="chat-panel"
    >
      <div
        className={cn(
          "shrink-0 border-b border-border/60 px-4 pb-3 pt-3 md:px-3 md:pb-2.5",
          compact && "pb-2 pt-1.5",
          "[@media(max-height:560px)]:pb-2 [@media(max-height:560px)]:pt-1.5",
        )}
      >
        <div className="flex items-center gap-3 md:gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground md:h-8 md:w-8",
              hideWhenCompact,
            )}
          >
            <MessageCircle className="h-[18px] w-[18px] md:h-4 md:w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            {variant === "sheet" ? (
              // Radix wires its own id between Title and Content (and warns if
              // it can't find it), so no explicit id/aria-labelledby here.
              <DialogPrimitive.Title className={titleClass}>
                Chat
              </DialogPrimitive.Title>
            ) : (
              <h2 id={titleId} className={titleClass}>
                Chat
              </h2>
            )}
            <p className={cn("mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground", hideWhenCompact)}>
              {statusDot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot)} aria-hidden />}
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:-mr-1 md:h-8 md:w-8"
          >
            <X className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
          </button>
        </div>

        <TabsList
          className={cn(
            // 54px list (1px border + 4px padding each side) → 44px tap targets on phones.
            "mt-3 grid h-[3.375rem] w-full grid-cols-2 gap-1 rounded-full border border-border/70 bg-transparent p-1 md:mt-2.5 md:h-9",
            compact && "mt-1.5",
            "[@media(max-height:560px)]:mt-1.5",
          )}
        >
          <TabsTrigger value="updates" className={tabClass}>
            Updates
            <CountBadge count={updates.unreadCount} />
            {updates.unreadCount > 0 && <span className="sr-only">, {updates.unreadCount} unread</span>}
          </TabsTrigger>
          <TabsTrigger value="ask" className={tabClass}>
            Ask
            <CountBadge count={ask.unreadCount} />
            {ask.unreadCount > 0 && <span className="sr-only">, {ask.unreadCount} unread</span>}
          </TabsTrigger>
        </TabsList>
      </div>

      {(["updates", "ask"] as const).map((channel) => (
        <TabsContent
          key={channel}
          value={channel}
          // Radix keeps the inactive pane in the DOM with `hidden`; `flex`
          // would override that attribute, so hide it explicitly.
          className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=inactive]:hidden"
        >
          <ChatPane
            channel={channel}
            state={channel === "updates" ? updates : ask}
            draft={drafts[channel]}
            onDraftChange={(value) => onDraftChange(channel, value)}
            isKeyboardOpen={isKeyboardOpen}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function Launcher({
  isOpen,
  unread,
  onClick,
  compact,
  buttonRef,
}: {
  isOpen: boolean;
  unread: number;
  onClick: () => void;
  compact?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const label = isOpen ? "Close chat" : unread > 0 ? `Open chat, ${unread} unread` : "Open chat";
  const iconMotion = "absolute transition-[opacity,transform] duration-200 ease-sheet-in motion-reduce:transition-none";
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls={isOpen ? PANEL_ID : undefined}
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground",
        "shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] ring-1 ring-black/5",
        "transition-transform duration-200 ease-sheet-in hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        compact ? "h-[3.25rem] w-[3.25rem]" : "h-14 w-14",
      )}
    >
      <MessageCircle
        aria-hidden
        className={cn(iconMotion, "h-6 w-6", isOpen ? "-rotate-45 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")}
      />
      <X
        aria-hidden
        className={cn(iconMotion, "h-6 w-6", isOpen ? "rotate-0 scale-100 opacity-100" : "rotate-45 scale-50 opacity-0")}
      />
      {!isOpen && <CountBadge count={unread} className="absolute -right-1 -top-1 ring-2 ring-background" />}
    </button>
  );
}

// ─── Widget ─────────────────────────────────────────────────────────────

export function ChatWidget() {
  const { isOwner, isLoading } = useRoles();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatChannel>("updates");
  // Drafts live up here so switching tabs (which unmounts the other pane)
  // or closing the panel doesn't throw away a half-typed question.
  const [drafts, setDrafts] = useState<Record<ChatChannel, string>>({ updates: "", ask: "" });
  const launcherRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Poll both channels even while closed (background cadence) so the badge
  // total is right the moment the bubble renders, not only after opening.
  const updates = useChatChannel("updates", isOpen && activeTab === "updates");
  const ask = useChatChannel("ask", isOpen && activeTab === "ask");

  const viewportFit = useVisualViewportFit(isMobile && isOpen);

  if (isLoading || !isOwner) return null;

  const totalUnread = updates.unreadCount + ask.unreadCount;
  const onDraftChange = (channel: ChatChannel, value: string) => setDrafts((d) => ({ ...d, [channel]: value }));
  const panelProps = {
    titleId,
    activeTab,
    onTabChange: setActiveTab,
    updates,
    ask,
    drafts,
    onDraftChange,
  };

  if (isMobile) {
    const keyboardInset = viewportFit?.bottomInset ?? 0;
    const sheetStyle: CSSProperties = {
      bottom: keyboardInset,
      height: viewportFit
        ? `calc(${viewportFit.height}px - ${SHEET_TOP_GAP})`
        : `calc(100dvh - ${SHEET_TOP_GAP})`,
    };
    return (
      <>
        <div className="fixed z-40" style={{ bottom: SAFE_BOTTOM_MOBILE, right: SAFE_RIGHT_MOBILE }}>
          <Launcher isOpen={false} unread={totalUnread} onClick={() => setIsOpen(true)} compact buttonRef={launcherRef} />
        </div>
        <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
            <DialogPrimitive.Content
              ref={sheetRef}
              id={PANEL_ID}
              aria-describedby={undefined}
              tabIndex={-1}
              // Land focus on the sheet itself, not the first button — no
              // stray focus ring on the close button, no keyboard popping up.
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                sheetRef.current?.focus({ preventScroll: true });
              }}
              // A tap doesn't focus the launcher on touch browsers, so Radix
              // would hand focus back to <body>; send it to the bubble.
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                launcherRef.current?.focus({ preventScroll: true });
              }}
              style={sheetStyle}
              className={cn(
                "fixed inset-x-0 z-50 flex flex-col overflow-hidden rounded-t-[1.75rem] border-t border-border/60 bg-popover text-popover-foreground outline-none",
                "shadow-[0_-16px_48px_-12px_rgb(0_0_0/0.3)]",
                "transition-[height,bottom] duration-200 ease-sheet-in motion-reduce:transition-none",
                // Gated in JS: a `motion-reduce:` utility loses to the more
                // specific data-[state] animation classes.
                !reduceMotion &&
                  "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300",
                !reduceMotion &&
                  "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200",
              )}
            >
              <ChatPanel
                variant="sheet"
                {...panelProps}
                onClose={() => setIsOpen(false)}
                isKeyboardOpen={keyboardInset > 80}
              />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </>
    );
  }

  const close = () => {
    setIsOpen(false);
    launcherRef.current?.focus();
  };

  return (
    // column-reverse: the launcher comes first in tab order, so Tab from it
    // walks straight into the open panel sitting visually above it.
    <div className="fixed z-40 flex flex-col-reverse items-end gap-3" style={{ bottom: SAFE_BOTTOM, right: SAFE_RIGHT }}>
      <Launcher isOpen={isOpen} unread={totalUnread} onClick={() => setIsOpen((v) => !v)} buttonRef={launcherRef} />
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            id={PANEL_ID}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 34 }}
            style={{ transformOrigin: "bottom right" }}
            className="flex h-[min(560px,calc(100dvh-11rem))] w-[380px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover text-popover-foreground shadow-[0_24px_64px_-16px_rgb(0_0_0/0.28),0_2px_8px_-2px_rgb(0_0_0/0.08)]"
          >
            <ChatPanel variant="panel" {...panelProps} onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
