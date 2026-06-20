import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { calendarEvent, contract, deliverable, invoice, project, socialPost } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

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

// Recurring statutory BIR filing deadlines (calendar-year filers). Dates are
// the STATUTORY date — if one lands on a weekend/holiday the actual deadline
// moves to the next working day (NOT computed here). Conservative + editable;
// surfaced as read-only reference events the team can filter off. Verify the
// exact set with an accountant before relying on it.
const BIR_RULES: { month: number; day: number; key: string; label: string }[] = [
  { month: 0, day: 31, key: "1604c", label: "1604-C — Annual withholding (compensation)" },
  { month: 2, day: 1, key: "1604e", label: "1604-E — Annual withholding (expanded)" },
  { month: 3, day: 15, key: "itr", label: "1701/1702 — Annual income tax return" },
  { month: 0, day: 25, key: "vat-q4", label: "2550Q — Quarterly VAT (Q4)" },
  { month: 3, day: 25, key: "vat-q1", label: "2550Q — Quarterly VAT (Q1)" },
  { month: 6, day: 25, key: "vat-q2", label: "2550Q — Quarterly VAT (Q2)" },
  { month: 9, day: 25, key: "vat-q3", label: "2550Q — Quarterly VAT (Q3)" },
  { month: 4, day: 15, key: "it-q1", label: "1701Q — Quarterly income tax (Q1)" },
  { month: 7, day: 15, key: "it-q2", label: "1701Q — Quarterly income tax (Q2)" },
  { month: 10, day: 15, key: "it-q3", label: "1701Q — Quarterly income tax (Q3)" },
];

// Unified event shape returned to the client. Derived events are read-only.
interface CalEvent {
  id: string;
  source: "manual" | "deliverable" | "invoice" | "project" | "social" | "contract" | "bir";
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

// GET /api/calendar?from=&to=  →  manual events UNION derived (team-only)
calendar.get("/", requireTeam, zValidator("query", rangeSchema), async (c) => {
  const { from, to } = c.req.valid("query");
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const d = db();

  const [manual, delivs, invs, projs, socials, contractRows] = await Promise.all([
    d
      .select()
      .from(calendarEvent)
      .where(and(gte(calendarEvent.startsAt, start), lte(calendarEvent.startsAt, end))),
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
      .innerJoin(project, eq(invoice.projectId, project.projectId)),
    d
      .select({ id: project.projectId, title: project.title, createdAt: project.createdAt })
      .from(project)
      .where(and(gte(project.createdAt, start), lte(project.createdAt, end))),
    // Social posts carry no FK to a range, so filter scheduled/published in JS
    // below (mirrors the invoice due/paid pattern) rather than a SQL window.
    d
      .select({
        id: socialPost.socialPostId,
        platform: socialPost.platform,
        scheduledFor: socialPost.scheduledFor,
        publishedAt: socialPost.publishedAt,
      })
      .from(socialPost),
    // Contracts: surface signed + expiry dates (filtered in JS, like invoices).
    d
      .select({
        id: contract.contractId,
        title: contract.title,
        signedAt: contract.signedAt,
        expiresAt: contract.expiresAt,
        projectId: contract.projectId,
      })
      .from(contract),
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

  // BIR filing deadlines — generated per year in range (no DB rows).
  const pushBir = (y: number, month: number, day: number, key: string, label: string) => {
    const dt = new Date(Date.UTC(y, month, day));
    if (dt >= start && dt <= end) {
      events.push({
        id: `bir-${key}-${y}`,
        source: "bir",
        category: "bir_deadline",
        title: `BIR: ${label}`,
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
    for (const r of BIR_RULES) pushBir(y, r.month, r.day, r.key, r.label);
    // 1601-C — monthly withholding on compensation, due the 10th.
    for (let m = 0; m < 12; m++) {
      pushBir(y, m, 10, `1601c-${m}`, "1601-C — Monthly withholding (compensation)");
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return c.json({ data: events, error: null });
});

const createSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.enum(MANUAL_CATEGORIES).default("event"),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  isAllDay: z.boolean().default(false),
  projectId: z.number().int().nullable().optional(),
});

calendar.post("/", requireTeam, zValidator("json", createSchema), async (c) => {
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

const updateSchema = createSchema.partial();

calendar.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");
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
  const [deleted] = await db()
    .delete(calendarEvent)
    .where(eq(calendarEvent.calendarEventId, id))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Event not found" });
  return c.json({ data: { message: "Event deleted" }, error: null });
});

export default calendar;
