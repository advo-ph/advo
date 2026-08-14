import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import {
  generateProposal,
  getProposal,
  listProposal,
  updateProposalStatus,
  type ProposalStatus,
} from "../services/proposal.service.js";
import type { Variables } from "../types/context.js";

const proposalRoutes = new Hono<{ Variables: Variables }>();

proposalRoutes.use("*", requireAuth, requireTeam);

const PROPOSAL_STATUS = ["sent", "opened", "replied", "signed"] as const;

const generateSchema = z.object({
  leadId: z.number().int().positive(),
  valueCents: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  status: z.enum(PROPOSAL_STATUS),
});

proposalRoutes.get("/", async (c) => {
  const row = await listProposal();
  return c.json({ data: row, error: null });
});

proposalRoutes.post("/", zValidator("json", generateSchema), async (c) => {
  const { leadId, valueCents } = c.req.valid("json");
  const created = await generateProposal(leadId, valueCents);
  return c.json({ data: created, error: null }, 201);
});

proposalRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });
  const row = await getProposal(id);
  if (!row) throw new HTTPException(404, { message: "Proposal not found" });
  return c.json({ data: row, error: null });
});

proposalRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });
  const { status } = c.req.valid("json");
  const updated = await updateProposalStatus(id, status as ProposalStatus);
  return c.json({ data: updated, error: null });
});

/** Printable template-fill (HTML). Browser print-to-PDF is the delivery path. */
proposalRoutes.get("/:id/pdf", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });
  const row = await getProposal(id);
  if (!row) throw new HTTPException(404, { message: "Proposal not found" });
  const filename = `proposal-${row.proposalId}.html`;
  c.header("Content-Type", "text/html; charset=utf-8");
  c.header("Content-Disposition", `inline; filename="${filename}"`);
  return c.body(row.bodyHtml);
});

export default proposalRoutes;
