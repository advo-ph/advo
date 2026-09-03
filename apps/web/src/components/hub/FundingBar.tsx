import { Panel } from "@/components/admin/_ui";

interface FundingBarProps {
  totalCents: number;
  paidCents: number;
  /** The price before a discount, when there was one; total is what is actually owed. */
  listCents?: number | null;
  discountCents?: number;
  discountReason?: string | null;
}

const FundingBar = ({ totalCents, paidCents, listCents = null, discountCents = 0, discountReason = null }: FundingBarProps) => {
  const percentage = totalCents > 0 ? Math.round((paidCents / totalCents) * 100) : 0;

  const formatCurrency = (cents: number) => {
    return "₱" + (cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  };

  return (
    <Panel title="Funding" meta={`${percentage}%`}>
      <div className="p-4 space-y-3">
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">
            Paid <span className="text-foreground tabular-nums">{formatCurrency(paidCents)}</span>
          </span>
          <span className="text-muted-foreground">
            Total <span className="text-foreground tabular-nums">{formatCurrency(totalCents)}</span>
          </span>
        </div>
        {listCents != null && discountCents > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            List {formatCurrency(listCents)} less {formatCurrency(discountCents)}
            {discountReason ? ` (${discountReason})` : ""} discount
          </p>
        )}
      </div>
    </Panel>
  );
};

export default FundingBar;
