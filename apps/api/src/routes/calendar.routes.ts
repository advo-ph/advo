import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, or, isNull, isNotNull, between } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { calendarEvent, contract, deliverable, invoice, meeting, project, socialPost } from "../db/schema.js";
import { COMPLIANCE_DEADLINES } from "../data/compliance-deadlines.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { zodMessageHook } from "../utils/validators.js";

const calendar = new Hono<{ Variables: Variables }>();
calendar.use("*", requireAuth);

// Categories for *manual* events (validated app-side; the set grows).
const MANUAL_CATEGORIES = [
  "meeting",
  "deadline",
  "moa",
  "bir",
  "content",
  "social",
  "cold_email",
  "event",
] as const;

// Recurring PH compliance deadlines (BIR/SSS/PhilHealth/Pag-IBIG/DOLE) are
// generated from COMPLIANCE_DEADLINES at read time — see ../data/compliance-deadlines.ts.

const AGENCY_TAG: Record<string, string> = {
  bir: "BIR",
  sss: "SSS",
  philhealth: "PhilHealth",
  pagibig: "Pag-IBIG",
  dole: "DOLE",
};

// Unified event shape returned to the client. Derived events are read-only.
interface CalEvent {
  id: string;
  source: "manual" | "deliverable" | "invoice" | "project" | "social" | "contract" | "compliance" | "meeting";
  category: string;
  title: string;
  start: string; // ISO
  end: string | null;
  allDay: boolean;
  projectId: number | null;
  projectTitle: string | null;
  editable: boolean;
  location: string | null;
  description: string | null;
}

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/**
 * Widest window this endpoint will answer for. The compliance layer generates rows per
 * year in range with no table behind it, so an unbounded `to` is a request to synthesise
 * events until the process runs out of memory. Five years covers every real view (the
 * month grid asks for six weeks) and makes the pathological one a 400.
 */
const MAX_RANGE_MS = 5 * 366 * 24 * 60 * 60 * 1000;

// GET /api/calendar?from=&to=  →  manual events UNION derived (team-only)
calendar.get("/", requireTeam, zValidator("query", rangeSchema, zodMessageHook), async (c) => {
  const { from, to } = c.req.valid("query");
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 2, 0);

  if (end < start) {
    throw new HTTPException(400, { message: "`to` must be on or after `from`" });
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    throw new HTTPException(400, { message: "Date range too wide (max 5 years)" });
  }
  const d = db();

  const [manual, delivs, invs, projs, socials, contractRows, meetingRows] = await Promise.all([
    // An event OVERLAPS the window; it does not merely start inside it. Windowing on
    // starts_at alone dropped a multi-day event that began before the visible month,
    // even though it ran through the middle of it.
    d
      .select()
      .from(calendarEvent)
      .where(
        and(
          lte(calendarEvent.startsAt, end),
          or(isNull(calendarEvent.endsAt), gte(calendarEvent.endsAt, start)),
          // An event with no end is a point in time, so it must start inside the window.
          or(gte(calendarEvent.startsAt, start), gte(calendarEvent.endsAt, start)),
        ),
      ),
    d
      .select({
        id: deliverable.deliverableId,
        title: deliverable.title,
        due: deliverable.dueDate,
        projectId: deliverable.projectId,
        projectTitle: project.title,
      })
      .from(deliverable)
      .innerJoin(project, eq(deliverable.projectId, project.projectId))
      .where(and(gte(deliverable.dueDate, start), lte(deliverable.dueDate, end))),
    d
      .select({
        id: invoice.invoiceId,
        label: invoice.label,
        due: invoice.dueDate,
        paidAt: invoice.paidAt,
        projectId: invoice.projectId,
        projectTitle: project.title,
      })
      .from(invoice)
      .innerJoin(project, eq(invoice.projectId, project.projectId))
      // Two dates per row, either of which can land in the window. Filtered in SQL now;
      // this used to read the whole invoice table and narrow it in JS.
      .where(
        or(
          between(invoice.dueDate, start, end),
          between(invoice.paidAt, start, end),
        ),
      ),
    d
      .select({ id: project.projectId, title: project.title, createdAt: project.createdAt })
      .from(project)
      .where(and(gte(project.createdAt, start), lte(project.createdAt, end))),
    d
      .select({
        id: socialPost.socialPostId,
        platform: socialPost.platform,
        scheduledFor: socialPost.scheduledFor,
        publishedAt: socialPost.publishedAt,
      })
      .from(socialPost)
      .where(
        or(
          between(socialPost.scheduledFor, start, end),
          between(socialPost.publishedAt, start, end),
        ),
      ),
    // Contracts: surface signed + expiry dates.
    d
      .select({
        id: contract.contractId,
        title: contract.title,
        signedAt: contract.signedAt,
        expiresAt: contract.expiresAt,
        projectId: contract.projectId,
      })
      .from(contract)
      .where(
        or(
          between(contract.signedAt, start, end),
          between(contract.expiresAt, start, end),
        ),
      ),
    // Scheduled meetings — only those with starts_at set, overlapping the window.
    d
      .select({
        id: meeting.meetingId,
        title: meeting.title,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        projectId: meeting.projectId,
        location: meeting.location,
      })
      .from(meeting)
      .where(
        and(
          isNotNull(meeting.startsAt),
          lte(meeting.startsAt, end),
          or(isNull(meeting.endsAt), gte(meeting.endsAt, start)),
        ),
      ),
  ]);

  const events: CalEvent[] = [];

  for (const m of manual) {
    events.push({
      id: `manual-${m.calendarEventId}`,
      source: "manual",
      category: m.category,
      title: m.title,
      start: m.startsAt.toISOString(),
      end: m.endsAt ? m.endsAt.toISOString() : null,
      allDay: m.isAllDay,
      projectId: m.projectId,
      projectTitle: null,
      editable: true,
      location: m.location,
      description: m.description,
    });
  }

  for (const dv of delivs) {
    if (!dv.due) continue;
    events.push({
      id: `deliverable-${dv.id}`,
      source: "deliverable",
      category: "deliverable",
      title: dv.title,
      start: dv.due.toISOString(),
      end: null,
      allDay: true,
      projectId: dv.projectId,
      projectTitle: dv.projectTitle,
      editable: false,
      location: null,
      description: null,
    });
  }

  for (const iv of invs) {
    if (iv.due && iv.due >= start && iv.due <= end) {
      events.push({
        id: `invoice-due-${iv.id}`,
        source: "invoice",
        category: "invoice_due",
        title: `Invoice due — ${iv.label}`,
        start: iv.due.toISOString(),
        end: null,
        allDay: true,
        projectId: iv.projectId,
        projectTitle: iv.projectTitle,
        editable: false,
        location: null,
        description: null,
      });
    }
    if (iv.paidAt && iv.paidAt >= start && iv.paidAt <= end) {
      events.push({
        id: `invoice-paid-${iv.id}`,
        source: "invoice",
        category: "invoice_paid",
        title: `Invoice paid — ${iv.label}`,
        start: iv.paidAt.toISOString(),
        end: null,
        allDay: true,
        projectId: iv.projectId,
        projectTitle: iv.projectTitle,
        editable: false,
        location: null,
        description: null,
      });
    }
  }

  for (const p of projs) {
    events.push({
      id: `project-${p.id}`,
      source: "project",
      category: "kickoff",
      title: `Project started — ${p.title}`,
      start: p.createdAt.toISOString(),
      end: null,
      allDay: true,
      projectId: p.id,
      projectTitle: p.title,
      editable: false,
      location: null,
      description: null,
    });
  }

  for (const sp of socials) {
    const platform = sp.platform ? ` — ${sp.platform}` : "";
    if (sp.scheduledFor && sp.scheduledFor >= start && sp.scheduledFor <= end) {
      events.push({
        id: `social-scheduled-${sp.id}`,
        source: "social",
        category: "social_scheduled",
        title: `Post scheduled${platform}`,
        start: sp.scheduledFor.toISOString(),
        end: null,
        allDay: false,
        projectId: null,
        projectTitle: null,
        editable: false,
        location: null,
        description: null,
      });
    }
    if (sp.publishedAt && sp.publishedAt >= start && sp.publishedAt <= end) {
      events.push({
        id: `social-published-${sp.id}`,
        source: "social",
        category: "social_published",
        title: `Post published${platform}`,
        start: sp.publishedAt.toISOString(),
        end: null,
        allDay: false,
        projectId: null,
        projectTitle: null,
        editable: false,
        location: null,
        description: null,
      });
    }
  }

  for (const ct of contractRows) {
    if (ct.signedAt && ct.signedAt >= start && ct.signedAt <= end) {
      events.push({
        id: `contract-signed-${ct.id}`,
        source: "contract",
        category: "contract_signed",
        title: `Contract signed — ${ct.title}`,
        start: ct.signedAt.toISOString(),
        end: null,
        allDay: true,
        projectId: ct.projectId,
        projectTitle: null,
        editable: false,
        location: null,
        description: null,
      });
    }
    if (ct.expiresAt && ct.expiresAt >= start && ct.expiresAt <= end) {
      events.push({
        id: `contract-expires-${ct.id}`,
        source: "contract",
        category: "contract_expires",
        title: `Contract expires — ${ct.title}`,
        start: ct.expiresAt.toISOString(),
        end: null,
        allDay: true,
        projectId: ct.projectId,
        projectTitle: null,
        editable: false,
        location: null,
        description: null,
      });
    }
  }

  // Scheduled meetings — derived, read-only. Managed from the meetings tab.
  for (const mt of meetingRows) {
    if (!mt.startsAt) continue;
    events.push({
      id: `meeting-${mt.id}`,
      source: "meeting",
      category: "scheduled_meeting",
      title: mt.title,
      start: mt.startsAt.toISOString(),
      end: mt.endsAt ? mt.endsAt.toISOString() : null,
      allDay: false,
      projectId: mt.projectId ?? null,
      projectTitle: null,
      editable: false,
      location: mt.location ?? null,
      description: null,
    });
  }

  // Compliance deadlines (BIR/SSS/PhilHealth/Pag-IBIG/DOLE) — generated per year
  // in range from COMPLIANCE_DEADLINES (no DB rows). Statutory dates only; not
  // adjusted for weekends/holidays.
  const pushCompliance = (dt: Date, key: string, agency: string, name: string) => {
    if (dt >= start && dt <= end) {
      events.push({
        id: `compliance-${key}`,
        source: "compliance",
        category: "compliance_deadline",
        title: `${AGENCY_TAG[agency] ?? agency.toUpperCase()}: ${name}`,
        start: dt.toISOString(),
        end: null,
        allDay: true,
        projectId: null,
        projectTitle: null,
        editable: false,
        location: null,
        description: null,
      });
    }
  };
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    for (const d of COMPLIANCE_DEADLINES) {
      if (d.frequency === "monthly" && d.dueDay != null) {
        for (let m = 0; m < 12; m++) {
          // Clamp month-end filings (e.g. SSS day 30) to the month's last day.
          const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const day = Math.min(d.dueDay, lastDay);
          pushCompliance(new Date(Date.UTC(y, m, day)), `${d.id}-${y}-${m}`, d.agency, d.name);
        }
      } else if (d.dueDates) {
        for (const md of d.dueDates) {
          const [mm, dd] = md.split("-").map(Number);
          pushCompliance(new Date(Date.UTC(y, mm - 1, dd)), `${d.id}-${y}-${md}`, d.agency, d.name);
        }
      }
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return c.json({ data: events, error: null });
});

const eventShape = {
  title: z.string().min(1).max(255),
  category: z.enum(MANUAL_CATEGORIES).default("event"),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  isAllDay: z.boolean().default(false),
  projectId: z.number().int().nullable().optional(),
};

/** An event that ends before it starts is a typo, and used to save without complaint. */
const ORDER_MESSAGE = "End time must be after the start time.";
const isOutOfOrder = (startsAt?: string | null, endsAt?: string | null) =>
  Boolean(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt));

const createSchema = z.object(eventShape).superRefine((v, ctx) => {
  if (isOutOfOrder(v.startsAt, v.endsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: ORDER_MESSAGE, path: ["endsAt"] });
  }
});

calendar.post("/", requireTeam, zValidator("json", createSchema, zodMessageHook), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db()
    .insert(calendarEvent)
    .values({
      title: data.title,
      category: data.category,
      description: data.description ?? null,
      location: data.location ?? null,
      startsAt: new Date(data.startsAt),
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      isAllDay: data.isAllDay,
      projectId: data.projectId ?? null,
    })
    .returning();
  return c.json({ data: created, error: null }, 201);
});

const updateSchema = z.object(eventShape).partial();

calendar.patch("/:id", requireTeam, zValidator("json", updateSchema, zodMessageHook), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid event id" });
  }
  const data = c.req.valid("json");

  // A partial patch cannot be ordered in isolation: sending only endsAt against a stored
  // startsAt needs the stored value to be checkable. So merge, then check.
  const [existing] = await db()
    .select({ startsAt: calendarEvent.startsAt, endsAt: calendarEvent.endsAt })
    .from(calendarEvent)
    .where(eq(calendarEvent.calendarEventId, id))
    .limit(1);
  if (!existing) throw new HTTPException(404, { message: "Event not found" });

  const mergedStart = data.startsAt ?? existing.startsAt.toISOString();
  const mergedEnd =
    data.endsAt !== undefined ? data.endsAt : (existing.endsAt?.toISOString() ?? null);
  if (isOutOfOrder(mergedStart, mergedEnd)) {
    throw new HTTPException(400, { message: ORDER_MESSAGE });
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) values.title = data.title;
  if (data.category !== undefined) values.category = data.category;
  if (data.description !== undefined) values.description = data.description ?? null;
  if (data.location !== undefined) values.location = data.location ?? null;
  if (data.startsAt !== undefined) values.startsAt = new Date(data.startsAt);
  if (data.endsAt !== undefined) values.endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (data.isAllDay !== undefined) values.isAllDay = data.isAllDay;
  if (data.projectId !== undefined) values.projectId = data.projectId ?? null;

  const [updated] = await db()
    .update(calendarEvent)
    .set(values)
    .where(eq(calendarEvent.calendarEventId, id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Event not found" });
  return c.json({ data: updated, error: null });
});

calendar.delete("/:id", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid event id" });
  }
  const [deleted] = await db()
    .delete(calendarEvent)
    .where(eq(calendarEvent.calendarEventId, id))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Event not found" });
  return c.json({ data: { message: "Event deleted" }, error: null });
});

export default calendar;
