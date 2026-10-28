/**
 * /api/bids — the members' Bids page (apps/web AdminBids.tsx).
 *
 * Read-only views of what bid-sync.service.ts keeps, plus the few things a member
 * does by hand: mark the feed seen, turn the email off, re-rate or hide a bid, and
 * start a check now. Admin console users only: the page names partners, prices and
 * our own odds.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { bid, bidMember, bidSync, bidUpdate } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { canRate } from "../services/bid-rate.service.js";
import { isSyncRunning, startBidSyncNow } from "../services/bid-sync.service.js";
import type { Variables } from "../types/context.js";
import { plainBuyer, plainTitle } from "../utils/bid-text.js";

const bids = new Hono<{ Variables: Variables }>();
bids.use("*", requireAuth, requireAdmin);

const FEED_DAYS = 30;
const FIRST_LOOK_DAYS = 3;
/** The real deadline: the one read from the notice text, else PhilGEPS's closing date. */
const DUE = sql`coalesce(${bid.dueAt}, ${bid.closingAt})`;

type BidRow = typeof bid.$inferSelect;

/**
 * The place, minus what the buyer's own name already says: "Makati City" in
 * "Makati City, Metro Manila" leaves "Metro Manila"; "Ibaan, Batangas" leaves nothing.
 */
export function placeOf(place: string | null, buyer: string): string | null {
  if (!place) return null;
  const said = buyer.toLowerCase();
  const rest = place
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !said.includes(p.toLowerCase()));
  return rest.length ? rest.join(", ") : null;
}

function view(r: BidRow) {
  const buyer = r.shortBuyer || plainBuyer(r.buyer);
  return {
    ref: r.ref,
    title: r.shortTitle || plainTitle(r.title, r.buyer),
    fullTitle: r.title,
    buyer,
    fullBuyer: r.buyer,
    place: placeOf(r.place || r.area, buyer),
    abc: r.abc === null ? null : Number(r.abc),
    preBidAt: r.preBidAt,
    preBidTime: r.preBidTime,
    preBidPlace: r.preBidPlace,
    closingAt: r.closingAt,
    dueAt: r.dueAt ?? r.closingAt,
    isDueFromText: r.dueAt !== null,
    isFit: r.isFit,
    fitReason: r.fitReason,
    win: r.win,
    kind: r.kind,
    topic: r.topic,
    joinNote: r.joinNote,
    whyNote: r.whyNote,
    note: r.note,
    ratedBy: r.ratedBy,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    contactEmail: r.contactEmail,
    mode: r.mode,
    category: r.category,
    deliveryPeriod: r.deliveryPeriod,
    publishedOn: r.publishedOn,
    supplementCount: r.supplementCount,
    fitAt: r.fitAt,
    isHidden: r.isHidden,
  };
}

async function member(userId: number) {
  const [row] = await db().select().from(bidMember).where(eq(bidMember.userId, userId)).limit(1);
  return row ?? { userId, seenAt: null, isEmail: true, updatedAt: null };
}

async function lastRuns() {
  const runs = await db().select().from(bidSync).orderBy(desc(bidSync.startedAt)).limit(5);
  return {
    last: runs[0] ?? null,
    lastGood: runs.find((r) => r.status === "ok" || r.status === "partial") ?? null,
  };
}

// ─── Read ─────────────────────────────────────────────

bids.get("/", async (c) => {
  const now = new Date();
  const rows = await db()
    .select()
    .from(bid)
    .where(
      and(
        eq(bid.status, "open"),
        sql`${DUE} >= ${now.toISOString()}`,
        eq(bid.isFit, true),
      ),
    );
  const { last, lastGood } = await lastRuns();
  const me = await member(c.get("user").userId);
  return c.json({
    data: {
      bids: rows.map(view),
      sync: {
        isRunning: await isSyncRunning(),
        canRate: canRate(),
        last: last && { status: last.status, startedAt: last.startedAt, finishedAt: last.finishedAt, error: last.error },
        lastGood: lastGood && {
          startedAt: lastGood.startedAt,
          finishedAt: lastGood.finishedAt,
          status: lastGood.status,
          listedCount: lastGood.listedCount,
          unreadCount: lastGood.unreadCount,
          failedPageCount: lastGood.failedPageCount,
        },
      },
      member: { seenAt: me.seenAt, isEmail: me.isEmail },
    },
    error: null,
  });
});

bids.get("/updates", async (c) => {
  const rows = await db()
    .select({
      id: bidUpdate.bidUpdateId,
      kind: bidUpdate.kind,
      summary: bidUpdate.summary,
      createdAt: bidUpdate.createdAt,
      bid,
    })
    .from(bidUpdate)
    .innerJoin(bid, eq(bid.bidId, bidUpdate.bidId))
    .where(gte(bidUpdate.createdAt, new Date(Date.now() - FEED_DAYS * 24 * 3600_000)))
    .orderBy(desc(bidUpdate.createdAt), desc(bidUpdate.bidUpdateId))
    .limit(300);
  return c.json({
    data: rows.map((r) => ({ id: r.id, kind: r.kind, summary: r.summary, createdAt: r.createdAt, bid: view(r.bid) })),
    error: null,
  });
});

/** The sidebar badge: feed rows since this member last opened Updates. */
bids.get("/unseen", async (c) => {
  const me = await member(c.get("user").userId);
  // A member who never opened the feed is shown the last three days, not a month.
  const since = me.seenAt ?? new Date(Date.now() - FIRST_LOOK_DAYS * 24 * 3600_000);
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(bidUpdate)
    .where(gt(bidUpdate.createdAt, since));
  return c.json({ data: { count: row?.count ?? 0 }, error: null });
});

// ─── Member ───────────────────────────────────────────

bids.post("/seen", async (c) => {
  const userId = c.get("user").userId;
  const now = new Date();
  await db()
    .insert(bidMember)
    .values({ userId, seenAt: now })
    .onConflictDoUpdate({ target: bidMember.userId, set: { seenAt: now, updatedAt: now } });
  return c.json({ data: { seenAt: now }, error: null });
});

bids.patch("/member", zValidator("json", z.object({ isEmail: z.boolean() })), async (c) => {
  const userId = c.get("user").userId;
  const { isEmail } = c.req.valid("json");
  const now = new Date();
  await db()
    .insert(bidMember)
    .values({ userId, isEmail })
    .onConflictDoUpdate({ target: bidMember.userId, set: { isEmail, updatedAt: now } });
  return c.json({ data: { isEmail }, error: null });
});

// ─── Sync ─────────────────────────────────────────────

bids.post("/sync", async (c) => {
  const started = await startBidSyncNow("manual");
  return c.json({ data: { started, isRunning: true }, error: null }, started ? 202 : 200);
});

// ─── Edit one bid ─────────────────────────────────────
// Registered last: "/:ref" would otherwise swallow the static paths above.

const editSchema = z
  .object({
    win: z.enum(["good", "fair", "low"]).nullable(),
    joinNote: z.string().max(200).nullable(),
    whyNote: z.string().max(200).nullable(),
    note: z.string().max(1000).nullable(),
    isFit: z.boolean(),
    isHidden: z.boolean(),
  })
  .partial();

bids.patch("/:ref", zValidator("json", editSchema), async (c) => {
  const ref = c.req.param("ref");
  const edit = c.req.valid("json");
  const isRating = ["win", "joinNote", "whyNote", "isFit"].some((k) => k in edit);
  const [row] = await db()
    .update(bid)
    .set({
      ...edit,
      // A member's word on fit or odds is a team rating: the daily sync keeps it.
      ...(isRating ? { ratedBy: "team" } : {}),
      ...(edit.isFit ? { fitReason: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bid.ref, ref))
    .returning();
  if (!row) throw new HTTPException(404, { message: "Bid not found" });
  return c.json({ data: view(row), error: null });
});

export default bids;
