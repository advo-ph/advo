/**
 * Chat widget data layer — one channel at a time (Updates or Ask).
 *
 * No "unread" table: unread is computed client-side against a per-channel
 * `localStorage` "last seen" marker (single-owner chat, per-browser unread
 * is acceptable — matches the plan's §3.1). The marker is the highest-seen
 * `chatMessageId`, not a timestamp — ids are assigned by the server in
 * strictly increasing order, so comparing against them can't be thrown off
 * by the browser's clock being wrong relative to the server's (a stale local
 * clock previously made the badge stick at a stale count, or clear
 * immediately, depending on which way the skew ran).
 *
 * Polling cadence follows the widget shell: 20s for the open channel, 60s
 * for the background one, driven by the `active` flag the caller passes in.
 *
 * Returned shape (what ChatWidget/ChatPane build on):
 *   messages      — this channel's rows, oldest-first, with any in-flight
 *                    optimistic owner message appended at the end.
 *   unreadCount    — 0 while `active` is true, by construction.
 *   markSeen       — call when the panel/tab opens.
 *   sendText       — owner free text; resolves once the server round trip
 *                    (which can be 10s+ on the Ask channel) finishes.
 *   answer         — owner button tap.
 *   isSending      — true for the duration of the current sendText/answer
 *                    call; use it to show a "thinking" placeholder and to
 *                    disable the input/buttons against double-submit.
 *   error          — the last sendText/answer failure's message, or null.
 *                    Cleared automatically at the start of the next attempt.
 *   askAvailable   — null until the first successful fetch; after that,
 *                    whether ANTHROPIC_API_KEY is configured server-side
 *                    (only meaningful for the 'ask' channel, but harmless to
 *                    read for 'updates' too — same field either way).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";

export type ChatOption = { id: string; label: string; style?: "primary" | "default" | "danger" };
export type ChatChannel = "updates" | "ask";

export type ChatMessage = {
  chatMessageId: number;
  channel: ChatChannel;
  sender: "bot" | "owner";
  sentByUserId: number | null;
  body: string;
  inputMode: "none" | "buttons" | "text";
  options: ChatOption[] | null;
  answeredOptionId: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
};

type ChatListResult = { messages: ChatMessage[]; askAvailable: boolean | null };

const ACTIVE_POLL_MS = 20_000;
const BACKGROUND_POLL_MS = 60_000;

function lastSeenKey(channel: ChatChannel): string {
  return `advo_chat_last_seen_id_${channel}`;
}

/** Safari private mode throws on localStorage access — degrade, don't crash. */
function readLastSeenId(channel: ChatChannel): number {
  try {
    const raw = localStorage.getItem(lastSeenKey(channel));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function writeLastSeenId(channel: ChatChannel, id: number): void {
  try {
    localStorage.setItem(lastSeenKey(channel), String(id));
  } catch {
    /* Storage unavailable — unread badge just won't persist across reloads. */
  }
}

export function useChatChannel(channel: ChatChannel, active: boolean) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["chat", channel] as const, [channel]);

  const { data } = useQuery({
    queryKey,
    queryFn: async (): Promise<ChatListResult> => {
      const res = await get<ChatMessage[]>(`/api/chat/messages?channel=${channel}`);
      // askAvailable rides alongside {data, error} — additive, not part of
      // that envelope's contract, so it's read off the raw response rather
      // than typed into ApiResponse<T>.
      const askAvailable = (res as unknown as { askAvailable?: boolean }).askAvailable ?? null;
      return { messages: res.data ?? [], askAvailable };
    },
    refetchInterval: active ? ACTIVE_POLL_MS : BACKGROUND_POLL_MS,
  });

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const askAvailable = data?.askAvailable ?? null;

  const highestId = messages.length > 0 ? messages[messages.length - 1].chatMessageId : 0;

  // While this channel is the open, active one, the badge is always 0 by
  // construction — not "eventually 0 once an effect settles" — so there is
  // no render where a stale localStorage read can flash a nonzero count.
  // Last-seen still advances underneath it (below) so that switching away
  // or closing the panel doesn't resurrect messages seen while active.
  const unreadCount = active
    ? 0
    : messages.filter((m) => m.sender === "bot" && m.chatMessageId > readLastSeenId(channel)).length;

  useEffect(() => {
    if (active && highestId > 0) writeLastSeenId(channel, highestId);
  }, [active, channel, highestId]);

  const markSeen = useCallback(() => {
    writeLastSeenId(channel, highestId);
    // Re-render immediately so the badge clears without waiting for the next poll.
    queryClient.invalidateQueries({ queryKey });
  }, [channel, highestId, queryClient, queryKey]);

  const refresh = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // One in-flight send/answer at a time per channel — both the optimistic
  // bubble and the error line key off this same state.
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<ChatMessage | null>(null);
  const optimisticIdRef = useRef(-1);

  const sendText = useCallback(
    async (body: string) => {
      setError(null);
      setIsSending(true);
      // Shown immediately so the owner isn't staring at a blank panel for the
      // 10s+ an Ask round trip can take — replaced by the real row once the
      // POST resolves and `refresh()` brings the authoritative list back.
      setOptimistic({
        chatMessageId: optimisticIdRef.current--,
        channel,
        sender: "owner",
        sentByUserId: null,
        body,
        inputMode: "none",
        options: null,
        answeredOptionId: null,
        context: null,
        createdAt: new Date().toISOString(),
      });
      try {
        const res = await post<ChatMessage>("/api/chat/messages", { channel, body });
        if (res.error) throw new Error(res.error);
        await refresh();
        return res;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't send. Try again.");
        throw err;
      } finally {
        setIsSending(false);
        setOptimistic(null);
      }
    },
    [channel, refresh],
  );

  const answer = useCallback(
    async (messageId: number, optionId: string) => {
      setError(null);
      setIsSending(true);
      try {
        const res = await post<ChatMessage>(`/api/chat/messages/${messageId}/answer`, { optionId });
        if (res.error) throw new Error(res.error);
        await refresh();
        return res;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't send. Try again.");
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [refresh],
  );

  const clearError = useCallback(() => setError(null), []);

  const displayMessages = useMemo(
    () => (optimistic ? [...messages, optimistic] : messages),
    [messages, optimistic],
  );

  return { messages: displayMessages, unreadCount, markSeen, sendText, answer, isSending, error, clearError, askAvailable };
}
