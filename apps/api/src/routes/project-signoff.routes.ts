/**
 * /api/project-signoff — the client-facing final-delivery document.
 *
 * Team routes use requireAuth + requireTeam. Client-reachable routes use requireAuth
 * plus assertClientOwnsProject() (the join-through-client.user_id pattern from
 * change-order.routes.ts). Every response uses the { data, error } envelope.
 *
 * All policy — the revision gate, the frozen-after-signing rule, the single-signature
 * guard — lives in project-signoff.service.ts, not here. These handlers only decide
 * WHO may call, never WHETHER the rule holds.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import {
  SIGNOFF_METHOD,
  assertClientOwnsProject,
  createSignoff,
  getSignoff,
  issueSignoff,
  listSignoff,
  loadSignoff,
  issueDeemedNotice,
  recordClientResponse,
  recordDeemedApproval,
  recordReviewDelivery,
  recordRevision,
  signSignoff,
  updateSignoff,
  voidSignoff,
} from "../services/project-signoff.service.js";
import type { Variables } from "../types/context.js";

const projectSignoffRoutes = new Hono<{ Variables: Variables }>();

projectSignoffRoutes.use("*", requireAuth);

// Money is integer CENTS. z.number().int() so a ₱22,500 peso float can never land.
const createSchema = z.object({
  projectId: z.number().int(),
  title: z.string().min(1).max(255),
  scopeSummary: z.string().min(1).max(20000),
  finalPaymentCents: z.number().int().min(0),
  contractId: z.number().int().nullable().optional(),
  paymentDueDayCount: z.number().int().min(1).max(365).optional(),
  revisionWindowMonthCount: z.number().int().min(1).max(120).optional(),
  freeRevisionTotalCount: z.number().int().min(0).max(100).optional(),
  documentUrl: z.string().max(500).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  scopeSummary: z.string().min(1).max(20000).optional(),
  finalPaymentCents: z.number().int().min(0).optional(),
  contractId: z.number().int().nullable().optional(),
  paymentDueDayCount: z.number().int().min(1).max(365).optional(),
  revisionWindowMonthCount: z.number().int().min(1).max(120).optional(),
  freeRevisionTotalCount: z.number().int().min(0).max(100).optional(),
  documentUrl: z.string().max(500).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
});

const signSchema = z.object({
  signedName: z.string().min(1).max(255),
  /** Literal true — an unchecked confirmation is not a signature. */
  isAgree: z.literal(true),
  signedMethod: z.enum(SIGNOFF_METHOD).optional(),
});

const revisionSchema = z.object({
  note: z.string().min(1).max(4000),
});

const voidSchema = z.object({
  reason: z.string().min(1).max(2000),
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid sign-off id" });
  return id;
}

// ─── List ─────────────────────────────────────────────
// Team/admin: every row (optional ?projectId=). Client: own projects only, drafts
// excluded and the internal note / deliverable snapshot stripped.

projectSignoffRoutes.get("/", async (c) => {
  const user = c.get("user");
  const raw = c.req.query("projectId");
  const projectId = raw ? Number(raw) : null;
  if (raw && Number.isNaN(projectId)) {
    throw new HTTPException(400, { message: "Invalid projectId" });
  }

  const row = await listSignoff({ role: user.role, userId: user.userId, projectId });
  return c.json({ data: row, error: null });
});

// ─── Get one (+ the revision ledger) ──────────────────

projectSignoffRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const row = await getSignoff(parseId(c.req.param("id")), user.role, user.userId);
  return c.json({ data: row, error: null });
});

// ─── Draft (team) ─────────────────────────────────────

projectSignoffRoutes.post("/", requireTeam, zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const created = await createSignoff(c.req.valid("json"), user.userId);
  return c.json({ data: created, error: null }, 201);
});

// ─── Edit (team; frozen once signed) ──────────────────

projectSignoffRoutes.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const updated = await updateSignoff(parseId(c.req.param("id")), c.req.valid("json"));
  return c.json({ data: updated, error: null });
});

// ─── Issue to /hub (team) ─────────────────────────────

projectSignoffRoutes.post("/:id/issue", requireTeam, async (c) => {
  const user = c.get("user");
  const issued = await issueSignoff(parseId(c.req.param("id")), user.userId);
  return c.json({ data: issued, error: null });
});

// ─── Sign ─────────────────────────────────────────────
// The client who owns the project signs. An admin may record a 'deemed' (contract
// non-response clause) or 'offline' (countersigned PDF) signature on their behalf —
// signedBy stays NULL in that case, and the basis belongs in the note.

projectSignoffRoutes.post("/:id/sign", zValidator("json", signSchema), async (c) => {
  const id = parseId(c.req.param("id"));
  const user = c.get("user");
  const body = c.req.valid("json");
  const method = body.signedMethod ?? "client";

  const row = await loadSignoff(id, user.role, user.userId);

  if (user.role === "client") {
    await assertClientOwnsProject(user.userId, row.projectId);
    if (method !== "client") {
      throw new HTTPException(403, {
        message: "Only an admin can record a deemed or offline signature",
      });
    }
  } else if (user.role !== "admin") {
    throw new HTTPException(403, {
      message: "Only the owning client or an admin can sign this document",
    });
  }

  const signed = await signSignoff(id, {
    signedName: body.signedName,
    signedMethod: method,
    signedIp: c.req.header("X-Forwarded-For") ?? null,
    signedUserAgent: c.req.header("User-Agent") ?? null,
    userId: user.userId,
    isOnBehalf: method !== "client",
  });

  return c.json({ data: signed, error: null });
});

// ─── Consume a complementary revision round ───────────
// Client on own project, or team. The allowance/window gate is inside recordRevision().

projectSignoffRoutes.post("/:id/revision", zValidator("json", revisionSchema), async (c) => {
  const id = parseId(c.req.param("id"));
  const user = c.get("user");

  const row = await loadSignoff(id, user.role, user.userId);
  if (user.role === "client") {
    await assertClientOwnsProject(user.userId, row.projectId);
  }

  const result = await recordRevision(id, {
    note: c.req.valid("json").note,
    userId: user.userId,
  });
  return c.json({ data: result, error: null }, 201);
});

// ─── Void (admin, unsigned only) ──────────────────────

projectSignoffRoutes.post(
  "/:id/void",
  requireAdmin,
  zValidator("json", voidSchema),
  async (c) => {
    const user = c.get("user");
    const voided = await voidSignoff(
      parseId(c.req.param("id")),
      c.req.valid("json").reason,
      user.userId,
    );
    return c.json({ data: voided, error: null });
  },
);

// ─── Deemed approval (CONTRACTS.md Policy 3) ──────────
//
// Four routes, one per human act. All are requireTeam: the whole mechanism turns on ADVO
// having acted and being able to show it, so none of these may be driven by a client.
// The service holds the policy guards; these only parse and delegate.

const deliverySchema = z.object({
  // Date-only: the contract counts business DAYS from delivery, so an instant would imply
  // a precision the clause does not have.
  deliveredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "deliveredOn must be YYYY-MM-DD"),
});

const noticeSchema = z.object({
  // Mandatory by policy, not by convenience — see issueDeemedNotice.
  reference: z
    .string()
    .trim()
    .min(1, "A reference is required — the Notice must be producible in writing."),
});

projectSignoffRoutes.post(
  "/revision/:revisionId/delivery",
  requireTeam,
  zValidator("json", deliverySchema),
  async (c) => {
    const updated = await recordReviewDelivery(
      parseId(c.req.param("revisionId")),
      c.req.valid("json").deliveredOn,
    );
    return c.json({ data: updated, error: null });
  },
);

projectSignoffRoutes.post("/revision/:revisionId/response", requireTeam, async (c) => {
  const updated = await recordClientResponse(parseId(c.req.param("revisionId")));
  return c.json({ data: updated, error: null });
});

projectSignoffRoutes.post(
  "/revision/:revisionId/notice",
  requireTeam,
  zValidator("json", noticeSchema),
  async (c) => {
    const updated = await issueDeemedNotice(
      parseId(c.req.param("revisionId")),
      c.req.valid("json").reference,
    );
    return c.json({ data: updated, error: null });
  },
);

// Admin, not team: this one asserts a contractual position against a client, and is the
// act a dispute would turn on.
projectSignoffRoutes.post("/revision/:revisionId/deemed", requireAdmin, async (c) => {
  const user = c.get("user");
  const updated = await recordDeemedApproval(parseId(c.req.param("revisionId")), user.userId);
  return c.json({ data: updated, error: null });
});

export default projectSignoffRoutes;
