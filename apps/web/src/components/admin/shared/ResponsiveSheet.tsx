import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

/**
 * One popup, two shapes: a bottom sheet on phones, a centred dialog on wider screens.
 *
 * Every admin popup that should feel native on a phone goes through here, so the handle,
 * corners, padding and motion are defined once and two sheets cannot drift apart.
 *
 * Motion: the sheet slides up in 200ms on an ease-out curve and leaves in 150ms on an
 * ease-in curve. The stock sheet took 500ms, which read as lag on every tap.
 * prefers-reduced-motion drops the slide (and the dialog's zoom) entirely.
 */
export const MOBILE_SHEET_CLASS = cn(
  "flex max-h-[90dvh] flex-col gap-0 rounded-t-2xl border-border bg-card p-0 focus:outline-none",
  "data-[state=open]:duration-200 data-[state=open]:ease-sheet-in",
  "data-[state=closed]:duration-150 data-[state=closed]:ease-sheet-out",
  // !important: data-[state=open]:animate-in is more specific than a plain motion-reduce class.
  "motion-reduce:!animate-none",
  // The built-in close button: a 40px target, centred on the title row.
  "[&>button:last-child]:right-2 [&>button:last-child]:top-5 [&>button:last-child]:p-3",
);

interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling body on phones, so Save never scrolls out of reach. */
  footer?: ReactNode;
  /** Width and surface for the desktop dialog, e.g. "max-w-md". */
  desktopClassName?: string;
  testId?: string;
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  desktopClassName,
  testId,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          data-testid={testId}
          className={MOBILE_SHEET_CLASS}
          // Focus the sheet itself, not its first field: on a phone, focusing a select or
          // input on open pops the keyboard or picker before the person has read the sheet.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          <div className="shrink-0 px-4 pb-3 pt-2.5">
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <SheetTitle className="pr-10 text-base font-semibold">{title}</SheetTitle>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4",
              footer ? "pb-4" : "pb-[calc(1rem_+_env(safe-area-inset-bottom))]",
            )}
          >
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-border px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3">
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        data-testid={testId}
        className={cn("rounded-lg border-border bg-card motion-reduce:!animate-none", desktopClassName ?? "max-w-lg")}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
