import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProposeTaskResult } from "@/hooks/useMeeting";

const viaLabel = (method: ProposeTaskResult["method"]) =>
  method === "ai" ? "Claude" : method === "note" ? "Plaud note" : "heuristic";

export function MeetingTaskPreview({
  proposal,
  isConfirming,
  onClose,
  onConfirm,
}: {
  proposal: ProposeTaskResult | null;
  isConfirming: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const task = proposal?.task ?? [];
  const assigned = task.filter((t) => t.assignedTo != null).length;

  return (
    <Dialog open={proposal != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm deliverable</DialogTitle>
        </DialogHeader>
        {proposal && (
          <p className="text-xs text-muted-foreground">
            {task.length} item{task.length === 1 ? "" : "s"} via {viaLabel(proposal.method)}
            {" · "}
            {assigned} assigned
          </p>
        )}
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {task.map((t, i) => (
            <li
              key={`${t.title}-${i}`}
              className="rounded-md border border-border bg-secondary/20 px-3 py-2"
            >
              <p className="text-sm font-medium">{t.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.assigneeName ?? t.ownerRaw ?? "Unassigned"}
                {" · "}
                {t.suggestedSkill}
              </p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-9" onClick={onClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={onConfirm}
            disabled={isConfirming || task.length === 0}
          >
            {isConfirming && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create {task.length} deliverable{task.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
