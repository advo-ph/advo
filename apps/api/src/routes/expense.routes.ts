import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { expense, teamMember } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const expenseRoutes = new Hono<{ Variables: Variables }>();

expenseRoutes.use("*", requireAuth);

/**
 * Expense ledger — Phase 8 rework.
 *
 * receipt_url and is_reimbursable are removed (migration 032).
 * expense_type:        'development_expenses' | 'general_expenses'
 * expense_paid_status: 'paid' | 'unpaid'
 *
 * The team member is linked so the commission panel can show "Name — Purpose" rows
 * for expenses and compute Development/General totals.
 */

const EXPENSE_TYPES = ["development_expenses", "general_expenses"] as const;
const PAID_STATUSES = ["paid", "unpaid"] as const;

const createSchema = z.object({
  projectId: z.number().int().positive().nullable().optional(),
  teamMemberId: z.number().int().positive().nullable().optional(),
  purpose: z.string().min(1).max(5000),
  amountCents: z.number().int().min(0),
  expenseType: z.enum(EXPENSE_TYPES).default("general_expenses"),
  expensePaidStatus: z.enum(PAID_STATUSES).default("unpaid"),
  /** authorizedBy is kept nullable for backward compat; not required in Phase 8 form. */
  authorizedBy: z.string().max(255).optional().default(""),
});

const updateSchema = z.object({
  purpose: z.string().min(1).max(5000).optional(),
  amountCents: z.number().int().min(0).optional(),
  expenseType: z.enum(EXPENSE_TYPES).optional(),
  expensePaidStatus: z.enum(PAID_STATUSES).optional(),
  teamMemberId: z.number().int().positive().nullable().optional(),
});

/** Serialize an expense row for the API response (no receipt_url, no isReimbursable). */
function serializeExpense(row: typeof expense.$inferSelect & { memberName?: string | null }) {
  return {
    expenseId: row.expenseId,
    projectId: row.projectId,
    teamMemberId: row.teamMemberId,
    memberName: row.memberName ?? null,
    purpose: row.purpose,
    amountCents: row.amountCents,
    expenseType: row.expenseType,
    expensePaidStatus: row.expensePaidStatus,
    category: row.category,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

expenseRoutes.get("/", requireTeam, async (c) => {
  const projectIdRaw = c.req.query("projectId");
  const projectId = projectIdRaw ? Number(projectIdRaw) : undefined;

  const rows = await db()
    .select({
      expense: expense,
      memberName: teamMember.name,
    })
    .from(expense)
    .leftJoin(teamMember, eq(expense.teamMemberId, teamMember.teamMemberId))
    .where(
      projectId !== undefined
        ? eq(expense.projectId, projectId)
        : undefined,
    )
    .orderBy(desc(expense.createdAt));

  return c.json({
    data: rows.map((r) => serializeExpense({ ...r.expense, memberName: r.memberName })),
    error: null,
  });
});

expenseRoutes.post("/", requireTeam, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");
  const [created] = await db()
    .insert(expense)
    .values({
      projectId: data.projectId ?? null,
      teamMemberId: data.teamMemberId ?? null,
      purpose: data.purpose,
      authorizedBy: data.authorizedBy ?? "",
      amountCents: data.amountCents,
      expenseType: data.expenseType,
      expensePaidStatus: data.expensePaidStatus,
      category: "other",
      createdBy: user.userId,
    })
    .returning();

  // Fetch member name for the response.
  let memberName: string | null = null;
  if (created.teamMemberId) {
    const [tm] = await db()
      .select({ name: teamMember.name })
      .from(teamMember)
      .where(eq(teamMember.teamMemberId, created.teamMemberId))
      .limit(1);
    memberName = tm?.name ?? null;
  }

  return c.json({ data: serializeExpense({ ...created, memberName }), error: null }, 201);
});

expenseRoutes.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");

  const [updated] = await db()
    .update(expense)
    .set({
      ...(data.purpose !== undefined && { purpose: data.purpose }),
      ...(data.amountCents !== undefined && { amountCents: data.amountCents }),
      ...(data.expenseType !== undefined && { expenseType: data.expenseType }),
      ...(data.expensePaidStatus !== undefined && { expensePaidStatus: data.expensePaidStatus }),
      ...(data.teamMemberId !== undefined && { teamMemberId: data.teamMemberId }),
      updatedAt: new Date(),
    })
    .where(eq(expense.expenseId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Expense not found" });

  let memberName: string | null = null;
  if (updated.teamMemberId) {
    const [tm] = await db()
      .select({ name: teamMember.name })
      .from(teamMember)
      .where(eq(teamMember.teamMemberId, updated.teamMemberId))
      .limit(1);
    memberName = tm?.name ?? null;
  }

  return c.json({ data: serializeExpense({ ...updated, memberName }), error: null });
});

expenseRoutes.delete("/:id", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(expense)
    .where(eq(expense.expenseId, id))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Expense not found" });
  return c.json({ data: { message: "Expense deleted" }, error: null });
});

export default expenseRoutes;
