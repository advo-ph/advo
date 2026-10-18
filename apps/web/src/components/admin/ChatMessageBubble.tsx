/**
 * One chat turn, in one of three shapes (§6.2 of the plan):
 *   1. Plain      — body only.
 *   2. Buttons    — body + a row of options. Once answered, the picked one
 *      is highlighted (with a check) and the rest dim; never tappable again.
 *   3. Text prompt — body only, rendered the same as plain; the normal text
 *      input below is the reply (handled by the parent).
 *
 * Owner turns are the monochrome primary fill (ink in light mode, white in
 * dark), bot turns sit on `muted` — ADVO orange stays reserved for unread
 * badges and focus, per the admin design language in `_ui.tsx`.
 *
 * Grouping is decided by the parent (ChatWidget): consecutive turns from the
 * same sender close together, and only the last one in a run gets the tail
 * corner and the timestamp, so a burst of updates reads as one block.
 */
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatOption } from "@/hooks/useChat";

/** "9:41 PM" in the owner's locale. */
function formatChatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// http(s) only — never `javascript:` — and a URL never ends on sentence
// punctuation, so "see https://advo.ph." links the site, not the full stop.
const URL_PATTERN = /(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]}])/g;

function renderBody(body: string): ReactNode[] {
  return body.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-sm underline decoration-1 underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function OptionButton({
  option,
  isPicked,
  isAnswered,
  isPending,
  isLocked,
  onSelect,
}: {
  option: ChatOption;
  isPicked: boolean;
  isAnswered: boolean;
  isPending: boolean;
  isLocked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={isAnswered || isLocked}
      aria-pressed={isAnswered ? isPicked : undefined}
      aria-busy={isPending || undefined}
      onClick={onSelect}
      className={cn(
        // ≥40px tall on phones (thumb), 32px on desktop (pointer). Long project
        // names wrap inside the pill instead of pushing the row off-screen.
        "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-[1.25rem] border px-4 py-2 text-left text-sm font-medium leading-snug md:min-h-8 md:rounded-full md:px-3 md:py-1 md:text-[13px]",
        "transition-[background-color,border-color,color,opacity,transform] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        "enabled:active:scale-[0.97] disabled:cursor-default",
        // In flight: same width (no icon swap, so the row doesn't reflow), pulsing.
        isPending
          ? "border-foreground/30 bg-muted text-foreground motion-safe:animate-pulse"
          : isPicked
          ? "border-primary bg-primary text-primary-foreground"
          : isAnswered
            ? "border-border bg-transparent text-muted-foreground opacity-50"
            : option.style === "primary"
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : option.style === "danger"
                ? "border-border bg-popover text-danger hover:border-danger/40 hover:bg-danger/10"
                : "border-border bg-popover text-foreground hover:border-foreground/25 hover:bg-muted",
        isLocked && !isPending && !isAnswered && "opacity-60",
      )}
    >
      {isPicked && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
      <span className="[overflow-wrap:anywhere]">{option.label}</span>
    </button>
  );
}

export function ChatMessageBubble({
  message,
  onAnswer,
  isGroupStart = true,
  isGroupEnd = true,
  pendingOptionId = null,
  isLocked = false,
}: {
  message: ChatMessage;
  onAnswer: (optionId: string) => void;
  /** First turn of a same-sender run — gets the wider gap above it. */
  isGroupStart?: boolean;
  /** Last turn of a same-sender run — gets the tail corner and the time. */
  isGroupEnd?: boolean;
  /** The option whose answer is in flight, shown pulsing. */
  pendingOptionId?: string | null;
  /** True while any send/answer on this channel is in flight. */
  isLocked?: boolean;
}) {
  const isOwner = message.sender === "owner";
  // useChat's optimistic owner bubble carries a negative id until the real row lands.
  const isOptimistic = message.chatMessageId < 0;
  const options =
    message.inputMode === "buttons" && message.options && message.options.length > 0 ? message.options : null;
  const isAnswered = Boolean(message.answeredOptionId);
  const time = isOptimistic ? "Sending…" : formatChatTime(message.createdAt);

  return (
    <div className={cn("flex flex-col", isOwner ? "items-end" : "items-start", isGroupStart ? "mt-4 first:mt-0" : "mt-1")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[1.125rem] px-3.5 py-2 text-[15px] leading-[1.45] md:px-3 md:py-1.5 md:text-sm md:leading-normal",
          "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          isOwner ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          isGroupEnd && !options && (isOwner ? "rounded-br-md" : "rounded-bl-md"),
          isOptimistic && "opacity-70",
        )}
      >
        {renderBody(message.body)}
      </div>

      {options && (
        <div role="group" aria-label="Choose an answer" className="mt-2 flex max-w-full flex-wrap gap-2 md:gap-1.5">
          {options.map((option) => (
            <OptionButton
              key={option.id}
              option={option}
              isPicked={message.answeredOptionId === option.id}
              isAnswered={isAnswered}
              isPending={pendingOptionId === option.id}
              isLocked={isLocked}
              onSelect={() => onAnswer(option.id)}
            />
          ))}
        </div>
      )}

      {(isGroupEnd || options) && time && (
        <span className="mt-1 px-1 text-[11px] leading-4 tabular-nums text-muted-foreground/80">{time}</span>
      )}
    </div>
  );
}
