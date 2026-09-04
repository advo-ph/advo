import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { nanoid } from "nanoid";
import { db } from "../db/connection.js";
import { client, contract, contractFile } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import { reviewContract, extractContractText, reviewWithClaude } from "../services/contract-review.service.js";
import { env } from "../utils/env.js";
import type { Variables } from "../types/context.js";

const contracts = new Hono<{ Variables: Variables }>();

contracts.use("*", requireAuth);

// ─── Red-flag review (heuristic, legacy) ─────────────
// Stateless: scans pasted contract/SOW text. Team-only.

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

// Client-safe field set — no notes / value_cents (team-only on full CRUD).
const mineSelect = {
  contractId: contract.contractId,
  title: contract.title,
  status: contract.status,
  contractType: contract.contractType,
  signedAt: contract.signedAt,
  documentUrl: contract.documentUrl,
  projectId: contract.projectId,
};

// GET /mine — requireAuth (client or team). Clients scoped to their client_id
// via client.user_id ownership. Team/admin see all, same public field set.
// Registered before /:id so "mine" is not captured as an id param.
contracts.get("/mine", async (c) => {
  const user = c.get("user");
  const d = db();

  if (user.role === "client") {
    const row = await d
      .select(mineSelect)
      .from(contract)
      .innerJoin(client, eq(contract.clientId, client.clientId))
      .where(eq(client.userId, user.userId))
      .orderBy(desc(contract.createdAt));
    return c.json({ data: row, error: null });
  }

  // team + admin
  const row = await d
    .select(mineSelect)
    .from(contract)
    .orderBy(desc(contract.createdAt));
  return c.json({ data: row, error: null });
});

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

// ─── Contract file upload / list / review ─────────────
// IMPORTANT: these /files/* routes MUST come before the generic /:id routes
// below. Hono matches in registration order; /:id would capture "files" as
// the id parameter and route incorrectly if registered first.

const CONTRACT_FILE_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// GET /api/contracts/files?projectId=:id
contracts.get("/files", requireAdmin, async (c) => {
  const projectId = Number(c.req.query("projectId"));
  if (!projectId) throw new HTTPException(400, { message: "projectId is required" });

  const rows = await db()
    .select({
      contractFileId: contractFile.contractFileId,
      fileUrl: contractFile.fileUrl,
      fileName: contractFile.fileName,
      mimeType: contractFile.mimeType,
      status: contractFile.status,
      hasReview: contractFile.aiReviewText,
      aiReviewedAt: contractFile.aiReviewedAt,
      createdAt: contractFile.createdAt,
    })
    .from(contractFile)
    .where(eq(contractFile.projectId, projectId))
    .orderBy(desc(contractFile.createdAt));

  return c.json({
    data: rows.map((r) => ({ ...r, hasReview: r.hasReview !== null })),
    error: null,
  });
});

// POST /api/contracts/files/upload (multipart: projectId + file)
contracts.post("/files/upload", requireAdmin, async (c) => {
  const user = c.get("user");
  const formData = await c.req.formData();
  const projectId = Number(formData.get("projectId"));
  const file = formData.get("file") as File | null;

  if (!projectId) throw new HTTPException(400, { message: "projectId is required" });
  if (!file) throw new HTTPException(400, { message: "No file provided" });

  if (!CONTRACT_FILE_MIMES.has(file.type)) {
    throw new HTTPException(400, {
      message: "Only PDF and Word documents are accepted",
    });
  }

  const maxSize = 25 * 1024 * 1024; // 25 MB
  if (file.size > maxSize) {
    throw new HTTPException(400, { message: "File exceeds 25 MB limit" });
  }

  const bucket = "contracts";
  const uploadDir = join(env().UPLOAD_DIR, bucket);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  const ext = extname(file.name) || ".bin";
  const filename = `${Date.now()}-${nanoid(8)}${ext}`;
  const filepath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const fileUrl = `${env().API_URL}/uploads/${bucket}/${filename}`;

  const [created] = await db()
    .insert(contractFile)
    .values({
      projectId,
      fileUrl,
      fileName: file.name,
      mimeType: file.type,
      status: "draft",
      createdBy: user.userId,
    })
    .returning({
      contractFileId: contractFile.contractFileId,
      projectId: contractFile.projectId,
      fileUrl: contractFile.fileUrl,
      fileName: contractFile.fileName,
      mimeType: contractFile.mimeType,
      status: contractFile.status,
      aiReviewedAt: contractFile.aiReviewedAt,
      createdAt: contractFile.createdAt,
    });

  return c.json({ data: { ...created, hasReview: false }, error: null }, 201);
});

// PATCH /api/contracts/files/:id/status
// Must come before PATCH /files/:id so the more specific path wins.
const fileStatusSchema = z.object({
  status: z.enum(["draft", "final", "signed"]),
});

contracts.patch("/files/:id/status", requireAdmin, zValidator("json", fileStatusSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const { status } = c.req.valid("json");

  const [updated] = await db()
    .update(contractFile)
    .set({ status, updatedAt: new Date() })
    .where(eq(contractFile.contractFileId, id))
    .returning({
      contractFileId: contractFile.contractFileId,
      status: contractFile.status,
    });

  if (!updated) throw new HTTPException(404, { message: "Contract file not found" });
  return c.json({ data: updated, error: null });
});

// PATCH /api/contracts/files/:id (rename)
const fileRenameSchema = z.object({
  fileName: z.string().min(1).max(255),
});

contracts.patch("/files/:id", requireAdmin, zValidator("json", fileRenameSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const { fileName } = c.req.valid("json");

  const [updated] = await db()
    .update(contractFile)
    .set({ fileName, updatedAt: new Date() })
    .where(eq(contractFile.contractFileId, id))
    .returning({
      contractFileId: contractFile.contractFileId,
      fileName: contractFile.fileName,
    });

  if (!updated) throw new HTTPException(404, { message: "Contract file not found" });
  return c.json({ data: updated, error: null });
});

// GET /api/contracts/files/:id/review
// Returns cached review if already run; otherwise runs AI review and persists it.
contracts.get("/files/:id/review", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));

  const [row] = await db()
    .select()
    .from(contractFile)
    .where(eq(contractFile.contractFileId, id));

  if (!row) throw new HTTPException(404, { message: "Contract file not found" });

  // Return cached review immediately — no AI call needed
  if (row.aiReviewText) {
    return c.json({
      data: {
        contractFileId: row.contractFileId,
        aiReviewText: row.aiReviewText,
        aiReviewedAt: row.aiReviewedAt,
      },
      error: null,
    });
  }

  // Extract file path from URL and read text
  const urlPath = new URL(row.fileUrl).pathname; // /uploads/contracts/filename.pdf
  const filePath = join(env().UPLOAD_DIR, urlPath.replace(/^\/uploads\//, ""));

  let contractText: string;
  try {
    contractText = await extractContractText(filePath, row.mimeType);
  } catch (err) {
    throw new HTTPException(422, {
      message: `Could not read the file: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }

  const aiReviewText = await reviewWithClaude(contractText);
  const aiReviewedAt = new Date();

  await db()
    .update(contractFile)
    .set({ aiReviewText, aiReviewedAt, updatedAt: new Date() })
    .where(eq(contractFile.contractFileId, id));

  return c.json({
    data: { contractFileId: id, aiReviewText, aiReviewedAt },
    error: null,
  });
});

// DELETE /api/contracts/files/:id
// Removes the database row only. Physical file cleanup is a maintenance task.
contracts.delete("/files/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));

  const [deleted] = await db()
    .delete(contractFile)
    .where(eq(contractFile.contractFileId, id))
    .returning({ contractFileId: contractFile.contractFileId });

  if (!deleted) throw new HTTPException(404, { message: "Contract file not found" });
  return c.body(null, 204);
});

// ─── Generic contract record CRUD (/:id) ─────────────
// IMPORTANT: registered AFTER /files/* so "files" is never captured as an id.

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
