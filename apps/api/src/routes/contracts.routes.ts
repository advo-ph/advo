import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { contract } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import { reviewContract } from "../services/contract-review.service.js";
import type { Variables } from "../types/context.js";

const contracts = new Hono<{ Variables: Variables }>();

contracts.use("*", requireAuth);

// ─── Red-flag review (heuristic) ─────────────────────
// Stateless: scans pasted contract/SOW text against ADVO's CONTRACTS.md
// policies. Team-only — clients don't review their own contracts.

const reviewSchema = z.object({
  contractText: z.string().min(20).max(100_000),
});

contracts.post("/review", requireTeam, zValidator("json", reviewSchema), async (c) => {
  const { contractText } = c.req.valid("json");
  const review = await reviewContract(contractText);
  return c.json({ data: review, error: null });
});

// ─── Contract / MOA records (CRUD) ───────────────────
// First-class contract records (migration 004). signed_at/expires_at derive
// into GET /api/calendar at read time. Team-only — contracts are internal.
// `contractType`/`status` validated app-side (varchar in the DB so the sets
// can grow without a migration).

const CONTRACT_TYPES = ["contract", "moa", "sow", "nda", "retainer"] as const;
const CONTRACT_STATUSES = ["draft", "sent", "signed", "active", "expired", "terminated"] as const;

const createSchema = z.object({
  clientId: z.number().int(),
  projectId: z.number().int().nullable().optional(),
  title: z.string().min(1).max(255),
  contractType: z.enum(CONTRACT_TYPES).default("contract"),
  status: z.enum(CONTRACT_STATUSES).default("draft"),
  valueCents: z.number().int().min(0).default(0),
  signedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  documentUrl: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

contracts.get("/", requireTeam, async (c) => {
  const rows = await db().select().from(contract).orderBy(desc(contract.createdAt));
  return c.json({ data: rows, error: null });
});

contracts.post("/", requireTeam, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db()
    .insert(contract)
    .values({
      clientId: data.clientId,
      projectId: data.projectId ?? null,
      title: data.title,
      contractType: data.contractType,
      status: data.status,
      valueCents: data.valueCents,
      signedAt: data.signedAt ? new Date(data.signedAt) : null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      documentUrl: data.documentUrl ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  return c.json({ data: created, error: null }, 201);
});

const updateSchema = createSchema.partial();

contracts.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.clientId !== undefined) values.clientId = data.clientId;
  if (data.projectId !== undefined) values.projectId = data.projectId ?? null;
  if (data.title !== undefined) values.title = data.title;
  if (data.contractType !== undefined) values.contractType = data.contractType;
  if (data.status !== undefined) values.status = data.status;
  if (data.valueCents !== undefined) values.valueCents = data.valueCents;
  if (data.signedAt !== undefined) values.signedAt = data.signedAt ? new Date(data.signedAt) : null;
  if (data.expiresAt !== undefined) values.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (data.documentUrl !== undefined) values.documentUrl = data.documentUrl ?? null;
  if (data.notes !== undefined) values.notes = data.notes ?? null;

  const [updated] = await db()
    .update(contract)
    .set(values)
    .where(eq(contract.contractId, id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Contract not found" });
  return c.json({ data: updated, error: null });
});

contracts.delete("/:id", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(contract)
    .where(eq(contract.contractId, id))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Contract not found" });
  return c.json({ data: { message: "Contract deleted" }, error: null });
});

export default contracts;
