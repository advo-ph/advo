/**
 * Recurring infrastructure fee — the first recurring money in this repo.
 *
 * The FourlinQ MOA (2026-08-11) commits the client to PHP 3,000.00/month for hosting,
 * database maintenance and domain renewal, "billed on the 1st of every month", and
 * grants ADVO the right to suspend hosting and API access if the fee "is not paid
 * within 15 days of the due date".
 *
 * Six invariants this file exists to hold. Each is asserted by
 * apps/web/src/test/recurring-fee.test.ts, so weakening any of them turns it red:
 *
 *   1. NO PARALLEL BILLING SYSTEM — the generated charge IS an `invoice` row. There is
 *      no second money table, and no new invoice_status value.
 *   2. IDEMPOTENT GENERATION — the double-bill guard is the partial unique index
 *      (recurring_fee_id, period_start_on), enforced by the DB via onConflictDoNothing,
 *      not by application care. Running the tick twice generates nothing twice.
 *   3. BOUNDED CATCH-UP — MAX_CATCHUP_PERIOD caps one tick. A fee back-dated two years
 *      cannot mint two years of real invoices (and two years of client notifications)
 *      in a single click.
 *   4. MANILA CALENDAR, NOT UTC — every anchor is a DATE resolved through
 *      BILLING_TIMEZONE with built-in Intl. No new dependency. A naive UTC new Date()
 *      would bill the December period on Nov 30 at 16:00.
 *   5. THE SWEEP IS ONE GUARDED UPDATE — unpaid -> overdue happens in a single
 *      UPDATE ... WHERE status = 'unpaid', never read-then-write, so an invoice an
 *      admin just marked paid can never be dragged back to overdue by a concurrent tick.
 *   6. SUSPENSION IS DERIVED, AND IS A LEGAL ACT — deriveSuspension() is a pure read.
 *      Nothing in this file suspends hosting, revokes a key, or touches a deploy.
 *      suspendFee() only records a timestamp, and refuses when the predicate is false.
 *
 * Deliberately NOT here: penalty interest (the contract 2%/month clause is a separate,
 * deferred model) and any scheduler. runRecurringFee() is an endpoint a human or a later
 * job calls; this file starts no timer.
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { invoice, project, recurringFee } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("recurring-fee");

/** "The 1st of every month" is the 1st in Manila, not in UTC. */
export const BILLING_TIMEZONE = "Asia/Manila";

/** One tick can never mint more than this many invoices for a single fee. */
export const MAX_CATCHUP_PERIOD = 24;

export const BILLING_INTERVAL = ["monthly", "quarterly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVAL)[number];

const MONTH_STEP: Record<BillingInterval, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

// ─── Manila calendar helpers (built-in Intl only — no new dependency) ───

/** Today as YYYY-MM-DD in the billing timezone. */
export function todayOn(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const partOf = (on: string) => {
  const [y, m, d] = on.split("-").map(Number);
  return { y, m, d };
};

const pad = (n: number) => String(n).padStart(2, "0");

const makeOn = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Midnight of a billing date, in Manila, as the instant an invoice due_date stores. */
export function instantOf(on: string): Date {
  return new Date(`${on}T00:00:00+08:00`);
}

/**
 * Advance a billing anchor by one interval, snapped to the billing day of month.
 * billing_day_of_month is CHECKed to 1..28 in migration 017 precisely so this can never
 * overflow into the following month and silently skip a period.
 */
export function addPeriod(on: string, interval: BillingInterval, dayOfMonth: number): string {
  const { y, m } = partOf(on);
  const zero = y * 12 + (m - 1) + MONTH_STEP[interval];
  return makeOn(Math.floor(zero / 12), (zero % 12) + 1, dayOfMonth);
}

export function addDay(on: string, dayCount: number): string {
  const { y, m, d } = partOf(on);
  const at = new Date(Date.UTC(y, m - 1, d + dayCount));
  return makeOn(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function dayBetween(from: string, to: string): number {
  const a = partOf(from);
  const b = partOf(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** The first billable anchor on or after `on`, snapped to the billing day. */
function firstAnchorOn(on: string, dayOfMonth: number): string {
  const { y, m, d } = partOf(on);
  if (d <= dayOfMonth) return makeOn(y, m, dayOfMonth);
  const zero = y * 12 + m;
  return makeOn(Math.floor(zero / 12), (zero % 12) + 1, dayOfMonth);
}

// ─── Types ───────────────────────────────────────────

export type RecurringFeeRow = typeof recurringFee.$inferSelect;
export type InvoiceRow = typeof invoice.$inferSelect;

/** Every field here is COMPUTED at read time. None of it is stored. */
export type SuspensionDerived = {
  isSuspensionJustified: boolean;
  isSuspended: boolean;
  unsettledInvoiceCount: number;
  outstandingCents: number;
  /** Days past the oldest unsettled due date. Null when nothing is unsettled. */
  daySinceDue: number | null;
  /** Days left in the grace window. Negative once the window has closed. */
  graceDayRemaining: number | null;
  nextRunOn: string;
  lastGeneratedOn: string | null;
};

export type PreviewPeriod = {
  periodStartOn: string;
  dueOn: string;
  amountCents: number;
  isAlreadyInvoiced: boolean;
};

export type RunResult = {
  generatedInvoiceId: number[];
  sweptCount: number;
  skippedCount: number;
  isComplete: boolean;
};

// ─── Read ────────────────────────────────────────────

/** Every invoice this fee has already minted, newest period first. */
async function invoiceOfFee(recurringFeeId: number): Promise<InvoiceRow[]> {
  return db()
    .select()
    .from(invoice)
    .where(eq(invoice.recurringFeeId, recurringFeeId))
    .orderBy(desc(invoice.periodStartOn));
}

/**
 * THE derivation. A pure read that decides whether the contractual remedy is AVAILABLE.
 * It never performs it.
 *
 * A fee justifies suspension when it is active, suspension is contractually enabled for
 * this client, and at least one generated invoice is still unsettled more than
 * grace_day_count calendar days past its due date. A PAID invoice can never justify
 * suspension, no matter how late it was settled.
 */
export function deriveSuspension(
  fee: RecurringFeeRow,
  feeInvoice: InvoiceRow[],
  now: Date = new Date(),
): SuspensionDerived {
  const today = todayOn(now);
  const unsettled = feeInvoice.filter((row) => row.status !== "paid");

  let oldestDueOn: string | null = null;
  let isPastGrace = false;
  let outstandingCents = 0;

  for (const row of unsettled) {
    outstandingCents += row.amountCents;
    const dueOn = row.periodStartOn;
    if (!dueOn) continue;
    if (oldestDueOn === null || dueOn < oldestDueOn) oldestDueOn = dueOn;
    if (dayBetween(dueOn, today) > fee.graceDayCount) isPastGrace = true;
  }

  const daySinceDue = oldestDueOn === null ? null : dayBetween(oldestDueOn, today);

  return {
    isSuspensionJustified: isPastGrace && fee.isSuspensionEnabled && fee.status === "active",
    isSuspended: fee.suspendedAt !== null,
    unsettledInvoiceCount: unsettled.length,
    outstandingCents,
    daySinceDue,
    graceDayRemaining: daySinceDue === null ? null : fee.graceDayCount - daySinceDue,
    nextRunOn: fee.nextRunOn,
    lastGeneratedOn: fee.lastGeneratedOn,
  };
}

export async function listRecurringFee(projectId?: number) {
  const row = await db()
    .select()
    .from(recurringFee)
    .where(projectId === undefined ? undefined : eq(recurringFee.projectId, projectId))
    .orderBy(asc(recurringFee.nextRunOn));

  if (row.length === 0) return [];

  const feeInvoice = await db()
    .select()
    .from(invoice)
    .where(
      inArray(
        invoice.recurringFeeId,
        row.map((f) => f.recurringFeeId),
      ),
    );

  return row.map((fee) => ({
    ...fee,
    derived: deriveSuspension(
      fee,
      feeInvoice.filter((i) => i.recurringFeeId === fee.recurringFeeId),
    ),
  }));
}

export async function getRecurringFee(recurringFeeId: number) {
  const [fee] = await db()
    .select()
    .from(recurringFee)
    .where(eq(recurringFee.recurringFeeId, recurringFeeId))
    .limit(1);

  if (!fee) throw new HTTPException(404, { message: "Recurring fee not found" });

  const feeInvoice = await invoiceOfFee(recurringFeeId);
  return { ...fee, invoice: feeInvoice, derived: deriveSuspension(fee, feeInvoice) };
}

/** The ops view: only the fees where the remedy is available RIGHT NOW. */
export async function listSuspensionRisk() {
  const row = await listRecurringFee();
  return row.filter((f) => f.derived.isSuspensionJustified);
}

// ─── Write ───────────────────────────────────────────

export type CreateInput = {
  projectId: number;
  label: string;
  amountCents: number;
  billingInterval?: BillingInterval;
  billingDayOfMonth?: number;
  graceDayCount?: number;
  startsOn: string;
  endsOn?: string | null;
  isSuspensionEnabled?: boolean;
  /** Opt in explicitly to bill periods that elapsed before this row existed. */
  isBackfill?: boolean;
  note?: string | null;
};

export async function createRecurringFee(input: CreateInput) {
  const [found] = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .where(eq(project.projectId, input.projectId))
    .limit(1);
  if (!found) throw new HTTPException(404, { message: "Project not found" });

  const dayOfMonth = input.billingDayOfMonth ?? 1;
  const today = todayOn();

  // CATCH-UP RUNAWAY guard, half one. Without this, a fee anchored to a signing date a
  // year ago would mint a year of real invoices — and a year of invoice_issued
  // notifications to a live client — the first time anyone clicks Run.
  const anchorFrom =
    input.isBackfill === true ? input.startsOn : input.startsOn > today ? input.startsOn : today;

  const [created] = await db()
    .insert(recurringFee)
    .values({
      projectId: input.projectId,
      label: input.label,
      amountCents: input.amountCents,
      billingInterval: input.billingInterval ?? "monthly",
      billingDayOfMonth: dayOfMonth,
      graceDayCount: input.graceDayCount ?? 15,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      nextRunOn: firstAnchorOn(anchorFrom, dayOfMonth),
      isSuspensionEnabled: input.isSuspensionEnabled ?? true,
      note: input.note ?? null,
    })
    .returning();

  return created;
}

export type UpdateInput = {
  label?: string;
  amountCents?: number;
  status?: "active" | "paused" | "cancelled";
  graceDayCount?: number;
  endsOn?: string | null;
  isSuspensionEnabled?: boolean;
  note?: string | null;
};

/**
 * Never rewinds next_run_on. There is deliberately no way to move the anchor backwards
 * through this API: doing so would re-open an already-billed period, and the only thing
 * standing between that and a duplicate charge would be the unique index.
 */
export async function updateRecurringFee(recurringFeeId: number, input: UpdateInput) {
  const [updated] = await db()
    .update(recurringFee)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(recurringFee.recurringFeeId, recurringFeeId))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Recurring fee not found" });
  return updated;
}

/**
 * Deleting the SCHEDULE never deletes the money. The FK is ON DELETE SET NULL, so every
 * invoice already raised survives as an ordinary one-shot invoice — billing history
 * cannot be erased by removing the schedule that produced it.
 */
export async function deleteRecurringFee(recurringFeeId: number) {
  const [deleted] = await db()
    .delete(recurringFee)
    .where(eq(recurringFee.recurringFeeId, recurringFeeId))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Recurring fee not found" });
  return deleted;
}

// ─── Generation ──────────────────────────────────────

/** Every period this fee owes as of `today`, bounded by MAX_CATCHUP_PERIOD. */
export function duePeriodOf(fee: RecurringFeeRow, today: string): string[] {
  if (fee.status !== "active") return [];

  const period: string[] = [];
  let on = fee.nextRunOn;
  const interval = (fee.billingInterval as BillingInterval) ?? "monthly";

  while (on <= today && period.length < MAX_CATCHUP_PERIOD) {
    if (fee.endsOn !== null && on > fee.endsOn) break;
    if (on >= fee.startsOn) period.push(on);
    on = addPeriod(on, interval, fee.billingDayOfMonth);
  }

  return period;
}

/**
 * HONEST DRY RUN (previewCampaign precedent). Resolves the periods that WOULD be
 * invoiced and flags the ones already billed. Writes nothing, sends nothing.
 */
export async function previewRecurringFee(
  recurringFeeId: number,
  now: Date = new Date(),
): Promise<{ recurringFeeId: number; period: PreviewPeriod[]; totalCents: number }> {
  const [fee] = await db()
    .select()
    .from(recurringFee)
    .where(eq(recurringFee.recurringFeeId, recurringFeeId))
    .limit(1);
  if (!fee) throw new HTTPException(404, { message: "Recurring fee not found" });

  const existing = new Set(
    (await invoiceOfFee(recurringFeeId)).map((row) => row.periodStartOn).filter(Boolean),
  );

  const period = duePeriodOf(fee, todayOn(now)).map((periodStartOn) => ({
    periodStartOn,
    dueOn: periodStartOn,
    amountCents: fee.amountCents,
    isAlreadyInvoiced: existing.has(periodStartOn),
  }));

  return {
    recurringFeeId,
    period,
    totalCents: period.filter((p) => !p.isAlreadyInvoiced).reduce((sum, p) => sum + p.amountCents, 0),
  };
}

/**
 * Mint one invoice per owed period. The double-bill guard is the DB partial unique index
 * on (recurring_fee_id, period_start_on) — onConflictDoNothing means a double-clicked
 * run inserts nothing the second time and reports it as skipped.
 */
export async function generateInvoiceForFee(
  fee: RecurringFeeRow,
  now: Date = new Date(),
): Promise<{ generatedInvoiceId: number[]; skippedCount: number }> {
  const period = duePeriodOf(fee, todayOn(now));
  const generatedInvoiceId: number[] = [];
  let skippedCount = 0;

  for (const periodStartOn of period) {
    const [created] = await db()
      .insert(invoice)
      .values({
        projectId: fee.projectId,
        recurringFeeId: fee.recurringFeeId,
        periodStartOn,
        amountCents: fee.amountCents,
        label: fee.label,
        status: "unpaid",
        dueDate: instantOf(periodStartOn),
      })
      .onConflictDoNothing()
      .returning({ invoiceId: invoice.invoiceId });

    if (created) generatedInvoiceId.push(created.invoiceId);
    else skippedCount += 1;
  }

  if (period.length > 0) {
    const interval = (fee.billingInterval as BillingInterval) ?? "monthly";
    const lastOn = period[period.length - 1];
    await db()
      .update(recurringFee)
      .set({
        nextRunOn: addPeriod(lastOn, interval, fee.billingDayOfMonth),
        lastGeneratedOn: lastOn,
        updatedAt: new Date(),
      })
      .where(eq(recurringFee.recurringFeeId, fee.recurringFeeId));
  }

  return { generatedInvoiceId, skippedCount };
}

/**
 * unpaid -> overdue, as ONE guarded UPDATE.
 *
 * Never read-then-write: an admin marking an invoice paid concurrently with a tick must
 * not have it dragged back to overdue. The WHERE clause re-checks status = 'unpaid' at
 * write time, so a just-paid row is invisible to this statement.
 */
export async function sweepOverdueInvoice(): Promise<number> {
  const swept = await db()
    .update(invoice)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(invoice.status, "unpaid"),
        isNotNull(invoice.recurringFeeId),
        isNotNull(invoice.dueDate),
        sql`EXISTS (
          SELECT 1 FROM recurring_fee rf
          WHERE rf.recurring_fee_id = ${invoice.recurringFeeId}
            AND ${invoice.dueDate} + make_interval(days => rf.grace_day_count) < NOW()
        )`,
      ),
    )
    .returning({ invoiceId: invoice.invoiceId });

  return swept.length;
}

/** One generation + sweep tick across every active fee. Idempotent by construction. */
export async function runRecurringFee(now: Date = new Date()): Promise<RunResult> {
  const activeFee = await db().select().from(recurringFee).where(eq(recurringFee.status, "active"));

  const generatedInvoiceId: number[] = [];
  let skippedCount = 0;

  for (const fee of activeFee) {
    const result = await generateInvoiceForFee(fee, now);
    generatedInvoiceId.push(...result.generatedInvoiceId);
    skippedCount += result.skippedCount;
  }

  const sweptCount = await sweepOverdueInvoice();

  log.info(
    `tick: ${generatedInvoiceId.length} generated, ${skippedCount} skipped, ${sweptCount} swept overdue`,
  );

  // isComplete is false when a fee hit the catch-up cap and still owes periods — the
  // caller runs the tick again rather than the tick looping unbounded.
  const isComplete = activeFee.every(
    (fee) => duePeriodOf(fee, todayOn(now)).length < MAX_CATCHUP_PERIOD,
  );

  return { generatedInvoiceId, sweptCount, skippedCount, isComplete };
}

// ─── The remedy (human-invoked only) ─────────────────

/**
 * Records that a human invoked the contractual suspension right. This function does NOT
 * suspend anything: it writes a timestamp. Actually taking hosting or API access down is
 * an operational act performed by a person, deliberately not wired to this model.
 *
 * 409 when the predicate is false, so the remedy cannot be invoked early by a mis-click.
 */
export async function suspendFee(recurringFeeId: number, now: Date = new Date()) {
  const fee = await getRecurringFee(recurringFeeId);

  if (!deriveSuspension(fee, fee.invoice, now).isSuspensionJustified) {
    throw new HTTPException(409, {
      message:
        "Suspension is not justified: no generated invoice is unpaid beyond its grace window.",
    });
  }

  const [updated] = await db()
    .update(recurringFee)
    .set({ suspendedAt: now, updatedAt: now })
    .where(eq(recurringFee.recurringFeeId, recurringFeeId))
    .returning();

  return updated;
}

export async function resumeFee(recurringFeeId: number) {
  const [updated] = await db()
    .update(recurringFee)
    .set({ suspendedAt: null, updatedAt: new Date() })
    .where(eq(recurringFee.recurringFeeId, recurringFeeId))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Recurring fee not found" });
  return updated;
}
