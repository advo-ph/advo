import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
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

export default contracts;
