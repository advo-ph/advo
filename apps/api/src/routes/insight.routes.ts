/**
 * Insight routes — time entry (migration 024) and the three derived ops reads.
 *
 * Team-only. None of this reaches /hub, with one deliberate exception noted below.
 *
 * The revision budget is the exception: a client SHOULD see "3 of 5 rounds used", because
 * a cap nobody can see is a cap that enforces itself only by argument. That read is
 * scoped to the caller's own project and lives on the project-signoff router, which
 * already has the cross-tenant scoping the S1/S2/S3 fixes settled on — it is not
 * re-implemented here.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import {
  createTimeEntry,
  deleteTimeEntry,
  getCapacity,
  getProjectTimeSummary,
  listTimeEntry,
  updateTimeEntry,
} from "../services/time-entry.service.js";
import {
  getClientStaleness,
  getMoneyAtRisk,
  getRevisionBudget,
} from "../services/ops-insight.service.js";
import { EXPORT_SHEET, buildSheet } from "../services/bookkeeping.service.js";

/**
 * U+FEFF, written as a named constant rather than pasted into a template literal.
 *
 * Excel on Windows opens a UTF-8 CSV as the system codepage unless the file starts with
 * this byte order mark, and every peso sign and accented client name arrives as mojibake
 * in the bookkeeper's copy. An invisible character sitting in source is one the next
 * editor deletes by accident, and nobody finds out until a file is already sent.
 */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const insightRoutes = new Hono<{ Variables: Variables }>();

insightRoutes.use("*", requireAuth, requireTeam);

// ─── Time entry ──────────────────────────────────────

const onSchema = z.string().date();

const createSchema = z.object({
  projectId: z.number().int().positive(),
  deliverableId: z.number().int().positive().nullish(),
  teamMemberId: z.number().int().positive(),
  workedOn: onSchema,
  /** Integer MINUTES. 1..960 — the 024 CHECK, mirrored so the error is a sentence. */
  minuteCount: z.number().int().min(1).max(960),
  note: z.string().max(2000).nullish(),
});

const updateSchema = z.object({
  minuteCount: z.number().int().min(1).max(960).optional(),
  workedOn: onSchema.optional(),
  note: z.string().max(2000).nullish(),
});

insightRoutes.get("/time", async (c) => {
  const projectId = c.req.query("projectId");
  const teamMemberId = c.req.query("teamMemberId");
  return c.json({
    data: await listTimeEntry({
      projectId: projectId ? Number(projectId) : undefined,
      teamMemberId: teamMemberId ? Number(teamMemberId) : undefined,
      fromOn: c.req.query("fromOn") ?? undefined,
      toOn: c.req.query("toOn") ?? undefined,
    }),
    error: null,
  });
});

insightRoutes.post("/time", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  // Any team member may record time, including for someone else — an admin backfilling a
  // week is a real thing. created_by keeps the two distinguishable.
  return c.json({ data: await createTimeEntry(c.req.valid("json"), user.userId), error: null }, 201);
});

insightRoutes.patch("/time/:id", zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  return c.json({ data: await updateTimeEntry(id, c.req.valid("json")), error: null });
});

/** A correction is an edit or a delete — never a negative entry. See 024. */
insightRoutes.delete("/time/:id", async (c) => {
  await deleteTimeEntry(Number(c.req.param("id")));
  return c.json({ data: { message: "Time entry deleted" }, error: null });
});

/** What a project actually cost in EFFORT. Deliberately not in pesos — see the service. */
insightRoutes.get("/time/project/:id", async (c) => {
  return c.json({ data: await getProjectTimeSummary(Number(c.req.param("id"))), error: null });
});

/**
 * Who is carrying what, over a trailing window. A MEASUREMENT, not a verdict — nothing
 * in this codebase blocks an assignment on it.
 */
insightRoutes.get("/capacity", async (c) => {
  const raw = c.req.query("dayCount");
  const dayCount = raw ? Math.min(180, Math.max(1, Number(raw))) : 14;
  return c.json({ data: await getCapacity(dayCount), error: null });
});

// ─── Derived ops reads ───────────────────────────────

/**
 * The tile that would have caught Coffee Rush: in development, no signed contract.
 * Admin-only — this aggregates across every client, so it is not a team-wide read.
 */
insightRoutes.get("/money-at-risk", requireAdmin, async (c) => {
  return c.json({ data: await getMoneyAtRisk(), error: null });
});

insightRoutes.get("/revision-budget", async (c) => {
  const projectId = c.req.query("projectId");
  return c.json({
    data: await getRevisionBudget(projectId ? Number(projectId) : undefined),
    error: null,
  });
});

insightRoutes.get("/staleness", async (c) => {
  const raw = c.req.query("thresholdDayCount");
  const threshold = raw ? Math.min(365, Math.max(1, Number(raw))) : undefined;
  return c.json({ data: await getClientStaleness(threshold), error: null });
});

// ─── Bookkeeping export ──────────────────────────────

/**
 * A period's books as CSV, one sheet per request.
 *
 * ADMIN-ONLY, and not because the numbers are secret from the team — because this is the
 * only endpoint in the codebase that emits every client's money in one document, and an
 * export is the easiest thing in any system to walk out of the door with.
 *
 * Served as an attachment with an explicit filename so the browser saves rather than
 * renders it, and with `text/csv; charset=utf-8` plus a BOM — without the BOM, Excel on
 * Windows opens UTF-8 as the system codepage and every peso sign and accented client
 * name is mojibake in the bookkeeper's file.
 */
insightRoutes.get("/export/:sheet", requireAdmin, async (c) => {
  const sheet = c.req.param("sheet");
  if (!(EXPORT_SHEET as readonly string[]).includes(sheet)) {
    throw new HTTPException(404, {
      message: `Unknown sheet: ${sheet}. Available: ${EXPORT_SHEET.join(", ")}.`,
    });
  }

  const fromOn = c.req.query("fromOn");
  const toOn = c.req.query("toOn");
  const parsed = z
    .object({ fromOn: z.string().date(), toOn: z.string().date() })
    .safeParse({ fromOn, toOn });

  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "fromOn and toOn are required, as YYYY-MM-DD.",
    });
  }
  if (parsed.data.fromOn > parsed.data.toOn) {
    throw new HTTPException(400, { message: "fromOn must not be after toOn." });
  }

  const csv = await buildSheet(sheet as (typeof EXPORT_SHEET)[number], parsed.data);

  return c.body(`${BYTE_ORDER_MARK}${csv}`, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="advo-${sheet}-${parsed.data.fromOn}-to-${parsed.data.toOn}.csv"`,
    // An export of live money must not sit in a proxy or a browser cache.
    "Cache-Control": "no-store",
  });
});

export default insightRoutes;
