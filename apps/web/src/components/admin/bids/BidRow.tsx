import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Bid } from "@/hooks/useBids";
import { WIN_DOT, WIN_LABEL, hasPreBidAhead, peso, shortDateTime } from "./bid-format";

/** Odds as a dot and a word. "Not rated" when nobody (team or model) has judged it yet. */
export const Odds = ({ bid, className }: { bid: Pick<Bid, "win">; className?: string }) => (
  <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
    <span
      className={cn(
        "h-2 w-2 rounded-full shrink-0",
        bid.win ? WIN_DOT[bid.win] : "border border-muted-foreground/60",
      )}
    />
    {bid.win ? WIN_LABEL[bid.win] : "Not rated"}
  </span>
);

/** "Tomorrow, 9:00 AM", "Passed" or "None": the pre-bid in one short phrase. */
export function preBidText(bid: Bid, now = new Date()): string {
  if (!bid.preBidAt) return "None";
  return hasPreBidAhead(bid, now) ? shortDateTime(bid.preBidAt) : "Passed";
}

/** Column heads for the desktop list; the columns match BidRow below. */
export const BidListHead = () => (
  <div className="sticky top-0 z-10 hidden sm:flex items-center gap-4 px-4 h-9 border-b border-border bg-card text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
    <span className="flex-1">Bid</span>
    <span className="w-20 text-right">Budget</span>
    <span className="w-32">Pre-bid</span>
    <span className="w-32">Bids due</span>
    <span className="w-20">Odds</span>
    <span className="w-4" />
  </div>
);

/**
 * The one row every bid list on the page uses: what, who, budget, pre-bid, deadline,
 * odds. Desktop lays it out as columns under BidListHead; a phone stacks it in short lines.
 */
const BidRow = ({ bid, onOpen, isNew }: { bid: Bid; onOpen: (bid: Bid) => void; isNew?: boolean }) => {
  const pre = preBidText(bid);
  const due = bid.dueAt ? shortDateTime(bid.dueAt) : "—";
  return (
    <button
      type="button"
      onClick={() => onOpen(bid)}
      className="group w-full text-left flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:bg-secondary/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug line-clamp-2">
          {bid.title}
          {isNew && (
            <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-accent-ink">New</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {bid.buyer}
          {bid.place ? ` · ${bid.place}` : ""}
        </p>
        {/* Phone: the columns fold into two quiet lines. */}
        <div className="mt-1.5 space-y-1 text-xs text-muted-foreground sm:hidden">
          <p className="flex flex-wrap items-center gap-x-3">
            <Odds bid={bid} />
            <span className="tabular-nums text-foreground">{peso(bid.abc)}</span>
          </p>
          <p>
            Pre-bid {pre === "None" ? "none" : pre === "Passed" ? "passed" : pre} · Due {due}
          </p>
        </div>
      </div>
      <span className="hidden sm:block w-20 shrink-0 text-right text-sm tabular-nums">{peso(bid.abc)}</span>
      <span className={cn("hidden sm:block w-32 shrink-0 text-xs tabular-nums", pre === "Passed" || pre === "None" ? "text-muted-foreground" : "")}>
        {pre}
      </span>
      <span className="hidden sm:block w-32 shrink-0 text-xs tabular-nums">{due}</span>
      <Odds bid={bid} className="hidden sm:inline-flex w-20 shrink-0" />
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
    </button>
  );
};

export default BidRow;
