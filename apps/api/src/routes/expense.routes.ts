import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { expense } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const expenseRoutes = new Hono<{ Variables: Variables }>();

expenseRoutes.use("*", requireAuth);

// ─── Expense ledger (CRUD: list / create / delete) ───
// Team-only. is_reimbursable is derived from receipt_url (not stored).
// category is app-validated varchar so the set can grow without a migration.

const EXPENSE_CATEGORIES = [
  "ai_usage",
  "media",
  "subscription",
  "outside_payment",
  "travel",
  "meals",
  "software",
  "hardware",
  "marketing",
  "office",
  "other",
] as const;

const createSchema = z.object({
  projectId: z.number().int().nullable().optional(),
  purpose: z.string().min(1).max(5000),
  authorizedBy: z.string().min(1).max(255),
  amountCents: z.number().int().min(0),
  location: z.string().max(255).nullable().optional(),
  receiptUrl: z.string().max(500).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES).default("other"),
});

/** is_reimbursable = receipt present; never a free-floating stored flag. */
function withReimbursable<T extends { receiptUrl: string | null }>(row: T) {
  return {
    ...row,
    isReimbursable: row.receiptUrl != null && row.receiptUrl.length > 0,
  };
}

expenseRoutes.get("/", requireTeam, async (c) => {
  const rows = await db().select().from(expense).orderBy(desc(expense.createdAt));
  return c.json({ data: rows.map(withReimbursable), error: null });
});

expenseRoutes.post("/", requireTeam, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");
  const [created] = await db()
    .insert(expense)
    .values({
      projectId: data.projectId ?? null,
      purpose: data.purpose,
      authorizedBy: data.authorizedBy,
      amountCents: data.amountCents,
      location: data.location ?? null,
      receiptUrl: data.receiptUrl ?? null,
      category: data.category,
      createdBy: user.userId,
    })
    .returning();
  return c.json({ data: withReimbursable(created), error: null }, 201);
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
