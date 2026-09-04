/**
 * Bookkeeping export — three tables a bookkeeper can already use, in a shape they can
 * actually open.
 *
 * No migration, no new table, almost no new logic. `expense` (005), `invoice` (001 +
 * 017), `commission_share` (018) and `payment_intent` (022) between them already hold
 * everything a Philippine bookkeeper asks for at filing time. What was missing was a way
 * to get it out of Postgres without someone writing SQL, so the answer to "send me your
 * books" was a screenshot of an admin table.
 *
 * ─── Why CSV, and why these four sheets ───────────────────────────────────────
 *
 * CSV because that is what opens in Excel and in every accounting package a PH SMB
 * bookkeeper actually runs. Not XLSX: it would add a dependency to emit a format whose
 * only advantage here is column widths.
 *
 *   revenue      — invoices raised in the period, with how they were settled. Recurring
 *                  rows are MARKED, not excluded: the bookkeeper needs them, even though
 *                  017 excludes them from project contract-value maths.
 *   expense      — the expense ledger, with the reimbursable flag DERIVED (005 never
 *                  stored it) and the receipt reference a filing needs.
 *   commission   — what was paid out to whom under the 60/25/15 split, from FINALIZED
 *                  plans only. A draft plan's amounts are derived on read and are not a
 *                  liability yet.
 *   summary      — the four totals, so a mismatch is visible at the top of the file
 *                  rather than discovered by summing 400 rows.
 *
 * ─── The one thing this deliberately does NOT do ──────────────────────────────
 *
 * It does not compute tax. No VAT, no percentage tax, no 2307 withholding figure. Every
 * one of those depends on ADVO's registration type, which is question 2 in
 * ASK-IDENTITY.md and is STILL OPEN as of 2026-09-02 — the merchant identity facts have
 * not come back. A tax figure computed against a guessed registration type is worse than
 * no figure, because a bookkeeper will file it.
 *
 * What the export does instead is emit the fields a 2307 is prepared FROM — gross amount,
 * date, counterparty, purpose — and say plainly in the summary sheet that the
 * classification is the bookkeeper's call. That is honest, and it is genuinely useful.
 *
 * ─── CSV escaping ─────────────────────────────────────────────────────────────
 *
 * `csvCell` is not a formality. Expense purposes are free text typed by humans and
 * contain commas, quotes and newlines routinely; one unescaped comma shifts every
 * subsequent column in that row and the error looks like a data problem rather than a
 * formatting one. It is also why the leading-character guard exists: a purpose beginning
 * `=` or `+` is executed as a formula by Excel on open, which is a real injection route
 * into a bookkeeper's machine.
 */
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  client,
  commissionPlan,
  commissionShare,
  expense,
  invoice,
  paymentIntent,
  project,
  teamMember,
  user,
} from "../db/schema.js";

export const EXPORT_SHEET = ["revenue", "expense", "commission", "summary"] as const;
export type ExportSheet = (typeof EXPORT_SHEET)[number];

// ─── CSV primitives ──────────────────────────────────

/**
 * Characters Excel and Sheets interpret as the start of a formula. A cell beginning with
 * one is prefixed with a single quote, which renders identically and executes as nothing.
 */
const FORMULA_LEAD = ["=", "+", "-", "@", "\t", "\r"];

/**
 * One CSV cell: escaped, quoted when it has to be, and neutered against formula
 * injection.
 *
 * null and undefined become an EMPTY cell, never the string "null" — a bookkeeper
 * summing a column of "null" gets an error, and one reading it gets a wrong answer.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  // Formula injection: a purpose typed as `=cmd|'/c calc'!A1` runs on open in Excel.
  if (text.length > 0 && FORMULA_LEAD.includes(text[0])) text = `'${text}`;

  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(cell: unknown[]): string {
  return cell.map(csvCell).join(",");
}

/**
 * Rows into a CSV document.
 *
 * CRLF, not LF: RFC 4180 says CRLF, and Excel on Windows — which is what this will be
 * opened in — is the consumer that cares.
 */
export function toCsv(header: string[], row: unknown[][]): string {
  return [csvRow(header), ...row.map(csvRow)].join("\r\n") + "\r\n";
}

/**
 * Cents to a plain decimal string: 300000 → "3000.00".
 *
 * A STRING, with exactly two places, and no thousands separator or currency symbol. A
 * separator would make the cell text in Excel instead of a number, and the symbol makes
 * it text in every accounting import that exists.
 */
export function centsToDecimal(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const absolute = Math.abs(amountCents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

// ─── Period ──────────────────────────────────────────

export interface ExportPeriod {
  /** Inclusive, YYYY-MM-DD. */
  fromOn: string;
  /** Inclusive, YYYY-MM-DD. */
  toOn: string;
}

/**
 * A period's boundary instants, in Manila.
 *
 * The `to` boundary is the START of the following day rather than 23:59:59 of `toOn`:
 * anything filed at 23:59:59.400 on the last day of the month belongs in that month, and
 * an inclusive-second boundary drops it. That row would then appear in NEITHER period,
 * which is the kind of discrepancy that costs an afternoon to find.
 */
export function periodBound(period: ExportPeriod): { fromAt: Date; toAt: Date } {
  return {
    fromAt: new Date(`${period.fromOn}T00:00:00+08:00`),
    toAt: new Date(`${addDay(period.toOn, 1)}T00:00:00+08:00`),
  };
}

function addDay(on: string, dayCount: number): string {
  const [y, m, d] = on.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + dayCount));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

// ─── Sheets ──────────────────────────────────────────

export const REVENUE_HEADER = [
  "invoice_id",
  "issued_on",
  "paid_on",
  "client",
  "project",
  "label",
  "amount_php",
  "status",
  "is_recurring",
  "settled_via",
  "payment_method",
];

export async function revenueSheet(period: ExportPeriod): Promise<string> {
  const { fromAt, toAt } = periodBound(period);

  const row = await db()
    .select({
      invoiceId: invoice.invoiceId,
      createdAt: invoice.createdAt,
      paidAt: invoice.paidAt,
      label: invoice.label,
      amountCents: invoice.amountCents,
      status: sql<string>`${invoice.status}`,
      recurringFeeId: invoice.recurringFeeId,
      projectTitle: project.title,
      companyName: client.companyName,
      provider: paymentIntent.provider,
      method: paymentIntent.method,
    })
    .from(invoice)
    .leftJoin(project, eq(invoice.projectId, project.projectId))
    .leftJoin(client, eq(project.clientId, client.clientId))
    .leftJoin(paymentIntent, eq(invoice.settledPaymentIntentId, paymentIntent.paymentIntentId))
    .where(and(gte(invoice.createdAt, fromAt), lte(invoice.createdAt, toAt)))
    .orderBy(asc(invoice.createdAt));

  return toCsv(
    REVENUE_HEADER,
    row.map((one) => [
      one.invoiceId,
      onlyDate(one.createdAt),
      onlyDate(one.paidAt),
      one.companyName,
      one.projectTitle,
      one.label,
      centsToDecimal(one.amountCents),
      one.status,
      // Marked, not excluded — the bookkeeper needs these even though 017 keeps them out
      // of project contract-value maths.
      one.recurringFeeId ? "yes" : "no",
      one.provider ?? "out_of_band",
      one.method ?? "",
    ]),
  );
}

export const EXPENSE_HEADER = [
  "expense_id",
  "incurred_on",
  "project",
  "category",
  "purpose",
  "authorized_by",
  "location",
  "amount_php",
];

export async function expenseSheet(period: ExportPeriod): Promise<string> {
  const { fromAt, toAt } = periodBound(period);

  const row = await db()
    .select({
      expenseId: expense.expenseId,
      createdAt: expense.createdAt,
      purpose: expense.purpose,
      authorizedBy: expense.authorizedBy,
      amountCents: expense.amountCents,
      location: expense.location,
      category: expense.category,
      projectTitle: project.title,
    })
    .from(expense)
    .leftJoin(project, eq(expense.projectId, project.projectId))
    .where(and(gte(expense.createdAt, fromAt), lte(expense.createdAt, toAt)))
    .orderBy(asc(expense.createdAt));

  return toCsv(
    EXPENSE_HEADER,
    row.map((one) => [
      one.expenseId,
      onlyDate(one.createdAt),
      one.projectTitle,
      one.category,
      one.purpose,
      one.authorizedBy,
      one.location,
      centsToDecimal(one.amountCents),
      // Receipt/reimbursable dropped from the expense model (migration 039,
      // Prince's rework), so the sheet no longer carries those two columns.
    ]),
  );
}

export const COMMISSION_HEADER = [
  "commission_plan_id",
  "finalized_on",
  "project",
  "payee",
  "role",
  "share_bps",
  "amount_php",
];

/**
 * FINALIZED plans only.
 *
 * A draft plan's share amounts are derived on every read from basis + weights (018) and
 * are not frozen. Exporting them would put a number in a bookkeeper's file that can still
 * change, which is the definition of a figure nobody should file.
 */
export async function commissionSheet(period: ExportPeriod): Promise<string> {
  const { fromAt, toAt } = periodBound(period);

  const row = await db()
    .select({
      commissionPlanId: commissionPlan.commissionPlanId,
      finalizedAt: commissionPlan.finalizedAt,
      projectTitle: project.title,
      role: commissionShare.role,
      contributionBps: commissionShare.contributionBps,
      amountCents: commissionShare.amountCents,
      payeeName: teamMember.name,
    })
    .from(commissionShare)
    .innerJoin(
      commissionPlan,
      eq(commissionShare.commissionPlanId, commissionPlan.commissionPlanId),
    )
    .leftJoin(project, eq(commissionPlan.projectId, project.projectId))
    .leftJoin(teamMember, eq(commissionShare.teamMemberId, teamMember.teamMemberId))
    .where(
      and(
        sql`${commissionPlan.finalizedAt} IS NOT NULL`,
        gte(commissionPlan.finalizedAt, fromAt),
        lte(commissionPlan.finalizedAt, toAt),
      ),
    )
    .orderBy(asc(commissionPlan.finalizedAt));

  return toCsv(
    COMMISSION_HEADER,
    row.map((one) => [
      one.commissionPlanId,
      onlyDate(one.finalizedAt),
      one.projectTitle,
      // The 15% company reserve is a real share row with a NULL team member (018), not a
      // leftover. Naming it explicitly is what makes the column sum to the basis.
      one.payeeName ?? "ADVO (company reserve)",
      one.role,
      one.contributionBps,
      one.amountCents === null ? "" : centsToDecimal(one.amountCents),
    ]),
  );
}

export const SUMMARY_HEADER = ["metric", "value", "note"];

/**
 * The four totals, plus the honest caveat.
 *
 * The caveat is a ROW in the file, not a line in a README, because the file is what gets
 * emailed to the bookkeeper and the README is not.
 */
export async function summarySheet(period: ExportPeriod): Promise<string> {
  const { fromAt, toAt } = periodBound(period);
  const d = db();

  const invoiced = await d
    .select({
      total: sql<number>`COALESCE(SUM(${invoice.amountCents}), 0)`,
      paid: sql<number>`COALESCE(SUM(CASE WHEN ${invoice.status} = 'paid' THEN ${invoice.amountCents} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(invoice)
    .where(and(gte(invoice.createdAt, fromAt), lte(invoice.createdAt, toAt)));

  const spent = await d
    .select({
      total: sql<number>`COALESCE(SUM(${expense.amountCents}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(expense)
    .where(and(gte(expense.createdAt, fromAt), lte(expense.createdAt, toAt)));

  const payout = await d
    .select({ total: sql<number>`COALESCE(SUM(${commissionShare.amountCents}), 0)` })
    .from(commissionShare)
    .innerJoin(
      commissionPlan,
      eq(commissionShare.commissionPlanId, commissionPlan.commissionPlanId),
    )
    .where(
      and(
        sql`${commissionPlan.finalizedAt} IS NOT NULL`,
        gte(commissionPlan.finalizedAt, fromAt),
        lte(commissionPlan.finalizedAt, toAt),
      ),
    );

  const invoicedTotal = Number(invoiced[0]?.total ?? 0);
  const paidTotal = Number(invoiced[0]?.paid ?? 0);
  const expenseTotal = Number(spent[0]?.total ?? 0);
  const payoutTotal = Number(payout[0]?.total ?? 0);

  return toCsv(SUMMARY_HEADER, [
    ["period_from", period.fromOn, "inclusive, Asia/Manila"],
    ["period_to", period.toOn, "inclusive, Asia/Manila"],
    ["invoice_count", Number(invoiced[0]?.count ?? 0), ""],
    ["invoiced_php", centsToDecimal(invoicedTotal), "gross, all invoices raised in the period"],
    ["collected_php", centsToDecimal(paidTotal), "invoices marked paid, whatever the rail"],
    [
      "uncollected_php",
      centsToDecimal(invoicedTotal - paidTotal),
      "raised in this period and not yet paid",
    ],
    ["expense_count", Number(spent[0]?.count ?? 0), ""],
    ["expense_php", centsToDecimal(expenseTotal), "gross, all expenses in the period"],
    [
      "commission_payout_php",
      centsToDecimal(payoutTotal),
      "finalized plans only — draft amounts are derived on read and can still change",
    ],
    [
      "tax_classification",
      "NOT COMPUTED",
      "No VAT, percentage tax or 2307 figure is calculated here. Every one depends on ADVO's " +
        "registration type, which is still an open question. A tax figure computed against a " +
        "guessed registration is worse than none, because it would get filed. The columns a " +
        "2307 is prepared FROM are present; the classification is the bookkeeper's call.",
    ],
  ]);
}

function onlyDate(at: Date | string | null): string {
  if (!at) return "";
  const date = at instanceof Date ? at : new Date(at);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function buildSheet(sheet: ExportSheet, period: ExportPeriod): Promise<string> {
  if (sheet === "revenue") return revenueSheet(period);
  if (sheet === "expense") return expenseSheet(period);
  if (sheet === "commission") return commissionSheet(period);
  return summarySheet(period);
}
