import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { invoice, project, client } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const invoices = new Hono<{ Variables: Variables }>();

invoices.use("*", requireAuth);

// ─── List ─────────────────────────────────────────────

invoices.get("/", async (c) => {
  const user = c.get("user");
  const d = db();

  if (user.role === "admin") {
    const rows = await d
      .select()
      .from(invoice)
      .leftJoin(project, eq(invoice.projectId, project.projectId))
      .orderBy(desc(invoice.createdAt));

    return c.json({
      data: rows.map((r) => ({ ...r.invoice, project: r.project })),
      error: null,
    });
  }

  // Clients see only their project invoices
  const rows = await d
    .select()
    .from(invoice)
    .leftJoin(project, eq(invoice.projectId, project.projectId))
    .leftJoin(client, eq(project.clientId, client.clientId))
    .where(eq(client.userId, user.userId))
    .orderBy(desc(invoice.createdAt));

  return c.json({
    data: rows.map((r) => ({ ...r.invoice, project: r.project })),
    error: null,
  });
});

// ─── Create ───────────────────────────────────────────

const createSchema = z.object({
  projectId: z.number(),
  amountCents: z.number().int().min(0),
  label: z.string().min(1).max(255),
  status: z.enum(["unpaid", "paid", "overdue"]).optional(),
  dueDate: z.union([z.string().datetime({ offset: true }), z.string().date()]).nullish(),
  notes: z.string().max(2000).nullish(),
});

invoices.post("/", requireAdmin, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db()
    .insert(invoice)
    .values({
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    })
    .returning();

  return c.json({ data: created, error: null }, 201);
});

// ─── Update ───────────────────────────────────────────

const updateSchema = z.object({
  status: z.enum(["unpaid", "paid", "overdue"]).optional(),
  notes: z.string().max(2000).nullish(),
  amountCents: z.number().int().min(0).optional(),
  label: z.string().min(1).max(255).optional(),
  dueDate: z.union([z.string().datetime({ offset: true }), z.string().date()]).nullish(),
});

invoices.patch("/:id", requireAdmin, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");

  const values: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.status === "paid") values.paidAt = new Date();
  if (data.dueDate !== undefined) {
    values.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }

  const [updated] = await db()
    .update(invoice)
    .set(values)
    .where(eq(invoice.invoiceId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Invoice not found" });
  return c.json({ data: updated, error: null });
});

// ─── Delete ───────────────────────────────────────────

invoices.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(invoice)
    .where(eq(invoice.invoiceId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Invoice not found" });
  return c.json({ data: { message: "Invoice deleted" }, error: null });
});

export default invoices;
