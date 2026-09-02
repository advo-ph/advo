import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Panel, Empty } from "@/components/admin/_ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useProjectThread } from "@/hooks/useProjectThread";

interface ProjectThreadProps {
  projectId: number;
  /** Panel heading; the client reads "Messages", the team reads "Client thread". */
  title?: string;
}

/**
 * The conversation about one project, on the project.
 *
 * Same component on both sides: the client's hub and the admin command
 * center mount it against the same endpoint, so what the client wrote is what
 * the team reads, with nothing lost to a Viber thread in between. Whose side
 * a message is on comes from the author role, never from the caller.
 */
const ProjectThread = ({ projectId, title = "Messages" }: ProjectThreadProps) => {
  const { user } = useAuth();
  const { message, isLoading, send, isSending, markRead } = useProjectThread(projectId);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const isClientSide = user?.role === "client";

  // Opening the thread reads it. Keyed on the last message id so a poll that
  // brings a new message marks that one read too, while nothing re-fires on
  // every 20-second tick when nothing changed.
  const lastId = message[message.length - 1]?.projectMessageId;
  useEffect(() => {
    if (lastId != null) markRead();
  }, [lastId, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lastId]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    await send(body);
    setDraft("");
  };

  return (
    <Panel title={title} meta={message.length > 0 ? `${message.length}` : undefined}>
      <div className="max-h-96 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading && message.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : message.length === 0 ? (
          <Empty
            text={
              isClientSide
                ? "Ask anything about the project here. The team replies on this page and by email."
                : "Nothing from the client yet. Anything you write here reaches them by email too."
            }
          />
        ) : (
          message.map((row) => {
            const isMine = row.authorUserId === user?.userId;
            const isOurSide = isClientSide ? row.authorRole === "client" : row.authorRole !== "client";
            return (
              <div key={row.projectMessageId} className={`flex ${isOurSide ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    isOurSide ? "bg-accent/[0.12] text-foreground" : "bg-secondary/60 text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{row.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {isMine ? "You" : row.authorName}
                    {" · "}
                    {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={isClientSide ? "Write to the team…" : "Reply to the client…"}
          rows={2}
          maxLength={4000}
          className="min-h-0 resize-none"
        />
        <Button
          type="submit"
          size="sm"
          disabled={isSending || !draft.trim()}
          className="h-9 rounded-md bg-accent text-accent-foreground hover:bg-accent/90"
          aria-label="Send"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </Panel>
  );
};

export default ProjectThread;
