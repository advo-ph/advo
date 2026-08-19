/**
 * Project Sign-off — the CLIENT-FACING final-delivery document (migration 016).
 *
 * The FourlinQ MOA names "Project Sign-off" five times. Signing it is the single
 * event that (1) stamps signed_at, (2) starts the 7-day final-payment clock,
 * (3) opens the 6-month window in which UNUSED complementary revisions stay
 * invocable, and (4) closes further free pre-sign-off revisions.
 *
 * Five invariants this file exists to hold. Each is asserted by
 * apps/web/src/test/signoff.test.ts and bench/roadmap/final/signoff.mjs:
 *
 *   1. NEVER deliverable.verified_at — that is INTERNAL team QA (migration 007).
 *      This is the client artifact. deliverableSnapshot COPIES verifiedAt into
 *      frozen jsonb; the client read path strips the snapshot entirely.
 *   2. SIGN IS ATOMIC AND SINGLE-SHOT — one transaction, and the guard is
 *      `UPDATE ... WHERE signed_at IS NULL RETURNING *`. Zero rows = already
 *      signed = 409, short-circuiting BEFORE the final-payment invoice is minted.
 *      Two clicks can never mint two receivables. The DB enforces this, not care.
 *   3. THE REVISION GATE LIVES IN THE WRITE PATH — recordRevision() reads the
 *      parent FOR UPDATE and counts the ledger. A caller holding a sign-off id
 *      cannot POST past an exhausted allowance or a closed window, and the unique
 *      (project_signoff_id, round_number) index is the last line of defence.
 *   4. USED/REMAINING ARE COUNTED, NEVER STORED — only the allowance is a column,
 *      so the tally cannot drift from the paper trail.
 *   5. FROZEN AFTER SIGNING — once signed_at is non-null, only note and
 *      documentUrl may change. A signed document whose scope or price can still
 *      be edited is not a sign-off.
 *
 * Money is integer CENTS end to end (Tier 1 final = 2250000, Tier 2 = 3500000).
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import {
  activityLog,
  client,
  deliverable,
  invoice,
  notification,
  project,
  projectSignoff,
  signoffRevision,
} from "../db/schema.js";
import { buildRevisionTaskDescription } from "./revision-task.service.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("project-signoff");

/** App-validated (not a DB enum) so the set can grow without a migration. */
export const SIGNOFF_STATUS = ["draft", "issued", "signed", "void"] as const;
export const SIGNOFF_METHOD = ["client", "deemed", "offline"] as const;

export type SignoffStatus = (typeof SIGNOFF_STATUS)[number];
export type SignoffMethod = (typeof SIGNOFF_METHOD)[number];

export type SignoffRow = typeof projectSignoff.$inferSelect;
export type SignoffRevisionRow = typeof signoffRevision.$inferSelect;

export interface SignoffDerived {
  paymentDueAt: string | null;
  revisionWindowEndsAt: string | null;
  freeRevisionUsedCount: number;
  freeRevisionRemainingCount: number;
  isFreeRevisionOpen: boolean;
  isRevisionWindowOpen: boolean;
  isPaymentOverdue: boolean;
}

// ─── Clock arithmetic ────────────────────────────────
// Every clock is derived HERE and only here, so /hub and /admin can never disagree
// about when a window closes. "6 months" is a real calendar month-add, never 180 days.
// The DB is timestamptz UTC while ADVO operates Asia/Manila; the add preserves the
// signature's instant-of-day, so a window opened at 09:00 Manila closes at 09:00 Manila.

export function addDay(from: Date, dayCount: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + dayCount);
  return d;
}

/** Calendar month add with end-of-month clamping (31 Aug + 6 => 28/29 Feb). */
export function addMonth(from: Date, monthCount: number): Date {
  const d = new Date(from.getTime());
  const targetDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monthCount);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, lastDay));
  return d;
}

/**
 * The single shared derivation. NOTHING here is stored on the row — recompute it on
 * every read so a stale column can never contradict the paper trail.
 *
 * `isInvoicePaid` is passed in (the caller already loaded the invoice) rather than
 * queried here, keeping this function pure and unit-testable.
 */
export function deriveWindow(
  row: Pick<
    SignoffRow,
    "signedAt" | "paymentDueDayCount" | "revisionWindowMonthCount" | "freeRevisionTotalCount"
  >,
  revisionUsedCount: number,
  now: Date = new Date(),
  isInvoicePaid = false,
): SignoffDerived {
  const signedAt = row.signedAt ? new Date(row.signedAt) : null;
  const used = revisionUsedCount;
  const remaining = Math.max(0, row.freeRevisionTotalCount - used);

  const paymentDueAt = signedAt ? addDay(signedAt, row.paymentDueDayCount) : null;
  const revisionWindowEndsAt = signedAt ? addMonth(signedAt, row.revisionWindowMonthCount) : null;

  return {
    paymentDueAt: paymentDueAt ? paymentDueAt.toISOString() : null,
    revisionWindowEndsAt: revisionWindowEndsAt ? revisionWindowEndsAt.toISOString() : null,
    freeRevisionUsedCount: used,
    freeRevisionRemainingCount: remaining,
    isFreeRevisionOpen: signedAt === null && remaining > 0,
    isRevisionWindowOpen:
      signedAt !== null && revisionWindowEndsAt !== null
        ? now.getTime() < revisionWindowEndsAt.getTime() && remaining > 0
        : false,
    isPaymentOverdue:
      signedAt !== null && paymentDueAt !== null
        ? now.getTime() > paymentDueAt.getTime() && !isInvoicePaid
        : false,
  };
}

// ─── Read ────────────────────────────────────────────

async function paidInvoiceIdSet(row: SignoffRow[]): Promise<Set<number>> {
  const id = row.map((r) => r.invoiceId).filter((v): v is number => v != null);
  if (id.length === 0) return new Set();
  const found = await db()
    .select({ invoiceId: invoice.invoiceId, status: invoice.status })
    .from(invoice)
    .where(inArray(invoice.invoiceId, id));
  return new Set(found.filter((r) => r.status === "paid").map((r) => r.invoiceId));
}

export type DecoratedSignoff = SignoffRow & { derived: SignoffDerived };

/** Attach the derived block to a batch of rows in two queries, not N. */
async function decorate(row: SignoffRow[], now = new Date()): Promise<DecoratedSignoff[]> {
  if (row.length === 0) return [];
  const id = row.map((r) => r.projectSignoffId);
  const counted = await db()
    .select({
      projectSignoffId: signoffRevision.projectSignoffId,
      n: sql<number>`count(*)::int`,
    })
    .from(signoffRevision)
    .where(inArray(signoffRevision.projectSignoffId, id))
    .groupBy(signoffRevision.projectSignoffId);
  const byId = new Map(counted.map((c) => [c.projectSignoffId, c.n]));
  const paid = await paidInvoiceIdSet(row);

  return row.map((r) => ({
    ...r,
    derived: deriveWindow(
      r,
      byId.get(r.projectSignoffId) ?? 0,
      now,
      r.invoiceId != null && paid.has(r.invoiceId),
    ),
  }));
}

/**
 * Strip everything a client must not see: the internal note, the author, and the
 * deliverable snapshot (which carries verifiedAt — INTERNAL QA that must never
 * surface as if it were the client's sign-off).
 */
export function toClientShape<T extends SignoffRow>(row: T) {
  const { note: _note, deliverableSnapshot: _snapshot, createdBy: _createdBy, ...rest } = row;
  return rest;
}

export async function assertClientOwnsProject(userId: number, projectId: number) {
  const [own] = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .innerJoin(client, eq(project.clientId, client.clientId))
    .where(and(eq(project.projectId, projectId), eq(client.userId, userId)))
    .limit(1);
  if (!own) throw new HTTPException(404, { message: "Project not found" });
}

export async function listSignoff(opt: {
  role: string;
  userId: number;
  projectId?: number | null;
}) {
  const d = db();

  if (opt.role === "client") {
    const condition = [eq(client.userId, opt.userId)];
    if (opt.projectId != null) condition.push(eq(projectSignoff.projectId, opt.projectId));
    // A draft is not a document the client has been shown. Never leak one.
    condition.push(sql`${projectSignoff.status} <> 'draft'`);
    const row = await d
      .select({ s: projectSignoff })
      .from(projectSignoff)
      .innerJoin(project, eq(projectSignoff.projectId, project.projectId))
      .innerJoin(client, eq(project.clientId, client.clientId))
      .where(and(...condition))
      .orderBy(desc(projectSignoff.createdAt));
    const decorated = await decorate(row.map((r) => r.s));
    return decorated.map((r) => ({ ...toClientShape(r), derived: r.derived }));
  }

  const row =
    opt.projectId != null
      ? await d
          .select()
          .from(projectSignoff)
          .where(eq(projectSignoff.projectId, opt.projectId))
          .orderBy(desc(projectSignoff.createdAt))
      : await d.select().from(projectSignoff).orderBy(desc(projectSignoff.createdAt));
  return decorate(row);
}

/** Load one row, enforcing the same ownership rule as the list. */
export async function loadSignoff(id: number, role: string, userId: number): Promise<SignoffRow> {
  const [row] = await db()
    .select()
    .from(projectSignoff)
    .where(eq(projectSignoff.projectSignoffId, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Sign-off not found" });
  if (role === "client") {
    await assertClientOwnsProject(userId, row.projectId);
    if (row.status === "draft") throw new HTTPException(404, { message: "Sign-off not found" });
  }
  return row;
}

export async function getSignoff(id: number, role: string, userId: number) {
  const row = await loadSignoff(id, role, userId);
  const [decorated] = await decorate([row]);
  const revision = await db()
    .select()
    .from(signoffRevision)
    .where(eq(signoffRevision.projectSignoffId, id))
    .orderBy(desc(signoffRevision.createdAt));

  if (role === "client") {
    return { ...toClientShape(decorated), derived: decorated.derived, revision };
  }
  return { ...decorated, revision };
}

// ─── Write (team) ────────────────────────────────────

export interface CreateSignoffInput {
  projectId: number;
  title: string;
  scopeSummary: string;
  /** Integer CENTS. Never a peso float. */
  finalPaymentCents: number;
  contractId?: number | null;
  paymentDueDayCount?: number;
  revisionWindowMonthCount?: number;
  freeRevisionTotalCount?: number;
  documentUrl?: string | null;
  note?: string | null;
}

export async function createSignoff(input: CreateSignoffInput, userId: number) {
  const [proj] = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .where(eq(project.projectId, input.projectId))
    .limit(1);
  if (!proj) throw new HTTPException(404, { message: "Project not found" });

  const [created] = await db()
    .insert(projectSignoff)
    .values({
      projectId: input.projectId,
      contractId: input.contractId ?? null,
      title: input.title,
      scopeSummary: input.scopeSummary,
      status: "draft",
      finalPaymentCents: input.finalPaymentCents,
      paymentDueDayCount: input.paymentDueDayCount ?? 7,
      revisionWindowMonthCount: input.revisionWindowMonthCount ?? 6,
      freeRevisionTotalCount: input.freeRevisionTotalCount ?? 5,
      documentUrl: input.documentUrl ?? null,
      note: input.note ?? null,
      createdBy: userId,
    })
    .returning();

  await db().insert(activityLog).values({
    userId,
    action: "project_signoff_created",
    entityType: "project_signoff",
    entityId: created.projectSignoffId,
    metadata: { projectId: input.projectId, title: input.title },
  });

  const [decorated] = await decorate([created]);
  return decorated;
}

/** The only fields a SIGNED sign-off still allows. Everything else is frozen. */
const MUTABLE_AFTER_SIGNING = new Set(["note", "documentUrl"]);

export type UpdateSignoffPatch = Partial<{
  title: string;
  scopeSummary: string;
  finalPaymentCents: number;
  contractId: number | null;
  paymentDueDayCount: number;
  revisionWindowMonthCount: number;
  freeRevisionTotalCount: number;
  documentUrl: string | null;
  note: string | null;
}>;

export async function updateSignoff(id: number, patch: UpdateSignoffPatch) {
  const [row] = await db()
    .select()
    .from(projectSignoff)
    .where(eq(projectSignoff.projectSignoffId, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Sign-off not found" });

  const key = Object.keys(patch).filter((k) => patch[k as keyof UpdateSignoffPatch] !== undefined);

  if (row.signedAt) {
    const frozen = key.filter((k) => !MUTABLE_AFTER_SIGNING.has(k));
    if (frozen.length > 0) {
      throw new HTTPException(409, {
        message: `A signed sign-off is frozen — ${frozen.join(", ")} cannot be changed. Issue a superseding sign-off instead.`,
      });
    }
  }
  if (row.status === "void") {
    throw new HTTPException(409, { message: "A void sign-off cannot be edited" });
  }
  if (key.length === 0) {
    const [unchanged] = await decorate([row]);
    return unchanged;
  }

  const [updated] = await db()
    .update(projectSignoff)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projectSignoff.projectSignoffId, id))
    .returning();

  const [decorated] = await decorate([updated]);
  return decorated;
}

/** draft -> issued. Freezes the deliverable list and puts the document on /hub. */
export async function issueSignoff(id: number, userId: number) {
  const [row] = await db()
    .select()
    .from(projectSignoff)
    .where(eq(projectSignoff.projectSignoffId, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Sign-off not found" });
  if (row.signedAt) throw new HTTPException(409, { message: "Already signed" });
  if (row.status !== "draft") {
    throw new HTTPException(409, {
      message: `Only a draft can be issued (status is ${row.status})`,
    });
  }

  // Snapshot the deliverable list. verifiedAt is copied as frozen EVIDENCE for the
  // team — it is internal QA and is stripped from every client read path.
  const snapshotSource = await db()
    .select({
      deliverableId: deliverable.deliverableId,
      title: deliverable.title,
      status: deliverable.status,
      verifiedAt: deliverable.verifiedAt,
    })
    .from(deliverable)
    .where(eq(deliverable.projectId, row.projectId));

  const now = new Date();
  let updated: SignoffRow | undefined;
  try {
    [updated] = await db()
      .update(projectSignoff)
      .set({
        status: "issued",
        issuedAt: now,
        deliverableSnapshot: snapshotSource.map((s) => ({
          deliverableId: s.deliverableId,
          title: s.title,
          status: s.status,
          verifiedAt: s.verifiedAt ? new Date(s.verifiedAt).toISOString() : null,
        })),
        updatedAt: now,
      })
      .where(and(eq(projectSignoff.projectSignoffId, id), eq(projectSignoff.status, "draft")))
      .returning();
  } catch (err) {
    // idx_project_signoff_open: at most ONE issued sign-off per project, so the
    // client is never shown two competing documents to sign.
    log.warn({ err, id }, "Issue rejected by the open-signoff unique index");
    throw new HTTPException(409, {
      message: "This project already has a sign-off awaiting signature",
    });
  }
  if (!updated) throw new HTTPException(409, { message: "Sign-off is no longer a draft" });

  const [owner] = await db()
    .select({ clientId: project.clientId })
    .from(project)
    .where(eq(project.projectId, row.projectId))
    .limit(1);

  if (owner?.clientId) {
    // notification_type is a DB enum with no sign-off member, so 'custom' until an
    // ALTER TYPE lands. Deliberately NOT widened inside migration 016.
    await db().insert(notification).values({
      clientId: owner.clientId,
      projectId: row.projectId,
      type: "custom",
      title: "Project Sign-off ready to sign",
      body: `${updated.title} is ready for your sign-off. Use any remaining complementary revisions before you sign.`,
    });
  }

  await db().insert(activityLog).values({
    userId,
    action: "project_signoff_issued",
    entityType: "project_signoff",
    entityId: id,
    metadata: { projectId: row.projectId, deliverableCount: snapshotSource.length },
  });

  const [decorated] = await decorate([updated]);
  return decorated;
}

// ─── Sign (the money-moving path) ────────────────────

export interface SignInput {
  signedName: string;
  signedMethod: SignoffMethod;
  signedIp: string | null;
  signedUserAgent: string | null;
  userId: number;
  /** Deemed/offline are recorded BY an admin, so signedBy stays null. */
  isOnBehalf: boolean;
}

export async function signSignoff(id: number, input: SignInput) {
  const [pre] = await db()
    .select()
    .from(projectSignoff)
    .where(eq(projectSignoff.projectSignoffId, id))
    .limit(1);
  if (!pre) throw new HTTPException(404, { message: "Sign-off not found" });
  if (pre.status === "void") throw new HTTPException(409, { message: "This sign-off was voided" });
  if (!pre.issuedAt) {
    throw new HTTPException(409, { message: "This sign-off has not been issued yet" });
  }
  if (pre.signedAt) throw new HTTPException(409, { message: "Already signed" });

  const signedAt = new Date();

  const result = await db().transaction(async (tx) => {
    // THE GUARD. Zero rows means another request signed it first, and we bail
    // BEFORE minting an invoice. This is why two clicks cannot make two receivables.
    const [signed] = await tx
      .update(projectSignoff)
      .set({
        status: "signed",
        signedAt,
        signedBy: input.isOnBehalf ? null : input.userId,
        signedName: input.signedName,
        signedMethod: input.signedMethod,
        signedIp: input.signedIp,
        signedUserAgent: input.signedUserAgent,
        updatedAt: signedAt,
      })
      .where(and(eq(projectSignoff.projectSignoffId, id), isNull(projectSignoff.signedAt)))
      .returning();

    if (!signed) throw new HTTPException(409, { message: "Already signed" });

    let row: SignoffRow = signed;

    if (signed.finalPaymentCents > 0) {
      const [inv] = await tx
        .insert(invoice)
        .values({
          projectId: signed.projectId,
          amountCents: signed.finalPaymentCents,
          label: `${signed.title} — final payment`,
          status: "unpaid",
          dueDate: addDay(signedAt, signed.paymentDueDayCount),
          notes: `Due on signing of the Project Sign-off document — ${signed.paymentDueDayCount} days from ${signedAt.toISOString().slice(0, 10)}.`,
        })
        .returning();

      const [linked] = await tx
        .update(projectSignoff)
        .set({ invoiceId: inv.invoiceId, updatedAt: new Date() })
        .where(eq(projectSignoff.projectSignoffId, id))
        .returning();
      row = linked;

      const [owner] = await tx
        .select({ clientId: project.clientId })
        .from(project)
        .where(eq(project.projectId, signed.projectId))
        .limit(1);

      if (owner?.clientId) {
        await tx.insert(notification).values({
          clientId: owner.clientId,
          projectId: signed.projectId,
          type: "invoice_issued",
          title: "Final payment due",
          body: `${signed.title} is signed. The final payment invoice is due in ${signed.paymentDueDayCount} days.`,
        });
      }
    }

    await tx.insert(activityLog).values({
      userId: input.userId,
      action: "project_signoff_signed",
      entityType: "project_signoff",
      entityId: id,
      metadata: {
        projectId: signed.projectId,
        signedMethod: input.signedMethod,
        finalPaymentCents: signed.finalPaymentCents,
        invoiceId: row.invoiceId,
      },
    });

    return row;
  });

  log.info({ id, method: input.signedMethod }, "Project sign-off signed");
  const [decorated] = await decorate([result]);
  return decorated;
}

// ─── Revision ledger ─────────────────────────────────

/**
 * Consume one complementary revision round.
 *
 * The gate lives HERE, in the write path, under SELECT ... FOR UPDATE — never only
 * in the /hub query. Exactly two cases are allowed:
 *   1. unsigned AND used < total                        -> isPostSignoff false
 *   2. signed   AND now < window end AND used < total   -> isPostSignoff true
 * Anything else is a 409 that names the reason.
 */
export async function recordRevision(
  id: number,
  input: { note: string; userId: number },
  now: Date = new Date(),
) {
  const { description } = await buildRevisionTaskDescription(input.note);

  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(projectSignoff)
      .where(eq(projectSignoff.projectSignoffId, id))
      .limit(1)
      .for("update");
    if (!row) throw new HTTPException(404, { message: "Sign-off not found" });
    if (row.status === "void") {
      throw new HTTPException(409, { message: "This sign-off was voided" });
    }

    const [counted] = await tx
      .select({
        used: sql<number>`count(*)::int`,
        maxRound: sql<number>`coalesce(max(${signoffRevision.roundNumber}), 0)::int`,
      })
      .from(signoffRevision)
      .where(eq(signoffRevision.projectSignoffId, id));

    const used = counted?.used ?? 0;
    const remaining = row.freeRevisionTotalCount - used;

    if (remaining <= 0) {
      throw new HTTPException(409, {
        message: `Free revisions are exhausted — all ${row.freeRevisionTotalCount} complementary rounds have been used. Further work is a change order.`,
      });
    }

    const isPostSignoff = row.signedAt != null;
    if (isPostSignoff) {
      const endsAt = addMonth(new Date(row.signedAt as Date), row.revisionWindowMonthCount);
      if (now.getTime() >= endsAt.getTime()) {
        throw new HTTPException(409, {
          message: `The ${row.revisionWindowMonthCount}-month revision window closed on ${endsAt
            .toISOString()
            .slice(0, 10)} — this is a change order or falls under the maintenance agreement.`,
        });
      }
    }

    // Reuse the exact deliverable POST /api/projects/:id/revision-task creates, so
    // one revision produces one task no matter which door it came through.
    const [task] = await tx
      .insert(deliverable)
      .values({
        projectId: row.projectId,
        title: "Client revision",
        description,
        status: "not_started",
        priority: 0,
      })
      .returning();

    // The unique (project_signoff_id, round_number) index is the last line of defence.
    const [ledger] = await tx
      .insert(signoffRevision)
      .values({
        projectSignoffId: id,
        deliverableId: task.deliverableId,
        roundNumber: (counted?.maxRound ?? 0) + 1,
        note: input.note,
        isPostSignoff,
        requestedBy: input.userId,
      })
      .returning();

    await tx.insert(activityLog).values({
      userId: input.userId,
      action: "signoff_revision_recorded",
      entityType: "project_signoff",
      entityId: id,
      metadata: {
        roundNumber: ledger.roundNumber,
        isPostSignoff,
        deliverableId: task.deliverableId,
      },
    });

    return {
      revision: ledger,
      deliverable: task,
      derived: deriveWindow(row, used + 1, now),
    };
  });
}

// ─── Void ────────────────────────────────────────────

/**
 * Void an UNSIGNED sign-off. A signed one is never voided — it owns a real
 * receivable, and voiding it would orphan the invoice. Supersede it by issuing a new
 * one instead (the partial unique index allows exactly that once this one is signed).
 */
export async function voidSignoff(id: number, reason: string, userId: number) {
  const [row] = await db()
    .select()
    .from(projectSignoff)
    .where(eq(projectSignoff.projectSignoffId, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Sign-off not found" });
  if (row.signedAt) {
    throw new HTTPException(409, {
      message:
        "A signed sign-off is never voided — it owns a real invoice. Issue a superseding sign-off instead.",
    });
  }

  const stampedNote = [row.note, `[voided ${new Date().toISOString()}] ${reason}`]
    .filter(Boolean)
    .join("\n");

  const [updated] = await db()
    .update(projectSignoff)
    .set({ status: "void", note: stampedNote, updatedAt: new Date() })
    .where(and(eq(projectSignoff.projectSignoffId, id), isNull(projectSignoff.signedAt)))
    .returning();
  if (!updated) {
    throw new HTTPException(409, { message: "Sign-off was signed before it could be voided" });
  }

  await db().insert(activityLog).values({
    userId,
    action: "project_signoff_voided",
    entityType: "project_signoff",
    entityId: id,
    metadata: { projectId: row.projectId, reason },
  });

  const [decorated] = await decorate([updated]);
  return decorated;
}
