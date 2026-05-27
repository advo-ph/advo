import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { lead, client, user, project } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import { hashPassword } from "../services/auth.service.js";
import { sendWelcomeEmail } from "../services/email.service.js";
import { nanoid } from "nanoid";
import type { Variables } from "../types/context.js";

const leads = new Hono<{ Variables: Variables }>();

// ─── Submit Lead (public) ─────────────────────────────

const submitSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  company: z.string().max(255).nullish(),
  projectType: z.string().max(100).nullish(),
  budget: z.string().max(100).nullish(),
  description: z.string().max(5000).nullish(),
});

leads.post("/", zValidator("json", submitSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db().insert(lead).values(data).returning();
  return c.json({ data: created, error: null }, 201);
});

// ─── List (admin/team) ────────────────────────────────

leads.get("/", requireAuth, requireTeam, async (c) => {
  const rows = await db()
    .select()
    .from(lead)
    .orderBy(desc(lead.submittedAt));

  return c.json({ data: rows, error: null });
});

// ─── Update ───────────────────────────────────────────

const updateSchema = z.object({
  status: z
    .enum(["new", "contacted", "qualified", "proposal_sent", "closed_won", "closed_lost"])
    .optional(),
  notes: z.string().max(5000).nullish(),
  assignedTo: z.number().nullable().optional(),
});

leads.patch("/:id", requireAuth, requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");

  const [updated] = await db()
    .update(lead)
    .set(data)
    .where(eq(lead.leadId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Lead not found" });
  return c.json({ data: updated, error: null });
});

// ─── Delete ───────────────────────────────────────────

leads.delete("/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(lead)
    .where(eq(lead.leadId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Lead not found" });
  return c.json({ data: { message: "Lead deleted" }, error: null });
});

// ─── Bulk Update ─────────────────────────────────────

const bulkUpdateSchema = z.object({
  leadIds: z.array(z.number()).min(1),
  status: z
    .enum(["new", "contacted", "qualified", "proposal_sent", "closed_won", "closed_lost"])
    .optional(),
  assignedTo: z.number().nullable().optional(),
});

leads.patch("/bulk", requireAuth, requireTeam, zValidator("json", bulkUpdateSchema), async (c) => {
  const { leadIds, status, assignedTo } = c.req.valid("json");
  const d = db();
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (assignedTo !== undefined) updates.assignedTo = assignedTo;

  if (Object.keys(updates).length === 0) {
    throw new HTTPException(400, { message: "No fields to update" });
  }

  const { inArray } = await import("drizzle-orm");
  await d.update(lead).set(updates).where(inArray(lead.leadId, leadIds));

  return c.json({ data: { message: `Updated ${leadIds.length} leads` }, error: null });
});

// ─── Convert Lead to Client + Project ─────────────────

leads.post("/:id/convert", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const d = db();

  const [existing] = await d
    .select()
    .from(lead)
    .where(eq(lead.leadId, id))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Lead not found" });

  // Create user account
  const tempPassword = nanoid(16);
  const passwordHash = await hashPassword(tempPassword);

  const [newUser] = await d
    .insert(user)
    .values({ email: existing.email, passwordHash, role: "client" })
    .returning();

  // Create client record
  const [newClient] = await d
    .insert(client)
    .values({
      userId: newUser.userId,
      companyName: existing.company || existing.name,
      contactEmail: existing.email,
    })
    .returning();

  // Create project if description provided
  let newProject = null;
  if (existing.description) {
    [newProject] = await d
      .insert(project)
      .values({
        clientId: newClient.clientId,
        title: `${existing.company || existing.name} — ${existing.projectType || "Project"}`,
        description: existing.description,
      })
      .returning();
  }

  // Update lead status
  await d
    .update(lead)
    .set({ status: "closed_won" })
    .where(eq(lead.leadId, id));

  await sendWelcomeEmail(existing.email, tempPassword);

  return c.json({
    data: {
      message: "Lead converted",
      client: newClient,
      project: newProject,
      userId: newUser.userId,
    },
    error: null,
  });
});

export default leads;
