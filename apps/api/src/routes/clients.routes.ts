import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { client, user } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { hashPassword } from "../services/auth.service.js";
import { sendWelcomeEmail } from "../services/email.service.js";
import { nanoid } from "nanoid";
import type { Variables } from "../types/context.js";

const clients = new Hono<{ Variables: Variables }>();

clients.use("*", requireAuth);

// ─── List ─────────────────────────────────────────────

clients.get("/", requireAdmin, async (c) => {
  const rows = await db()
    .select()
    .from(client)
    .orderBy(client.companyName);

  return c.json({ data: rows, error: null });
});

// ─── Get One ──────────────────────────────────────────

clients.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const authUser = c.get("user");

  const [row] = await db()
    .select()
    .from(client)
    .where(eq(client.clientId, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Client not found" });

  // Clients can only view themselves
  if (authUser.role === "client" && row.userId !== authUser.userId) {
    throw new HTTPException(403, { message: "Access denied" });
  }

  return c.json({ data: row, error: null });
});

// ─── Create ───────────────────────────────────────────

const createSchema = z.object({
  companyName: z.string().min(1).max(255),
  contactEmail: z.string().email().max(255),
  githubOrgName: z.string().max(100).optional(),
  brandColorHex: z.string().max(7).optional(),
});

clients.post("/", requireAdmin, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db().insert(client).values(data).returning();
  return c.json({ data: created, error: null }, 201);
});

// ─── Update ───────────────────────────────────────────

clients.patch("/:id", requireAdmin, zValidator("json", createSchema.partial()), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");

  const [updated] = await db()
    .update(client)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(client.clientId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Client not found" });
  return c.json({ data: updated, error: null });
});

// ─── Delete ───────────────────────────────────────────

clients.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(client)
    .where(eq(client.clientId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Client not found" });
  return c.json({ data: { message: "Client deleted" }, error: null });
});

// ─── Invite (create auth account + send welcome) ─────

clients.post("/:id/invite", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const d = db();

  const [existing] = await d
    .select()
    .from(client)
    .where(eq(client.clientId, id))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Client not found" });
  if (existing.userId) {
    throw new HTTPException(409, { message: "Client already has an account" });
  }

  // If a user with this email already exists (e.g. left over from a previous
  // invite or seeded), link to it instead of failing on the unique constraint.
  const [existingUser] = await d
    .select()
    .from(user)
    .where(eq(user.email, existing.contactEmail))
    .limit(1);

  let newUser: typeof user.$inferSelect;
  let tempPassword = "";

  if (existingUser) {
    newUser = existingUser;
  } else {
    tempPassword = nanoid(16);
    const passwordHash = await hashPassword(tempPassword);
    [newUser] = await d
      .insert(user)
      .values({
        email: existing.contactEmail,
        passwordHash,
        role: "client",
      })
      .returning();
  }

  await d
    .update(client)
    .set({ userId: newUser.userId, updatedAt: new Date() })
    .where(eq(client.clientId, id));

  // Fire-and-forget — account creation already succeeded, don't fail the
  // request if SMTP is misconfigured (e.g. no RESEND_API_KEY locally).
  sendWelcomeEmail(existing.contactEmail, tempPassword).catch((err) => {
    console.error("[invite] welcome email failed:", err);
  });

  return c.json({
    data: { message: "Invitation sent", userId: newUser.userId },
    error: null,
  });
});

export default clients;
