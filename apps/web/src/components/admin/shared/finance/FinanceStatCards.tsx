/**
 * FinanceStatCards — 4-stat header row for the project Finance tab.
 *
 * Cards (left to right):
 *   Total Value  |  Collected  |  Outstanding  |  Recurring Fees
 *
 * Total Value: comes from the project's signed contract file (falls back to
 * final, then to project.total_value_cents).
 *
 * Collected: sum of paid invoice files + sum of paid recurring invoice files.
 * Two sub-lines below the main figure show the breakdown.
 *
 * Outstanding: Total Value minus Collected.
 *
 * Recurring Fees: shows billing status text for the active recurring fee.
 */

import { formatCurrency } from "@/types/admin";
import { StatStrip, Stat } from "@/components/admin/_ui";

// ─── Types ────────────────────────────────────────────

export interface ContractFileForStat {
  contractFileId: number;
  status: string;
  /** total_cents from the contract file row */
  totalCents?: number | null;
}

export interface InvoiceFileForStat {
  invoiceFileId: number;
  paidStatus: string;
  totalCents: number | null;
  recurringFeeId: number | null;
}

export interface RecurringFeeForStat {
  recurringFeeId: number;
  status: string;
  amountCents: number;
  startsOn: string;
  /** derived.nextRunOn from /api/recurring-fee */
  nextRunOn?: string;
  derived?: {
    nextRunOn?: string;
  };
}

// ─── Helpers ──────────────────────────────────────────

function pesos(cents: number) {
  return formatCurrency(cents);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Read total value from contract files (Signed first, then Final). */
function contractTotalCents(
  contractFiles: ContractFileForStat[],
  projectFallback: number,
): number {
  const signed = contractFiles.find((f) => f.status === "signed");
  if (signed?.totalCents != null) return signed.totalCents;
  const final = contractFiles.find((f) => f.status === "final");
  if (final?.totalCents != null) return final.totalCents;
  return projectFallback;
}

/** Recurring fee status text for the Recurring Fees card. */
function recurringStatusText(fees: RecurringFeeForStat[]): string {
  const active = fees.find((f) => f.status === "active");
  if (!active) {
    // Check if any fee at all exists
    if (fees.length === 0) return "Billing Not Started";
    // If only paused/cancelled
    const paused = fees.find((f) => f.status === "paused");
    if (paused) return "Billing Paused";
    return "Billing Cancelled";
  }

  const nextRunOn = active.derived?.nextRunOn ?? active.nextRunOn;
  if (!nextRunOn) return "Billing Active";

  const next = new Date(nextRunOn);
  const now = new Date();

  if (next < now) {
    return `Overdue Billing on ${formatDate(nextRunOn)}`;
  }
  return `Next Billing on ${formatDate(nextRunOn)}`;
}

// ─── Component ────────────────────────────────────────

/**
 * Two usage modes:
 *
 * 1. Project-level (Phase 7): pass projectTotalValueCents + contractFiles +
 *    invoiceFiles + recurringFees. Renders 4 cards including the recurring fee
 *    status.
 *
 * 2. Global summary (Phase 9): pass summary with pre-computed totals from
 *    GET /api/finance/summary. Renders 3 cards (Total Value, Collected,
 *    Outstanding). No recurring-fees card — that is project-specific.
 */
export interface FinanceSummary {
  totalValueCents: number;
  collectedCents: number;
  outstandingCents: number;
}

interface FinanceStatCardsPropsProject {
  summary?: undefined;
  projectTotalValueCents: number;
  contractFiles: ContractFileForStat[];
  invoiceFiles: InvoiceFileForStat[];
  recurringFees: RecurringFeeForStat[];
}

interface FinanceStatCardsPropsSummary {
  summary: FinanceSummary;
  projectTotalValueCents?: undefined;
  contractFiles?: undefined;
  invoiceFiles?: undefined;
  recurringFees?: undefined;
}

type FinanceStatCardsProps = FinanceStatCardsPropsProject | FinanceStatCardsPropsSummary;

export function FinanceStatCards(props: FinanceStatCardsProps) {
  // Global summary mode
  if (props.summary !== undefined) {
    const { totalValueCents, collectedCents, outstandingCents } = props.summary;
    return (
      <StatStrip cols={3}>
        <Stat label="Total value" value={pesos(totalValueCents)} />
        <Stat label="Collected" value={pesos(collectedCents)} />
        <Stat label="Outstanding" value={pesos(outstandingCents)} />
      </StatStrip>
    );
  }

  // Project-level mode (Phase 7)
  const {
    projectTotalValueCents,
    contractFiles,
    invoiceFiles,
    recurringFees,
  } = props;

  const totalValueCents = contractTotalCents(contractFiles, projectTotalValueCents);

  // Project invoices collected = paid invoice files that are NOT linked to recurring fee
  const projectInvoicePaidCents = invoiceFiles
    .filter((f) => f.paidStatus === "paid" && f.recurringFeeId == null)
    .reduce((sum, f) => sum + (f.totalCents ?? 0), 0);

  // Recurring invoices collected = paid invoice files that ARE linked to recurring fee
  const recurringPaidCents = invoiceFiles
    .filter((f) => f.paidStatus === "paid" && f.recurringFeeId != null)
    .reduce((sum, f) => sum + (f.totalCents ?? 0), 0);

  const collectedCents = projectInvoicePaidCents + recurringPaidCents;
  const outstandingCents = Math.max(0, totalValueCents - collectedCents);

  const recurringText = recurringFees.length === 0
    ? "Billing Not Started"
    : recurringStatusText(recurringFees);

  return (
    <StatStrip cols={4}>
      <Stat label="Total value" value={pesos(totalValueCents)} />
      <Stat
        label="Collected"
        value={pesos(collectedCents)}
        sub={`Invoices ${pesos(projectInvoicePaidCents)} · Recurring ${pesos(recurringPaidCents)}`}
      />
      <Stat label="Outstanding" value={pesos(outstandingCents)} />
      {/* Recurring fees card — status text uses a smaller size to fit long date strings */}
      <div className="bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground mb-1.5">Recurring fees</p>
        <p className="text-base font-semibold leading-snug">
          {recurringText}
        </p>
      </div>
    </StatStrip>
  );
}

export default FinanceStatCards;
