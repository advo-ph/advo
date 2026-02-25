import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface FundingBarProps {
  totalCents: number;
  paidCents: number;
}

const FundingBar = ({ totalCents, paidCents }: FundingBarProps) => {
  const percentage = totalCents > 0 ? Math.round((paidCents / totalCents) * 100) : 0;
  
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-6 bg-card border border-border rounded-xl shadow-card"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project Funding</span>
        <span className="font-semibold text-sm text-accent">{percentage}%</span>
      </div>
      
      <Progress value={percentage} className="h-2 mb-4" />
      
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Paid: <span className="text-foreground font-mono">{formatCurrency(paidCents)}</span>
        </span>
        <span className="text-muted-foreground">
          Total: <span className="text-foreground font-mono">{formatCurrency(totalCents)}</span>
        </span>
      </div>
    </motion.div>
  );
};

export default FundingBar;
