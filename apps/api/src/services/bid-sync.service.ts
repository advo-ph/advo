/**
 * The daily bid check: read every open PhilGEPS notice, keep the ones that fit ADVO,
 * and tell members what changed.
 *
 * One run, in order:
 *   1. List every open notice (philgeps.service.ts walks all ~600 pages).
 *   2. Read in full every notice not read before, every bid that fits (so a moved
 *      date or a new bid bulletin is caught), and any whose closing date moved.
 *   3. Keyword rules decide what is worth rating (bid-fit.service.ts). No model runs
 *      here, so a check costs no AI credits: ratings are written from the terminal
 *      (scripts/bid-rate.ts) and kept until the notice changes. A team rating always wins.
 *   4. Write the feed (`bid_update`): new fits, changes to a fit, pre-bid tomorrow,
 *      bids due within three days, and a bid PhilGEPS took down.
 *   5. Email each member who has not turned it off — only when the feed grew.
 *
 * A run that could not read the whole list is "partial": it marks nothing withdrawn,
 * because a page that failed to load is not a bid that disappeared. A bid leaves the
 * open list only after two complete runs in a row do not list it.
 *
 * Scheduled at 06:00 Manila in production (and on start-up when the last good run is
 * over a day old). Members can also press "Check now". One run at a time, enforced in
 * the database so a second API process cannot start another.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { bid, bidMember, bidSync, bidUpdate, user } from "../db/schema.js";
import { TEAM_NOT_FIT, TEAM_RATING } from "../data/bid-team-rating.js";
import { UNCLEAR_REASON, classifyBid, hasSoftwareSignal } from "./bid-fit.service.js";
import type { BidRating, RateInput } from "./bid-rate.service.js";
import { sendBidDigestEmail } from "./email.service.js";
import { listOpenNotices, readNotices, type ListedNotice, type Notice } from "./philgeps.service.js";
import { plainBuyer, plainTitle } from "../utils/bid-text.js";
import { env } from "../utils/env.js";
import { recordError } from "../utils/error-capture.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("bid-sync");

const RUN_HOUR_MANILA = 6;
const MANILA_OFFSET_MS = 8 * 3600_000;
const HOUR_MS = 3600_000;
/** A run still "running" after this long died with its process. */
const STALE_RUN_MS = 2 * HOUR_MS;
const MISSING_RUNS_TO_WITHDRAW = 2;
const PRE_BID_NOTICE_MS = 30 * HOUR_MS;
const DUE_NOTICE_MS = 72 * HOUR_MS;
const RETAIN_CLOSED_DAYS = 30;
const RETAIN_UPDATE_DAYS = 120;
const EMAIL_ITEM_LIMIT = 40;
const CHUNK = 500;

export type SyncTrigger = "schedule" | "manual" | "script";
type BidRow = typeof bid.$inferSelect;

// ─── Formatting ───────────────────────────────────────

export function peso(n: number | null): string {
  if (n === null) return "No budget printed";
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
  return `₱${Math.round(n / 1000)}k`;
}

function day(at: Date | string | null): string {
  if (!at) return "no date";
  return new Date(at).toLocaleString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

const toNumber = (v: string | number | null) => (v === null || v === undefined ? null : Number(v));
const sameTime = (a: Date | string | null, b: Date | string | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** What a rating depends on. A new hash means the notice changed and is rated again. */
function contentHash(n: Notice): string {
  return createHash("sha256")
    .update(
      JSON.stringify([n.title, n.abc, n.closingAt, n.preBid?.at, n.preBid?.place, n.supplementCount, n.description.slice(0, 3000)]),
    )
    .digest("hex");
}

/** "2026-11-18" + "2:00 PM" → that instant in Manila. */
function manilaInstant(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const t = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(time);
  let hour = t ? Number(t[1]) : 23;
  const minute = t ? Number(t[2]) : 59;
  if (t?.[3]) hour = (hour % 12) + (t[3].toUpperCase() === "PM" ? 12 : 0);
  const at = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

// ─── Run claim ────────────────────────────────────────

async function claimRun(trigger: SyncTrigger): Promise<number | null> {
  const d = db();
  await d
    .update(bidSync)
    .set({ status: "failed", finishedAt: new Date(), error: "Run did not finish (process stopped)" })
    .where(and(eq(bidSync.status, "running"), lt(bidSync.startedAt, new Date(Date.now() - STALE_RUN_MS))));
  const rows = await d.execute<{ bid_sync_id: number }>(sql`
    INSERT INTO bid_sync (trigger)
    SELECT ${trigger}
    WHERE NOT EXISTS (SELECT 1 FROM bid_sync WHERE status = 'running')
    RETURNING bid_sync_id
  `);
  const id = (rows as unknown as { bid_sync_id: number }[])[0]?.bid_sync_id;
  return id ? Number(id) : null;
}

export async function isSyncRunning(): Promise<boolean> {
  const [row] = await db()
    .select({ id: bidSync.bidSyncId })
    .from(bidSync)
    .where(and(eq(bidSync.status, "running"), gte(bidSync.startedAt, new Date(Date.now() - STALE_RUN_MS))))
    .limit(1);
  return !!row;
}

// ─── Steps ────────────────────────────────────────────

async function loadExisting(refs: string[]): Promise<Map<string, BidRow>> {
  const out = new Map<string, BidRow>();
  for (const part of chunks(refs, 1000)) {
    const rows = await db().select().from(bid).where(inArray(bid.ref, part));
    for (const r of rows) out.set(r.ref, r);
  }
  return out;
}

/** Plain-language changes to a bid that fits, comparing the stored row to a fresh read. */
function describeChanges(old: BidRow, n: Notice): string[] {
  const out: string[] = [];
  if (!sameTime(old.closingAt, n.closingAt) && n.closingAt) {
    out.push(`PhilGEPS closing moved from ${day(old.closingAt)} to ${day(n.closingAt)}`);
  }
  const keepsTextPreBid = old.preBidFromText && !n.preBid;
  if (!keepsTextPreBid && !sameTime(old.preBidAt, n.preBid?.at ?? null)) {
    out.push(n.preBid?.at ? `Pre-bid now ${day(n.preBid.at)}` : "Pre-bid removed from the notice");
  }
  const oldAbc = toNumber(old.abc);
  if (oldAbc !== n.abc && n.abc !== null) out.push(`Budget changed from ${peso(oldAbc)} to ${peso(n.abc)}`);
  if (n.supplementCount > old.supplementCount) {
    const added = n.supplementCount - old.supplementCount;
    out.push(added === 1 ? "New bid bulletin posted" : `${added} new bid bulletins posted`);
  }
  return out;
}

function noticeValues(n: Notice, now: Date) {
  return {
    ref: n.ref,
    title: n.title,
    buyer: n.buyer,
    area: n.area || null,
    solicitation: n.solicitation || null,
    mode: n.mode || null,
    classification: n.classification || null,
    category: n.category || null,
    abc: n.abc === null ? null : String(n.abc),
    deliveryPeriod: n.deliveryPeriod || null,
    contactName: n.contactName || null,
    contactPhone: n.contactPhone,
    contactEmail: n.contactEmail,
    contactText: n.contactText || null,
    supplementCount: n.supplementCount,
    publishedOn: n.publishedOn,
    closingAt: n.closingAt ? new Date(n.closingAt) : null,
    preBidAt: n.preBid?.at ? new Date(n.preBid.at) : null,
    preBidTime: n.preBid?.time || null,
    preBidPlace: n.preBid?.place || null,
    description: n.description || null,
    contentHash: contentHash(n),
    status: "open",
    missingRunCount: 0,
    readAt: now,
    lastSeenAt: now,
    updatedAt: now,
  };
}

const PRE_BID_FIELD = ["preBidAt", "preBidTime", "preBidPlace"];
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Write what the list and the fresh reads say. Ratings are set later, separately. */
async function writeListed(rows: ListedNotice[], notices: Map<string, Notice>, existing: Map<string, BidRow>, now: Date) {
  const d = db();
  const read = rows.filter((r) => notices.has(r.ref));
  const unreadKnown = rows.filter((r) => !notices.has(r.ref) && existing.has(r.ref));
  const unreadNew = rows.filter((r) => !notices.has(r.ref) && !existing.has(r.ref));

  for (const part of chunks(read, 200)) {
    const values = part.map((r) => {
      const n = notices.get(r.ref)!;
      const fit = classifyBid({ title: n.title, description: n.description, abc: n.abc });
      return {
        ...noticeValues(n, now),
        // The full text is kept only where a topic matched: 12,000 invitations to bid
        // for catering and roads are not worth storing.
        description: fit.topic ? n.description || null : null,
        businessCategory: r.businessCategory || null,
        topic: fit.topic,
        isCandidate: fit.isCandidate,
      };
    });
    await d
      .insert(bid)
      .values(values)
      .onConflictDoUpdate({
        target: bid.ref,
        set: {
          ...Object.fromEntries(
            Object.keys(values[0])
              .filter((k) => k !== "ref" && !PRE_BID_FIELD.includes(k))
              .map((k) => [k, sql.raw(`excluded.${snake(k)}`)]),
          ),
          // A pre-bid read from the notice text stays until the notice's own table has one.
          ...Object.fromEntries(
            PRE_BID_FIELD.map((k) => [
              k,
              sql.raw(`CASE WHEN excluded.pre_bid_at IS NULL AND bid.pre_bid_from_text THEN bid.${snake(k)} ELSE excluded.${snake(k)} END`),
            ]),
          ),
          preBidFromText: sql.raw("excluded.pre_bid_at IS NULL AND bid.pre_bid_from_text"),
        },
      });
  }

  for (const part of chunks(unreadKnown.map((r) => r.ref), 1000)) {
    await d
      .update(bid)
      .set({ status: "open", missingRunCount: 0, lastSeenAt: now })
      .where(inArray(bid.ref, part));
  }

  for (const part of chunks(unreadNew, 500)) {
    await d
      .insert(bid)
      .values(
        part.map((r) => {
          const fit = classifyBid({ title: r.title, abc: null });
          return {
            ref: r.ref,
            title: r.title,
            buyer: r.buyer,
            businessCategory: r.businessCategory || null,
            publishedOn: r.publishedOn,
            closingAt: r.closingAt ? new Date(r.closingAt) : null,
            topic: fit.topic,
            isCandidate: fit.isCandidate,
            lastSeenAt: now,
          };
        }),
      )
      .onConflictDoNothing();
  }
}

/**
 * Run today's rules over every open notice already read, so a change to the rules
 * reaches old rows too. A row that stops being a candidate stops being a fit, unless
 * a member rated it.
 */
async function reclassify(now: Date) {
  const d = db();
  const rows = await d
    .select({
      bidId: bid.bidId,
      title: bid.title,
      description: bid.description,
      abc: bid.abc,
      topic: bid.topic,
      isCandidate: bid.isCandidate,
      isFit: bid.isFit,
      ratedBy: bid.ratedBy,
    })
    .from(bid)
    .where(and(eq(bid.status, "open"), isNotNull(bid.readAt)));
  for (const r of rows) {
    const c = classifyBid({ title: r.title, description: r.description, abc: toNumber(r.abc) });
    // Checked even when nothing changed here: today's read may already have written the
    // new candidate flag, and a rules-only fit must still go when the rules drop it.
    const dropsFit = !c.isCandidate && r.isFit && r.ratedBy === "rule";
    if (c.topic === r.topic && c.isCandidate === r.isCandidate && !dropsFit) continue;
    await d
      .update(bid)
      .set({ topic: c.topic, isCandidate: c.isCandidate, ...(dropsFit ? { isFit: false, fitReason: "Not our kind of work" } : {}), updatedAt: now })
      .where(eq(bid.bidId, r.bidId));
  }
}

/** Open bids the keyword rules kept, read in full. */
async function openCandidates(): Promise<BidRow[]> {
  return db()
    .select()
    .from(bid)
    .where(and(eq(bid.status, "open"), eq(bid.isCandidate, true), isNotNull(bid.readAt)));
}

const isPastDue = (row: BidRow, now: Date) => {
  const due = row.dueAt ?? row.closingAt;
  return !!due && due < now;
};

/** Not rated by a member or the rules, and no rating yet for this version of the notice. */
const needsRating = (row: BidRow, now: Date) =>
  row.ratedBy !== "team" &&
  !classifyBid({ title: row.title, description: row.description, abc: toNumber(row.abc) }).ruleNotFit &&
  !isPastDue(row, now) &&
  !(row.ratedBy === "ai" && row.ratedHash === row.contentHash);

/**
 * Rules only: a sync never calls a model (ratings come from scripts/bid-rate.ts).
 * A bid the model rated keeps that rating when its notice changes, so a refresh never
 * drops it from the list; it waits in `pending` for a fresh rating. A bid never rated
 * shows on the rules' word: a fit only when its title names software or a system.
 */
async function rate(now: Date) {
  const d = db();
  await reclassify(now);
  for (const row of await openCandidates()) {
    if (row.ratedBy === "team") continue;
    const verdict = classifyBid({ title: row.title, description: row.description, abc: toNumber(row.abc) });
    if (verdict.ruleNotFit) {
      if (row.isFit || row.fitReason !== verdict.ruleNotFit || row.ratedBy !== "rule") {
        await d
          .update(bid)
          .set({ isFit: false, fitReason: verdict.ruleNotFit, ratedBy: "rule", ratedHash: row.contentHash, updatedAt: now })
          .where(eq(bid.bidId, row.bidId));
      }
      continue;
    }
    if (isPastDue(row, now) || row.ratedBy === "ai") continue;
    const isFit = hasSoftwareSignal(row.title);
    const fitReason = isFit ? null : UNCLEAR_REASON;
    if (row.isFit === isFit && row.fitReason === fitReason && row.ratedBy === "rule" && row.ratedHash === null) continue;
    await d.update(bid).set({ isFit, fitReason, ratedBy: "rule", ratedHash: null, updatedAt: now }).where(eq(bid.bidId, row.bidId));
  }
}

/** What scripts/bid-rate.ts hands to Claude: every open bid still waiting for a rating. */
export async function pendingRatings(now = new Date()): Promise<RateInput[]> {
  return (await openCandidates())
    .filter((row) => needsRating(row, now))
    .map((row) => ({
      ref: row.ref,
      title: row.title,
      buyer: row.buyer,
      area: row.area,
      abc: toNumber(row.abc),
      mode: row.mode,
      category: row.category,
      closingAt: row.closingAt ? day(row.closingAt) : null,
      preBid: row.preBidAt ? `${day(row.preBidAt)} at ${row.preBidPlace ?? "venue not printed"}` : null,
      description: row.description?.slice(0, 3000) ?? null,
    }));
}

/** Save ratings written in the terminal. A member's rating is never overwritten. */
export async function applyRatings(ratings: BidRating[], now = new Date()): Promise<{ applied: number; skipped: string[] }> {
  const d = db();
  const skipped: string[] = [];
  let applied = 0;
  for (const r of ratings) {
    const [row] = await d.select().from(bid).where(eq(bid.ref, r.ref)).limit(1);
    if (!row || row.ratedBy === "team") {
      skipped.push(r.ref);
      continue;
    }
    const due = r.bidsDue ? manilaInstant(r.bidsDue.date, r.bidsDue.time) : null;
    const preBid = !row.preBidAt && r.preBid ? manilaInstant(r.preBid.date, r.preBid.time) : null;
    await d
      .update(bid)
      .set({
        isFit: r.fit,
        fitReason: r.fit ? null : r.notFitReason || "Not a fit",
        win: r.win,
        kind: r.kind,
        shortTitle: r.what,
        shortBuyer: r.buyer,
        place: r.place,
        joinNote: r.join,
        whyNote: r.why,
        dueAt: due && !sameTime(due, row.closingAt) ? due : null,
        dueTime: due && !sameTime(due, row.closingAt) ? r.bidsDue!.time : null,
        ...(preBid ? { preBidAt: preBid, preBidTime: r.preBid!.time, preBidPlace: r.preBid!.place, preBidFromText: true } : {}),
        ratedBy: "ai",
        ratedHash: row.contentHash,
        updatedAt: now,
      })
      .where(eq(bid.bidId, row.bidId));
    applied++;
  }
  return { applied, skipped };
}

/** The team's hand ratings (data/bid-team-rating.ts), applied once per bid. */
async function applyTeamRatings(now: Date) {
  const d = db();
  for (const [ref, reason] of Object.entries(TEAM_NOT_FIT)) {
    await d
      .update(bid)
      .set({ isFit: false, fitReason: reason, ratedBy: "team", updatedAt: now })
      .where(and(eq(bid.ref, ref), or(isNull(bid.ratedBy), ne(bid.ratedBy, "team"))));
  }
  const refs = Object.keys(TEAM_RATING);
  const rows = await d.select().from(bid).where(inArray(bid.ref, refs));
  for (const row of rows) {
    if (row.ratedBy === "team") continue;
    const t = TEAM_RATING[row.ref];
    const due = manilaInstant(t.due.date, t.due.time);
    const differs = due && !sameTime(due, row.closingAt);
    await d
      .update(bid)
      .set({
        isFit: true,
        fitReason: null,
        win: t.win,
        kind: t.kind,
        shortTitle: t.shortTitle,
        shortBuyer: t.shortBuyer,
        place: t.place,
        joinNote: t.joinNote,
        whyNote: t.whyNote,
        note: t.note ?? null,
        dueAt: differs ? due : null,
        dueTime: differs ? t.due.time : null,
        ratedBy: "team",
        ratedHash: row.contentHash,
        updatedAt: now,
      })
      .where(eq(bid.bidId, row.bidId));
  }
}

/** The real deadline: the one read from the notice text, else PhilGEPS's closing date. */
const DUE = sql`coalesce(${bid.dueAt}, ${bid.closingAt})`;

const label = (b: Pick<BidRow, "shortBuyer" | "buyer" | "shortTitle" | "title">) =>
  `${b.shortBuyer || plainBuyer(b.buyer)} · ${b.shortTitle || plainTitle(b.title, b.buyer)}`;

/**
 * New fits and reminders. Changes and withdrawals are written where they are found.
 * The first good run ever is the baseline: what fits then is the starting list, not
 * news, so it records `fit_at` and writes nothing to the feed (and so emails nobody).
 */
async function writeFeed(now: Date, isBaseline: boolean) {
  const d = db();
  const fresh = await d
    .select()
    .from(bid)
    .where(and(eq(bid.status, "open"), eq(bid.isFit, true), isNull(bid.fitAt), sql`${DUE} >= ${now.toISOString()}`));
  for (const row of fresh) {
    await d.update(bid).set({ fitAt: now }).where(eq(bid.bidId, row.bidId));
    if (row.isHidden || isBaseline) continue;
    const next = row.preBidAt && row.preBidAt > now ? `Pre-bid ${day(row.preBidAt)}` : `Bids due ${day(row.dueAt ?? row.closingAt)}`;
    await d.insert(bidUpdate).values({ bidId: row.bidId, kind: "new", summary: `${peso(toNumber(row.abc))} · ${next}` });
  }

  if (isBaseline) return;
  const soon = await d
    .select()
    .from(bid)
    .where(and(eq(bid.status, "open"), eq(bid.isFit, true), eq(bid.isHidden, false), sql`${DUE} >= ${now.toISOString()}`));
  const recent = await d
    .select({ bidId: bidUpdate.bidId, kind: bidUpdate.kind })
    .from(bidUpdate)
    .where(and(inArray(bidUpdate.kind, ["pre_bid_soon", "due_soon"]), gte(bidUpdate.createdAt, new Date(now.getTime() - 4 * 24 * HOUR_MS))));
  const reminded = new Set(recent.map((r) => `${r.bidId}:${r.kind}`));
  for (const row of soon) {
    const pre = row.preBidAt?.getTime() ?? 0;
    if (pre > now.getTime() && pre - now.getTime() <= PRE_BID_NOTICE_MS && !reminded.has(`${row.bidId}:pre_bid_soon`)) {
      await d.insert(bidUpdate).values({
        bidId: row.bidId,
        kind: "pre_bid_soon",
        summary: `Pre-bid ${day(row.preBidAt)}${row.preBidPlace ? ` · ${row.preBidPlace}` : ""}`,
      });
    }
    const due = (row.dueAt ?? row.closingAt)?.getTime() ?? 0;
    if (due > now.getTime() && due - now.getTime() <= DUE_NOTICE_MS && !reminded.has(`${row.bidId}:due_soon`)) {
      await d.insert(bidUpdate).values({ bidId: row.bidId, kind: "due_soon", summary: `Bids due ${day(row.dueAt ?? row.closingAt)}` });
    }
  }
}

/** Close what passed its date; withdraw what two complete runs in a row did not list. */
async function settleMissing(runStart: Date, now: Date, isComplete: boolean) {
  const d = db();
  await d
    .update(bid)
    .set({ status: "closed", updatedAt: now })
    .where(and(eq(bid.status, "open"), sql`${DUE} < ${now.toISOString()}`));
  if (!isComplete) return;
  // PhilGEPS drops a notice from the open list at its closing date, even when the
  // text names a later bid deadline; only a notice gone BEFORE its closing date counts.
  await d
    .update(bid)
    .set({ missingRunCount: sql`${bid.missingRunCount} + 1` })
    .where(and(eq(bid.status, "open"), lt(bid.lastSeenAt, runStart), gte(bid.closingAt, now)));
  const gone = await d
    .update(bid)
    .set({ status: "withdrawn", updatedAt: now })
    .where(and(eq(bid.status, "open"), gte(bid.missingRunCount, MISSING_RUNS_TO_WITHDRAW)))
    .returning({ bidId: bid.bidId, isFit: bid.isFit, isHidden: bid.isHidden });
  const fits = gone.filter((g) => g.isFit && !g.isHidden);
  if (fits.length) {
    await d.insert(bidUpdate).values(
      fits.map((g) => ({ bidId: g.bidId, kind: "withdrawn", summary: "No longer listed on PhilGEPS before its closing date" })),
    );
  }
}

const KIND_LABEL: Record<string, string> = {
  new: "New",
  changed: "Changed",
  pre_bid_soon: "Pre-bid",
  due_soon: "Due soon",
  withdrawn: "Taken down",
};

async function emailDigest(since: Date): Promise<number> {
  const d = db();
  const items = await d
    .select({ kind: bidUpdate.kind, summary: bidUpdate.summary, bid })
    .from(bidUpdate)
    .innerJoin(bid, eq(bid.bidId, bidUpdate.bidId))
    .where(gte(bidUpdate.createdAt, since))
    .orderBy(desc(bid.abc));
  if (!items.length) return 0;
  const order = Object.keys(KIND_LABEL);
  items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  const recipients = await d
    .select({ email: user.email, isEmail: bidMember.isEmail })
    .from(user)
    .leftJoin(bidMember, eq(bidMember.userId, user.userId))
    .where(and(eq(user.role, "admin"), eq(user.isActive, true)));
  const to = recipients.filter((r) => r.email && r.isEmail !== false).map((r) => r.email);
  if (!to.length) return 0;

  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const subject = [
    counts.get("new") && `${counts.get("new")} new bid${counts.get("new") === 1 ? "" : "s"}`,
    counts.get("changed") && `${counts.get("changed")} changed`,
    (counts.get("pre_bid_soon") ?? 0) + (counts.get("due_soon") ?? 0) > 0 && "dates coming up",
    counts.get("withdrawn") && `${counts.get("withdrawn")} taken down`,
  ]
    .filter(Boolean)
    .join(", ");
  const lines = items.slice(0, EMAIL_ITEM_LIMIT).map((i) => ({
    label: KIND_LABEL[i.kind] ?? i.kind,
    line: label(i.bid),
    detail: i.summary,
  }));
  if (items.length > EMAIL_ITEM_LIMIT) {
    lines.push({ label: "", line: `And ${items.length - EMAIL_ITEM_LIMIT} more on the Bids page`, detail: "" });
  }
  const capitalised = subject.charAt(0).toUpperCase() + subject.slice(1);
  for (const address of to) await sendBidDigestEmail(address, `${capitalised} · ADVO bids`, lines);
  return to.length;
}

async function retain(now: Date) {
  const d = db();
  await d
    .delete(bid)
    .where(
      and(
        ne(bid.status, "open"),
        eq(bid.isFit, false),
        or(lt(bid.closingAt, new Date(now.getTime() - RETAIN_CLOSED_DAYS * 24 * HOUR_MS)), isNull(bid.closingAt)),
      ),
    );
  await d.delete(bidUpdate).where(lt(bidUpdate.createdAt, new Date(now.getTime() - RETAIN_UPDATE_DAYS * 24 * HOUR_MS)));
}

// ─── Run ──────────────────────────────────────────────

export type SyncSummary = { runId: number | null; status: string; listedCount: number; fitCount: number; updateCount: number };

export async function runBidSync(trigger: SyncTrigger): Promise<SyncSummary> {
  const runId = await claimRun(trigger);
  if (!runId) return { runId: null, status: "already running", listedCount: 0, fitCount: 0, updateCount: 0 };
  const d = db();
  const runStart = new Date();
  try {
    const [previous] = await d
      .select({ id: bidSync.bidSyncId })
      .from(bidSync)
      .where(inArray(bidSync.status, ["ok", "partial"]))
      .limit(1);
    const isBaseline = !previous;
    const list = await listOpenNotices(6);
    const isComplete = list.failedPageCount === 0 && list.rows.length > 0;
    log.info({ listed: list.rows.length, pages: list.pageCount, failedPages: list.failedPageCount }, "Open list read");

    const existing = await loadExisting(list.rows.map((r) => r.ref));
    const toRead = list.rows
      .filter((r) => {
        const old = existing.get(r.ref);
        if (!old || !old.readAt) return true;
        if (old.isFit && old.status === "open") return true;
        return !sameTime(old.closingAt, r.closingAt);
      })
      .map((r) => r.ref);
    const notices = await readNotices(toRead, 8, (done) => log.info({ done, of: toRead.length }, "Reading notices"));
    const now = new Date();

    const changed: { bidId: number; summary: string }[] = [];
    for (const [ref, n] of notices) {
      const old = existing.get(ref);
      if (old?.isFit && old.status === "open" && old.readAt && !old.isHidden) {
        for (const summary of describeChanges(old, n)) changed.push({ bidId: old.bidId, summary });
      }
    }

    await writeListed(list.rows, notices, existing, now);
    await applyTeamRatings(now);
    await rate(now);
    if (changed.length) await d.insert(bidUpdate).values(changed.map((c) => ({ ...c, kind: "changed" })));
    await settleMissing(runStart, now, isComplete);
    await writeFeed(now, isBaseline);
    const emailedCount = await emailDigest(runStart);
    await retain(now);

    const [{ unread, fit }] = await d.execute<{ unread: number; fit: number }>(sql`
      SELECT count(*) FILTER (WHERE read_at IS NULL)::int AS unread,
             count(*) FILTER (WHERE is_fit AND NOT is_hidden)::int AS fit
      FROM bid WHERE status = 'open'
    `) as unknown as { unread: number; fit: number }[];
    const [{ updates }] = await d.execute<{ updates: number }>(
      sql`SELECT count(*)::int AS updates FROM bid_update WHERE created_at >= ${runStart.toISOString()}`,
    ) as unknown as { updates: number }[];

    const status = isComplete ? "ok" : "partial";
    await d
      .update(bidSync)
      .set({
        status,
        finishedAt: new Date(),
        listedCount: list.rows.length,
        pageCount: list.pageCount,
        failedPageCount: list.failedPageCount,
        readCount: notices.size,
        readFailedCount: toRead.length - notices.size,
        unreadCount: unread,
        fitCount: fit,
        updateCount: updates,
        emailedCount,
      })
      .where(eq(bidSync.bidSyncId, runId));
    log.info({ status, listed: list.rows.length, read: notices.size, fit, updates, emailedCount }, "Bid sync done");
    return { runId, status, listedCount: list.rows.length, fitCount: fit, updateCount: updates };
  } catch (err) {
    recordError("bid-sync", err);
    log.error({ err }, "Bid sync failed");
    await d
      .update(bidSync)
      .set({ status: "failed", finishedAt: new Date(), error: err instanceof Error ? err.message.slice(0, 500) : String(err) })
      .where(eq(bidSync.bidSyncId, runId));
    return { runId, status: "failed", listedCount: 0, fitCount: 0, updateCount: 0 };
  }
}

/** Start a run in the background. False when one is already running. */
export async function startBidSyncNow(trigger: SyncTrigger): Promise<boolean> {
  if (await isSyncRunning()) return false;
  void runBidSync(trigger);
  return true;
}

// ─── Schedule ─────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | null = null;

/** Milliseconds from `now` to the next RUN_HOUR_MANILA:00 in Manila (UTC+8, no DST). */
export function msUntilNextRun(now = new Date()): number {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  const next = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate(), RUN_HOUR_MANILA) - MANILA_OFFSET_MS;
  return next > now.getTime() ? next - now.getTime() : next + 24 * HOUR_MS - now.getTime();
}

function scheduleNext() {
  timer = setTimeout(async () => {
    await runBidSync("schedule").catch((err) => log.error({ err }, "Scheduled bid sync crashed"));
    scheduleNext();
  }, msUntilNextRun());
}

/**
 * Production only (or BID_SYNC=on): a dev server must not crawl PhilGEPS on every
 * restart. BID_SYNC=off turns it off anywhere.
 */
export function startBidSync() {
  const flag = process.env.BID_SYNC;
  if (flag === "off" || (env().NODE_ENV !== "production" && flag !== "on")) return;
  scheduleNext();
  // Catch up when the box was down at 06:00.
  setTimeout(async () => {
    try {
      const [last] = await db()
        .select({ startedAt: bidSync.startedAt })
        .from(bidSync)
        .where(inArray(bidSync.status, ["ok", "partial"]))
        .orderBy(desc(bidSync.startedAt))
        .limit(1);
      if (!last || Date.now() - last.startedAt.getTime() > 26 * HOUR_MS) await startBidSyncNow("schedule");
    } catch (err) {
      log.error({ err }, "Bid sync catch-up check failed");
    }
  }, 90_000);
  log.info({ inMinutes: Math.round(msUntilNextRun() / 60_000) }, "Bid sync scheduled");
}

export function stopBidSync() {
  if (timer) clearTimeout(timer);
  timer = null;
}
