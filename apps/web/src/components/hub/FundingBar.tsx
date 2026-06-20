import { Panel } from "@/components/admin/_ui";

interface FundingBarProps {
  totalCents: number;
  paidCents: number;
}

const FundingBar = ({ totalCents, paidCents }: FundingBarProps) => {
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
      </div>
    </Panel>
  );
};

export default FundingBar;
