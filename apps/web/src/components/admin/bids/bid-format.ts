import type { Bid, BidWin } from "@/hooks/useBids";

/** Every date on the Bids page is Manila time, whatever the viewer's clock says. */
const TZ = "Asia/Manila";

export function peso(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000_000) return `₱${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
  return `₱${Math.round(n / 1000)}k`;
}

/** "2026-10-29" in Manila, for grouping by day. */
export function manilaDay(at: string | Date): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function dayLabel(at: string | Date, now = new Date()): string {
  const d = manilaDay(at);
  if (d === manilaDay(now)) return "Today";
  if (d === manilaDay(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return new Date(at).toLocaleDateString("en-PH", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
}

export function timeLabel(at: string | Date): string {
  return new Date(at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

/** "Tomorrow, 9:00 AM" / "Nov 10, 9:00 AM": short enough for a list column. */
export function shortDateTime(at: string | Date, now = new Date()): string {
  const d = manilaDay(at);
  const day =
    d === manilaDay(now)
      ? "Today"
      : d === manilaDay(new Date(now.getTime() + 86_400_000))
        ? "Tomorrow"
        : new Date(at).toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: TZ });
  return `${day}, ${timeLabel(at)}`;
}

export function dateTime(at: string | Date | null): string {
  if (!at) return "—";
  return `${dayLabel(at)}, ${timeLabel(at)}`;
}

export const WIN_LABEL: Record<BidWin, string> = { good: "Good", fair: "Fair", low: "Low" };
export const WIN_ORDER: (BidWin | null)[] = ["good", "fair", "low", null];

/** One small dot per odds level. Dots only — never a coloured bar or a filled card. */
export const WIN_DOT: Record<BidWin, string> = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  low: "bg-muted-foreground/50",
};

export function hasPreBidAhead(b: Bid, now = new Date()): boolean {
  return !!b.preBidAt && new Date(b.preBidAt) >= now;
}

/** The next thing to do on a bid: its pre-bid if one is ahead, else its deadline. */
export function nextStep(b: Bid, now = new Date()): { label: string; at: string | null } {
  if (hasPreBidAhead(b, now)) return { label: "Pre-bid", at: b.preBidAt };
  return { label: "Bids due", at: b.dueAt };
}

export const NOTICE_URL = "https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/PrintableBidNoticeAbstractUI.aspx?refid=";
