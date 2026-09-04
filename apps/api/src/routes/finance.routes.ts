/**
 * Finance summary routes — cross-project aggregate endpoints.
 *
 * GET /api/finance/summary  (requireAdmin)
 *   Returns total value, collected, and outstanding across all projects.
 *   Used by the main Finance page stat cards.
 */

import { Hono } from "hono";
import { sum, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { invoiceFile, project } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const finance = new Hono<{ Variables: Variables }>();

finance.use("*", requireAuth);

// ─── GET /api/finance/summary ─────────────────────────────────────────────────
//
// Aggregate stats across all projects:
//   totalValueCents  — sum of project.total_value_cents
//   collectedCents   — sum of paid invoice_file.total_cents (non-null rows only)
//   outstandingCents — totalValueCents - collectedCents (floored at 0)
//
// Server-side visibility: this is a requireAdmin-only endpoint.  Commission
// amounts are NOT included here — Phase 8 redaction applies to commission
// endpoints only and does not affect invoice totals.

finance.get("/summary", requireAdmin, async (c) => {
  const d = db();

  // Sum of all project contract values
  const [projectTotals] = await d
    .select({ total: sum(project.totalValueCents) })
    .from(project);

  const totalValueCents = Number(projectTotals?.total ?? 0);

  // Sum of paid invoice_file.total_cents (SQL SUM ignores NULL totalCents rows)
  const [paidTotals] = await d
    .select({ collected: sum(invoiceFile.totalCents) })
    .from(invoiceFile)
    .where(eq(invoiceFile.paidStatus, "paid"));

  const collectedCents = Number(paidTotals?.collected ?? 0);
  const outstandingCents = Math.max(0, totalValueCents - collectedCents);

  return c.json({
    data: {
      totalValueCents,
      collectedCents,
      outstandingCents,
    },
    error: null,
  });
});

export default finance;
