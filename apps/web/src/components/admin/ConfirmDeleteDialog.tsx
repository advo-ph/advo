import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The step between clicking Delete and the row being gone.
 *
 * The schedule, calendar and availability pages all deleted on the first click, and all
 * three did it optimistically: the row left the screen before the server was asked. A
 * mis-click on a small icon button destroyed a record with no prompt, no undo, and no
 * visible trace that anything had happened.
 *
 * `name` is shown so the prompt says which record. "Delete this block?" is a question
 * nobody can answer correctly when four blocks are stacked in the same cell.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  name,
  noun = "item",
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  name?: string | null;
  noun?: string;
  detail?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            {name ? <span className="font-medium text-foreground">{name}</span> : `This ${noun}`}
            {" will be deleted. This cannot be undone."}
            {detail ? ` ${detail}` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDeleteDialog;
