import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import {
  BILLING_INTERVAL,
  createRecurringFee,
  deleteRecurringFee,
  getRecurringFee,
  listRecurringFee,
  listSuspensionRisk,
  previewRecurringFee,
  resumeFee,
  runRecurringFee,
  suspendFee,
  updateRecurringFee,
} from "../services/recurring-fee.service.js";

const recurringFeeRoutes = new Hono<{ Variables: Variables }>();

recurringFeeRoutes.use("*", requireAuth, requireTeam);

const onSchema = z.string().date();

const createSchema = z.object({
  projectId: z.number().int().positive(),
  label: z.string().min(1).max(255),
  /** Integer CENTS. FourlinQ = 300000. Never a float, never a string. */
  amountCents: z.number().int().min(0),
  billingInterval: z.enum(BILLING_INTERVAL).optional(),
  // 1..28 mirrors the CHECK in 017 — no month may silently skip a period.
  billingDayOfMonth: z.number().int().min(1).max(28).optional(),
  graceDayCount: z.number().int().min(0).max(365).optional(),
  startsOn: onSchema,
  endsOn: onSchema.nullish(),
  isSuspensionEnabled: z.boolean().optional(),
  isBackfill: z.boolean().optional(),
  note: z.string().max(2000).nullish(),
});

const updateSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  amountCents: z.number().int().min(0).optional(),
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  graceDayCount: z.number().int().min(0).max(365).optional(),
  endsOn: onSchema.nullish(),
  isSuspensionEnabled: z.boolean().optional(),
  note: z.string().max(2000).nullish(),
});

// ─── Read (team) ─────────────────────────────────────

recurringFeeRoutes.get("/", async (c) => {
  const raw = c.req.query("projectId");
  const projectId = raw ? Number(raw) : undefined;
  return c.json({ data: await listRecurringFee(projectId), error: null });
});

/**
 * The ops view. Only the fees where the contractual suspension remedy is available RIGHT
 * NOW. Reading this endpoint suspends nothing — it is the list a human decides from.
 */
recurringFeeRoutes.get("/suspension", async (c) => {
  return c.json({ data: await listSuspensionRisk(), error: null });
});

recurringFeeRoutes.get("/:id", async (c) => {
  return c.json({ data: await getRecurringFee(Number(c.req.param("id"))), error: null });
});

/** DRY-RUN. Resolves the periods that would be billed. Writes nothing. */
recurringFeeRoutes.post("/:id/preview", async (c) => {
  return c.json({ data: await previewRecurringFee(Number(c.req.param("id"))), error: null });
});

// ─── Write (admin) ───────────────────────────────────

recurringFeeRoutes.post("/", requireAdmin, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  return c.json({ data: await createRecurringFee(data), error: null }, 201);
});

recurringFeeRoutes.patch("/:id", requireAdmin, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  return c.json({ data: await updateRecurringFee(id, c.req.valid("json")), error: null });
});

recurringFeeRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  await deleteRecurringFee(id);
  // Already-generated invoices survive: the FK is ON DELETE SET NULL, so removing the
  // schedule cannot erase the billing history it produced.
  return c.json({ data: { message: "Recurring fee deleted; generated invoices kept" }, error: null });
});

/**
 * One generation + sweep tick. Not a cron — an endpoint a human (or a later scheduler)
 * calls. Idempotent: a double-click generates nothing twice, because the double-bill
 * guard is a DB unique index, not application care.
 */
recurringFeeRoutes.post("/run", requireAdmin, async (c) => {
  return c.json({ data: await runRecurringFee(), error: null });
});

/**
 * Records that a human invoked the contract suspension right. 409 when the predicate is
 * false, so the remedy cannot be triggered early by a mis-click. Writing this timestamp
 * takes nothing offline — that is an operational act performed by a person.
 */
recurringFeeRoutes.post("/:id/suspend", requireAdmin, async (c) => {
  return c.json({ data: await suspendFee(Number(c.req.param("id"))), error: null });
});

recurringFeeRoutes.post("/:id/resume", requireAdmin, async (c) => {
  return c.json({ data: await resumeFee(Number(c.req.param("id"))), error: null });
});

export default recurringFeeRoutes;
