import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import {
  COMMISSION_ROLE,
  addCommissionShare,
  createCommissionPlan,
  finalizeCommissionPlan,
  getCommissionPlan,
  listCommissionPlan,
  listMemberEarning,
  removeCommissionShare,
  seedFromProjectAccess,
  updateCommissionPlan,
  updateCommissionShare,
  voidCommissionPlan,
} from "../services/commission.service.js";

/**
 * /api/commission — the 60/25/15 split (migration 018).
 *
 * TEAM-ONLY, every route. Compensation is not client-facing: no /hub path reaches this
 * router, and nothing here is joined into a client-visible response. A client seeing how
 * their fee is divided among the people who built it is a different product decision,
 * and it is not this one.
 *
 * All money on the wire is integer CENTS; all percentages are integer BASIS POINTS. The
 * zod schemas below are where that is actually enforced — z.number().int(), never a
 * coerced string, never a peso float.
 */
const commissionRoutes = new Hono<{ Variables: Variables }>();

commissionRoutes.use("*", requireAuth, requireTeam);

const bpsSchema = z.number().int().min(0).max(10000);

const createSchema = z.object({
  projectId: z.number().int().positive(),
  /** Integer CENTS. Omit to seed from project.total_value_cents. */
  basisCents: z.number().int().min(0).optional(),
  basisNote: z.string().max(2000).nullish(),
  note: z.string().max(2000).nullish(),
});

const updateSchema = z
  .object({
    basisCents: z.number().int().min(0).optional(),
    basisNote: z.string().max(2000).nullish(),
    developerBps: bpsSchema.optional(),
    staffBps: bpsSchema.optional(),
    companyBps: bpsSchema.optional(),
    referralBps: bpsSchema.optional(),
    marketingBps: bpsSchema.optional(),
    accountingBps: bpsSchema.optional(),
    managementBps: bpsSchema.optional(),
    note: z.string().max(2000).nullish(),
  })
  // Mirrors the CHECK constraints in 018 so the caller gets a 400 with a readable reason
  // instead of a raw Postgres constraint violation. The DB remains the real enforcer.
  .refine(
    (v) =>
      [v.developerBps, v.staffBps, v.companyBps].every((n) => n === undefined) ||
      (v.developerBps ?? 0) + (v.staffBps ?? 0) + (v.companyBps ?? 0) === 10000,
    { message: "developerBps + staffBps + companyBps must equal 10000 (100%)" },
  )
  .refine(
    (v) =>
      [v.referralBps, v.marketingBps, v.accountingBps, v.managementBps].every(
        (n) => n === undefined,
      ) ||
      (v.referralBps ?? 0) +
        (v.marketingBps ?? 0) +
        (v.accountingBps ?? 0) +
        (v.managementBps ?? 0) ===
        10000,
    { message: "The four staff role percentages must equal 10000 (100% of the staff pool)" },
  );

const shareSchema = z.object({
  teamMemberId: z.number().int().positive(),
  role: z.enum(COMMISSION_ROLE),
  /** Relative weight within the role's pool. 60/40 and 6000/4000 allocate identically. */
  contributionBps: z.number().int().min(0).optional(),
  note: z.string().max(2000).nullish(),
});

const shareUpdateSchema = z.object({
  contributionBps: z.number().int().min(0).optional(),
  isAgreed: z.boolean().optional(),
  note: z.string().max(2000).nullish(),
});

// ─── Read ────────────────────────────────────────────

commissionRoutes.get("/", async (c) => {
  const raw = c.req.query("projectId");
  const projectId = raw ? Number(raw) : undefined;
  return c.json({ data: await listCommissionPlan(projectId), error: null });
});

/** Everything one team member has been agreed to earn, across every project. */
commissionRoutes.get("/member/:teamMemberId", async (c) => {
  const id = Number(c.req.param("teamMemberId"));
  return c.json({ data: await listMemberEarning(id), error: null });
});

/**
 * The plan, its ledger, and the derived block — pool amounts, unallocated cents, and the
 * list of reasons finalize would currently refuse. While the plan is draft every share
 * amount here is DERIVED on this read; once finalized they are the frozen record.
 */
commissionRoutes.get("/:id", async (c) => {
  return c.json({ data: await getCommissionPlan(Number(c.req.param("id"))), error: null });
});

// ─── Write ───────────────────────────────────────────

commissionRoutes.post("/", requireAdmin, zValidator("json", createSchema), async (c) => {
  const data = await createCommissionPlan({
    ...c.req.valid("json"),
    userId: c.get("user").userId,
  });
  return c.json({ data, error: null }, 201);
});

commissionRoutes.patch("/:id", requireAdmin, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  return c.json({ data: await updateCommissionPlan(id, c.req.valid("json")), error: null });
});

/**
 * Proposes developer slots from the existing project_access rows. A SUGGESTION: it
 * assigns no contribution weight, because the weights are the part that must be mutually
 * agreed and a machine guessing them would put a number in front of people nobody chose.
 */
commissionRoutes.post("/:id/seed", requireAdmin, async (c) => {
  return c.json({ data: await seedFromProjectAccess(Number(c.req.param("id"))), error: null });
});

commissionRoutes.post("/:id/share", requireAdmin, zValidator("json", shareSchema), async (c) => {
  const id = Number(c.req.param("id"));
  return c.json({ data: await addCommissionShare(id, c.req.valid("json")), error: null }, 201);
});

/**
 * Team (not admin-only): a developer agreeing to their own contribution is the whole
 * point of "mutually agreed". Changing the WEIGHT resets is_agreed to false on that row,
 * so nobody stays signed off on a figure they never saw.
 */
commissionRoutes.patch("/share/:shareId", zValidator("json", shareUpdateSchema), async (c) => {
  const id = Number(c.req.param("shareId"));
  return c.json({ data: await updateCommissionShare(id, c.req.valid("json")), error: null });
});

commissionRoutes.delete("/share/:shareId", requireAdmin, async (c) => {
  const id = Number(c.req.param("shareId"));
  return c.json({ data: await removeCommissionShare(id), error: null });
});

/**
 * FREEZES the split. Atomic and single-shot: the guard is a conditional UPDATE inside the
 * transaction, so a double-click returns 409 rather than freezing two different sets of
 * numbers. Refuses with the full blocker list while the project is unshipped, a role pool
 * has nobody in it, or any share is still unagreed.
 */
commissionRoutes.post("/:id/finalize", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  return c.json({ data: await finalizeCommissionPlan(id, c.get("user").userId), error: null });
});

commissionRoutes.post(
  "/:id/void",
  requireAdmin,
  zValidator("json", z.object({ reason: z.string().min(1).max(2000) })),
  async (c) => {
    const id = Number(c.req.param("id"));
    const { reason } = c.req.valid("json");
    return c.json({ data: await voidCommissionPlan(id, reason, c.get("user").userId), error: null });
  },
);

export default commissionRoutes;
