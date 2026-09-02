/**
 * Ops insight — three questions the data could already answer and nothing asked.
 *
 * No migration, no new table. Every number here is DERIVED from rows that already exist,
 * which is the point: the failures below were all visible in the database and invisible
 * on a screen.
 *
 *   1. MONEY AT RISK. Coffee Rush is in development with no signed contract. That is the
 *      FourlinQ mistake — open-ended revisions and a downpayment that "isnt enough" —
 *      repeating live, and nothing on the dashboard says so. This computes the exposure:
 *      unsigned contracts on active work, uninvoiced contract value, and overdue money.
 *
 *   2. REVISION BURNDOWN. The 5-round free-revision allowance is contractually finite and
 *      invisible to BOTH sides. A client who cannot see "3 of 5 used" has no reason to
 *      economise, and ADVO discovers the cap is spent only when it argues about it. The
 *      cap enforces itself once it is legible, which is cheaper than enforcing it.
 *
 *   3. CLIENT STALENESS. Days since the last inbound message, meeting, or deliverable.
 *      Felici and Coffee Rush both went quiet for stretches nobody clocked at the time.
 *
 * ─── Every function here is PURE ──────────────────────────────────────────────
 *
 * The `derive*` functions take rows and a clock and return numbers. The `get*` functions
 * are thin: fetch, then call the pure one. That split is deliberate — a dashboard number
 * that is wrong is worse than no dashboard, because people make decisions on it, and a
 * number computed inside a query is a number nobody can unit-test.
 *
 * ─── What is NOT here ─────────────────────────────────────────────────────────
 *
 * No scoring, no "health grade", no red/amber/green. A composite score compresses several
 * facts into one number whose movement nobody can explain, and the explanation is the
 * useful part. Each figure below stands on its own with the rows behind it addressable.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  client,
  contract,
  deliverable,
  inboundMessage,
  invoice,
  meeting,
  project,
  projectSignoff,
  signoffRevision,
} from "../db/schema.js";

/** Project states that mean real work is being done and money is being spent. */
export const ACTIVE_PROJECT_STATUS = ["discovery", "architecture", "development", "testing"] as const;

/** Contract statuses that mean the paper is actually executed. */
export const SIGNED_CONTRACT_STATUS = ["signed", "active", "executed"] as const;

// ─── 1. Money at risk ────────────────────────────────

export interface ProjectRiskInput {
  projectId: number;
  title: string;
  clientId: number;
  projectStatus: string;
  totalValueCents: number;
  /** Contracts attached to this project, signed or not. */
  hasSignedContract: boolean;
  /** Sum of non-recurring invoices raised against the project. */
  invoicedCents: number;
  /** Sum of invoices past due and still unpaid. */
  overdueCents: number;
}

export interface ProjectRisk extends ProjectRiskInput {
  /** Contract value with no invoice raised against it yet. Never negative. */
  uninvoicedCents: number;
  /** Every reason this project is exposed. Empty = nothing to say about it. */
  reason: Array<"unsigned_contract" | "uninvoiced_value" | "overdue_invoice" | "no_contract_value">;
  /**
   * The single number a human should look at: what is genuinely at stake here.
   *
   * NOT a sum of the three figures — that would double-count, because an overdue invoice
   * is already invoiced and therefore not uninvoiced. It is the larger of "work done
   * without paper" and "money owed and late", which are the two ways this company has
   * actually lost money.
   */
  exposureCents: number;
}

/**
 * PURE. Which active projects are exposed, and by how much.
 *
 * An unsigned contract on an ACTIVE project puts the entire project value at risk, not
 * the uninvoiced part: without executed paper there is no revision cap, no payment
 * schedule and no sign-off trigger, so every peso of it is arguable. That is exactly what
 * FourlinQ and Felici demonstrated.
 */
export function deriveProjectRisk(input: ProjectRiskInput[]): ProjectRisk[] {
  return input
    .map((one) => {
      const uninvoicedCents = Math.max(0, one.totalValueCents - one.invoicedCents);
      const reason: ProjectRisk["reason"] = [];

      const isActive = (ACTIVE_PROJECT_STATUS as readonly string[]).includes(one.projectStatus);

      if (isActive && !one.hasSignedContract) reason.push("unsigned_contract");
      if (isActive && one.totalValueCents === 0) reason.push("no_contract_value");
      if (uninvoicedCents > 0) reason.push("uninvoiced_value");
      if (one.overdueCents > 0) reason.push("overdue_invoice");

      // Deliberately a MAX, not a SUM. An overdue invoice is already counted in
      // invoicedCents, so adding the two would report money twice.
      const unpaperedCents = isActive && !one.hasSignedContract ? one.totalValueCents : uninvoicedCents;
      const exposureCents = Math.max(unpaperedCents, one.overdueCents);

      return { ...one, uninvoicedCents, reason, exposureCents };
    })
    .filter((one) => one.reason.length > 0)
    .sort((a, b) => b.exposureCents - a.exposureCents || a.projectId - b.projectId);
}

export async function getMoneyAtRisk(): Promise<{
  totalExposureCents: number;
  unsignedCount: number;
  project: ProjectRisk[];
}> {
  const d = db();

  const row = await d
    .select({
      projectId: project.projectId,
      title: project.title,
      clientId: project.clientId,
      projectStatus: sql<string>`${project.projectStatus}`,
      totalValueCents: project.totalValueCents,
      hasSignedContract: sql<boolean>`EXISTS (
        SELECT 1 FROM ${contract} c
        WHERE c.project_id = ${project.projectId}
          AND c.signed_at IS NOT NULL
      )`,
      // Recurring invoices are excluded: 017 states the Total Fee "does not cover the
      // ongoing costs", so counting them against contract value would make every project
      // with a hosting retainer look over-invoiced.
      invoicedCents: sql<number>`COALESCE((
        SELECT SUM(i.amount_cents) FROM ${invoice} i
        WHERE i.project_id = ${project.projectId} AND i.recurring_fee_id IS NULL
      ), 0)`,
      overdueCents: sql<number>`COALESCE((
        SELECT SUM(i.amount_cents) FROM ${invoice} i
        WHERE i.project_id = ${project.projectId} AND i.status = 'overdue'
      ), 0)`,
    })
    .from(project);

  const risk = deriveProjectRisk(
    row.map((one) => ({
      ...one,
      invoicedCents: Number(one.invoicedCents),
      overdueCents: Number(one.overdueCents),
      hasSignedContract: Boolean(one.hasSignedContract),
    })),
  );

  return {
    totalExposureCents: risk.reduce((sum, one) => sum + one.exposureCents, 0),
    unsignedCount: risk.filter((one) => one.reason.includes("unsigned_contract")).length,
    project: risk,
  };
}

// ─── 2. Revision burndown ────────────────────────────

export interface RevisionBudget {
  projectSignoffId: number;
  projectId: number;
  allowanceCount: number;
  usedCount: number;
  remainingCount: number;
  /** True once the free allowance is spent — every further round is chargeable. */
  isExhausted: boolean;
  /** Rounds still awaiting a client response. Their clocks may be running. */
  openCount: number;
}

/**
 * PURE. Rounds used against rounds allowed.
 *
 * Counted, never stored — the same discipline project-signoff.service.ts already holds,
 * where only the allowance is a column. A stored counter drifts from the rows it claims
 * to summarise, and then two places disagree about how many revisions a client has left,
 * which is the worst possible thing to be uncertain about mid-argument.
 *
 * A VOIDED or post-sign-off round does not consume the free allowance: the 6-month
 * post-signature window is a separate entitlement in the contract, and charging it
 * against the pre-sign-off five would quietly take something the client paid for.
 */
export function deriveRevisionBudget(
  signoff: { projectSignoffId: number; projectId: number; freeRevisionTotalCount: number },
  revision: Array<{ isPostSignoff: boolean; clientRespondedAt: Date | null; deemedApprovedAt: Date | null }>,
): RevisionBudget {
  const consuming = revision.filter((one) => !one.isPostSignoff);
  const usedCount = consuming.length;
  const remainingCount = Math.max(0, signoff.freeRevisionTotalCount - usedCount);

  return {
    projectSignoffId: signoff.projectSignoffId,
    projectId: signoff.projectId,
    allowanceCount: signoff.freeRevisionTotalCount,
    usedCount,
    remainingCount,
    isExhausted: remainingCount === 0,
    openCount: revision.filter((one) => !one.clientRespondedAt && !one.deemedApprovedAt).length,
  };
}

export async function getRevisionBudget(projectId?: number): Promise<RevisionBudget[]> {
  const d = db();

  const signoff = await d
    .select({
      projectSignoffId: projectSignoff.projectSignoffId,
      projectId: projectSignoff.projectId,
      freeRevisionTotalCount: projectSignoff.freeRevisionTotalCount,
    })
    .from(projectSignoff)
    .where(projectId ? eq(projectSignoff.projectId, projectId) : sql`true`);

  const out: RevisionBudget[] = [];
  for (const one of signoff) {
    const revision = await d
      .select({
        isPostSignoff: signoffRevision.isPostSignoff,
        clientRespondedAt: signoffRevision.clientRespondedAt,
        deemedApprovedAt: signoffRevision.deemedApprovedAt,
      })
      .from(signoffRevision)
      .where(eq(signoffRevision.projectSignoffId, one.projectSignoffId));
    out.push(deriveRevisionBudget(one, revision));
  }
  return out;
}

// ─── 3. Client staleness ─────────────────────────────

export interface StalenessInput {
  clientId: number;
  companyName: string;
  /** Most recent of: inbound message, meeting, deliverable completion. Null = never. */
  lastContactAt: Date | null;
  activeProjectCount: number;
}

export interface ClientStaleness extends StalenessInput {
  /** Null when there has never been contact — which is NOT the same as "0 days ago". */
  dayCountSinceContact: number | null;
  /** True past the threshold, or when an active project has never had any contact. */
  isStale: boolean;
}

/**
 * PURE. How long since anybody heard from this client.
 *
 * `dayCountSinceContact` is null — not zero, not Infinity — when there has been no
 * contact at all. Zero would read as "spoke to them today" and Infinity does not survive
 * JSON. A client with an ACTIVE project and no recorded contact is stale regardless of
 * threshold: that is the worst state on this list, and a null must not sort as "fine".
 */
export function deriveStaleness(
  input: StalenessInput[],
  thresholdDayCount: number,
  now: Date = new Date(),
): ClientStaleness[] {
  return input
    .map((one) => {
      const dayCountSinceContact = one.lastContactAt
        ? Math.floor((now.getTime() - one.lastContactAt.getTime()) / 86_400_000)
        : null;

      const isStale =
        dayCountSinceContact === null
          ? one.activeProjectCount > 0
          : dayCountSinceContact >= thresholdDayCount && one.activeProjectCount > 0;

      return { ...one, dayCountSinceContact, isStale };
    })
    .sort((a, b) => {
      // Never-contacted first: a null is the most alarming value here, not the least.
      if (a.dayCountSinceContact === null && b.dayCountSinceContact !== null) return -1;
      if (b.dayCountSinceContact === null && a.dayCountSinceContact !== null) return 1;
      return (b.dayCountSinceContact ?? 0) - (a.dayCountSinceContact ?? 0) || a.clientId - b.clientId;
    });
}

/** Two weeks of silence on an active engagement is worth a look. Not a rule, a prompt. */
export const STALE_THRESHOLD_DAY = 14;

export async function getClientStaleness(
  thresholdDayCount = STALE_THRESHOLD_DAY,
): Promise<ClientStaleness[]> {
  const d = db();

  const row = await d
    .select({
      clientId: client.clientId,
      companyName: client.companyName,
      activeProjectCount: sql<number>`(
        SELECT COUNT(*) FROM ${project} p
        WHERE p.client_id = ${client.clientId}
          AND p.project_status <> 'shipped'
      )`,
      // GREATEST ignores NULLs in Postgres, so a client with meetings but no messages
      // still resolves correctly rather than collapsing to null.
      lastContactAt: sql<Date | null>`GREATEST(
        (SELECT MAX(m.received_at) FROM ${inboundMessage} m WHERE m.client_id = ${client.clientId}),
        (SELECT MAX(mt.recorded_at) FROM ${meeting} mt
          JOIN ${project} p2 ON p2.project_id = mt.project_id
          WHERE p2.client_id = ${client.clientId}),
        (SELECT MAX(dl.completed_at) FROM ${deliverable} dl
          JOIN ${project} p3 ON p3.project_id = dl.project_id
          WHERE p3.client_id = ${client.clientId})
      )`,
    })
    .from(client);

  return deriveStaleness(
    row.map((one) => ({
      ...one,
      activeProjectCount: Number(one.activeProjectCount),
      lastContactAt: one.lastContactAt ? new Date(one.lastContactAt) : null,
    })),
    thresholdDayCount,
  );
}
