/**
 * Email campaign sender — v1 batch send + suppression.
 *
 * Closes the last open row in ROADMAP.md P1 "Lead generation & proposal automation":
 * leads are imported, targeted, and a proposal can be generated, but nothing sends it.
 *
 * Four invariants this file exists to hold. Each is asserted by
 * bench/roadmap/final/campaign.mjs, so weakening any of them turns the bench red:
 *
 *   1. SEPARATE IDENTITY — sending goes through sendOutreachEmail(), never send().
 *      A reputation hit on cold outreach must not stop a client magic-link landing.
 *   2. SUPPRESSION IS A GATE — checked inside sendCampaign() itself, immediately before
 *      each send, not only when the segment is resolved. A caller holding a lead id
 *      directly still cannot reach a suppressed address.
 *   3. THROTTLED, RESUMABLE, NO DOUBLE-SEND — recipient rows are materialized to the DB
 *      with their own status and sent one at a time at a rate cap. A restart resumes
 *      from the queued rows. Re-running a campaign never re-sends a sent row.
 *      (An unbounded Promise.all over 5000 addresses would reproduce the ENOBUFS socket
 *      exhaustion recorded in HANDOFF.md 2026-08-16.)
 *   4. HONEST DRY-RUN — previewCampaign() resolves and counts without sending anything,
 *      and the count it returns is post-suppression: the number that will actually send.
 */
import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { campaign, campaignRecipient, emailSuppression, lead } from "../db/schema.js";
import { isOutreachConfigured, sendOutreachEmail, wrapOutreach } from "./email.service.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("campaign");

/** Lead segment filter. Mirrors the existing /admin -> Leads targeting. */
export type Segment = {
  /** Lead status to include. Empty or absent means every status. */
  status?: string[];
  /** Reuse of the shipped "Outdated only" targeting rule. */
  isOutdatedOnly?: boolean;
  /** Cap the resolved set. Absent means no cap. */
  limitCount?: number;
};

export type SendResult = {
  campaignId: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  isComplete: boolean;
};

/** Injectable for tests. Never send a real email from a test. */
export type Sender = (to: string, subject: string, html: string) => Promise<void>;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

/** A per-recipient token that does NOT encode the address. */
const newUnsubscribeToken = () => randomBytes(24).toString("hex");

// ─── Suppression ─────────────────────────────────────

/** Every suppressed address, lowercased. */
export async function suppressionSet(): Promise<Set<string>> {
  const row = await db().select({ email: emailSuppression.email }).from(emailSuppression);
  return new Set(row.map((r) => normalizeEmail(r.email)));
}

export async function isSuppressed(email: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: emailSuppression.emailSuppressionId })
    .from(emailSuppression)
    .where(sql`lower(${emailSuppression.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return Boolean(row);
}

/**
 * Add an address to the permanent do-not-send list. Idempotent — re-suppressing an
 * already-suppressed address is a no-op rather than an error, so a duplicate bounce
 * webhook cannot fail.
 */
export async function suppress(
  email: string,
  reason: "unsubscribe" | "hard_bounce" | "complaint" | "soft_bounce_limit" | "manual",
  campaignId?: number,
  note?: string,
): Promise<void> {
  await db()
    .insert(emailSuppression)
    .values({
      email: normalizeEmail(email),
      reason,
      campaignId: campaignId ?? null,
      note: note ?? null,
    })
    .onConflictDoNothing();
  log.info({ email, reason }, "Address suppressed");
}

/** Resolve an unsubscribe token to its recipient, suppress the address, mark the row. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const [row] = await db()
    .select()
    .from(campaignRecipient)
    .where(eq(campaignRecipient.unsubscribeToken, token))
    .limit(1);

  if (!row) return false;

  await suppress(row.email, "unsubscribe", row.campaignId, "One-click unsubscribe");
  await db()
    .update(campaignRecipient)
    .set({ status: "unsubscribed", updatedAt: new Date() })
    .where(eq(campaignRecipient.campaignRecipientId, row.campaignRecipientId));

  return true;
}

// ─── Segment ─────────────────────────────────────────

/** Signals that a lead already runs a real system — the shipped "Outdated only" rule. */
const EXISTING_SYSTEM_MARK = ["shopify", "inventi", "wix", "squarespace", "wordpress"];

function hasExistingSystem(row: { description: string | null; notes: string | null }): boolean {
  const haystack = `${row.description ?? ""} ${row.notes ?? ""}`.toLowerCase();
  return EXISTING_SYSTEM_MARK.some((mark) => haystack.includes(mark));
}

/** Resolve a segment to sendable lead, already filtered by the suppression list. */
export async function resolveSegment(segment: Segment) {
  const status = segment.status?.length ? segment.status : null;

  const row = await db()
    .select({
      leadId: lead.leadId,
      name: lead.name,
      email: lead.email,
      company: lead.company,
      description: lead.description,
      notes: lead.notes,
    })
    .from(lead)
    .where(status ? inArray(lead.status, status as never) : undefined);

  const suppressed = await suppressionSet();

  let candidate = row.filter((r) => r.email && !suppressed.has(normalizeEmail(r.email)));
  if (segment.isOutdatedOnly) candidate = candidate.filter((r) => !hasExistingSystem(r));

  // Dedupe by address — two lead rows sharing an email must not both receive it.
  const seen = new Set<string>();
  candidate = candidate.filter((r) => {
    const key = normalizeEmail(r.email);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (segment.limitCount && segment.limitCount > 0) {
    candidate = candidate.slice(0, segment.limitCount);
  }
  return candidate;
}

/**
 * DRY-RUN. Resolves the segment and returns the real post-suppression count.
 * Sends nothing, writes nothing. The count returned is the count that will send.
 */
export async function previewCampaign(segment: Segment) {
  const candidate = await resolveSegment(segment);
  const suppressed = await suppressionSet();

  return {
    recipientCount: candidate.length,
    suppressedCount: suppressed.size,
    isOutreachConfigured: isOutreachConfigured(),
    sample: candidate.slice(0, 5).map((r) => ({ name: r.name, email: r.email, company: r.company })),
  };
}

// ─── Campaign lifecycle ──────────────────────────────

export async function listCampaign() {
  return db().select().from(campaign).orderBy(sql`${campaign.createdAt} DESC`);
}

export async function getCampaign(campaignId: number) {
  const [row] = await db()
    .select()
    .from(campaign)
    .where(eq(campaign.campaignId, campaignId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Campaign not found" });
  return row;
}

export async function listRecipient(campaignId: number) {
  return db()
    .select()
    .from(campaignRecipient)
    .where(eq(campaignRecipient.campaignId, campaignId))
    .orderBy(campaignRecipient.campaignRecipientId);
}

export async function createCampaign(input: {
  name: string;
  subject: string;
  bodyHtml: string;
  segment: Segment;
  ratePerHour?: number;
}) {
  const [row] = await db()
    .insert(campaign)
    .values({
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      segment: input.segment,
      ratePerHour: input.ratePerHour && input.ratePerHour > 0 ? input.ratePerHour : 60,
    })
    .returning();
  return row;
}

/**
 * Materialize one recipient row per resolved lead. Idempotent: the unique index on
 * (campaign_id, lead_id) plus onConflictDoNothing means calling this twice cannot
 * duplicate a recipient, which is what makes resume safe.
 */
export async function materializeRecipient(campaignId: number): Promise<number> {
  const row = await getCampaign(campaignId);
  const candidate = await resolveSegment((row.segment ?? {}) as Segment);

  if (candidate.length) {
    await db()
      .insert(campaignRecipient)
      .values(
        candidate.map((c) => ({
          campaignId,
          leadId: c.leadId,
          email: normalizeEmail(c.email),
          unsubscribeToken: newUnsubscribeToken(),
        })),
      )
      .onConflictDoNothing();
  }

  const [counted] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignRecipient)
    .where(eq(campaignRecipient.campaignId, campaignId));

  await db()
    .update(campaign)
    .set({ recipientCount: counted.count, updatedAt: new Date() })
    .where(eq(campaign.campaignId, campaignId));

  return counted.count;
}

const unsubscribeUrl = (token: string) =>
  `${process.env.API_URL ?? "http://localhost:6407"}/api/campaign/unsubscribe/${token}`;

/**
 * Send a campaign. Throttled to ratePerHour, one address at a time, resumable.
 *
 * Only rows still queued are sent, so a restart continues rather than re-sending.
 * Suppression is re-checked immediately before each send — the segment filter is not
 * trusted, because the list can grow while a long send is in flight.
 */
export async function sendCampaign(
  campaignId: number,
  option: { sender?: Sender; maxCount?: number; isSleepEnabled?: boolean } = {},
): Promise<SendResult> {
  const row = await getCampaign(campaignId);
  const sender = option.sender ?? sendOutreachEmail;

  // Fail loudly rather than log-and-succeed. Marking 5000 people contacted who were
  // never contacted is worse than refusing to start.
  if (!option.sender && !isOutreachConfigured()) {
    throw new HTTPException(400, {
      message:
        "Outreach transport is not configured (OUTREACH_SMTP_HOST + OUTREACH_FROM). " +
        "Campaign sending does not fall back to the transactional transport.",
    });
  }

  await db()
    .update(campaign)
    .set({ status: "sending", startedAt: row.startedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(campaign.campaignId, campaignId));

  const queued = await db()
    .select()
    .from(campaignRecipient)
    .where(
      and(eq(campaignRecipient.campaignId, campaignId), eq(campaignRecipient.status, "queued")),
    )
    .limit(option.maxCount ?? 100000);

  const delayMs = Math.max(0, Math.floor(3600000 / Math.max(1, row.ratePerHour)));
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const recipient of queued) {
    // INVARIANT 2 — the gate lives here, in the send path, not only in the segment query.
    if (await isSuppressed(recipient.email)) {
      await db()
        .update(campaignRecipient)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(eq(campaignRecipient.campaignRecipientId, recipient.campaignRecipientId));
      skippedCount += 1;
      continue;
    }

    try {
      await sender(
        recipient.email,
        row.subject,
        wrapOutreach(row.bodyHtml, unsubscribeUrl(recipient.unsubscribeToken)),
      );
      await db()
        .update(campaignRecipient)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(eq(campaignRecipient.campaignRecipientId, recipient.campaignRecipientId));
      sentCount += 1;
    } catch (err) {
      await db()
        .update(campaignRecipient)
        .set({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(eq(campaignRecipient.campaignRecipientId, recipient.campaignRecipientId));
      failedCount += 1;
    }

    // INVARIANT 3 — the throttle. One at a time, paced. Never a fan-out.
    if (delayMs > 0 && option.isSleepEnabled !== false) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const [remaining] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignRecipient)
    .where(
      and(eq(campaignRecipient.campaignId, campaignId), eq(campaignRecipient.status, "queued")),
    );

  const isComplete = remaining.count === 0;

  await db()
    .update(campaign)
    .set({
      status: isComplete ? "sent" : "paused",
      sentCount: sql`${campaign.sentCount} + ${sentCount}`,
      failedCount: sql`${campaign.failedCount} + ${failedCount}`,
      completedAt: isComplete ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(campaign.campaignId, campaignId));

  log.info(
    { campaignId, sentCount, failedCount, skippedCount, isComplete },
    "Campaign send pass complete",
  );
  return { campaignId, sentCount, failedCount, skippedCount, isComplete };
}

/** Record a hard bounce or complaint from the ESP and suppress the address. */
export async function recordDeliveryFailure(
  email: string,
  kind: "hard_bounce" | "complaint",
  campaignId?: number,
): Promise<void> {
  await suppress(email, kind, campaignId, `Reported by transport: ${kind}`);
  await db()
    .update(campaignRecipient)
    .set({ status: kind === "complaint" ? "complained" : "bounced", updatedAt: new Date() })
    .where(sql`lower(${campaignRecipient.email}) = ${normalizeEmail(email)}`);
}
