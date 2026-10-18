import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { botKey, teamMember } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { requireOwnerCaller, requireSelfOrOwner } from "./team.routes.js";
import { generateBotToken, hashBotToken, botTokenPrefix } from "../utils/bot-key.js";
import type { Variables } from "../types/context.js";

const botKeyRoutes = new Hono<{ Variables: Variables }>();

// Owner-gated admin console for managing bot keys — uses the human JWT (Variables), not
// McpVariables. The MCP server itself (mcp.routes.ts) is the only thing that reads keyHash.

botKeyRoutes.get("/", requireAuth, requireAdmin, async (c) => {
  await requireOwnerCaller(c.get("user"));
  const rows = await db()
    .select({
      botKeyId: botKey.botKeyId,
      teamMemberId: botKey.teamMemberId,
      teamMemberName: teamMember.name,
      keyPrefix: botKey.keyPrefix,
      revokedAt: botKey.revokedAt,
      lastUsedAt: botKey.lastUsedAt,
      createdAt: botKey.createdAt,
    })
    .from(botKey)
    .innerJoin(teamMember, eq(botKey.teamMemberId, teamMember.teamMemberId))
    .orderBy(botKey.createdAt);
  c.header("Cache-Control", "no-store");
  return c.json({ data: rows, error: null });
});

const createSchema = z.object({
  teamMemberId: z.number().int(),
});

// Create and revoke: the owner for anyone, a member only for themselves (Settings → Developer).
botKeyRoutes.post("/", requireAuth, requireAdmin, zValidator("json", createSchema), async (c) => {
  const { teamMemberId } = c.req.valid("json");
  await requireSelfOrOwner(c.get("user"), teamMemberId);
  const d = db();

  const [member] = await d.select().from(teamMember).where(eq(teamMember.teamMemberId, teamMemberId)).limit(1);
  if (!member) throw new HTTPException(404, { message: "Team member not found" });
  if (member.userId == null) {
    throw new HTTPException(400, { message: "Give this member a login first — Member accounts above." });
  }

  const [live] = await d
    .select({ botKeyId: botKey.botKeyId })
    .from(botKey)
    .where(and(eq(botKey.teamMemberId, teamMemberId), isNull(botKey.revokedAt)))
    .limit(1);
  if (live) {
    throw new HTTPException(409, { message: "This member already has a live bot key — revoke it first." });
  }

  const token = generateBotToken();
  const caller = c.get("user");
  const [created] = await d
    .insert(botKey)
    .values({
      teamMemberId,
      keyHash: hashBotToken(token),
      keyPrefix: botTokenPrefix(token),
      createdBy: caller.userId,
    })
    .returning({ botKeyId: botKey.botKeyId });

  if (!created) throw new HTTPException(500, { message: "Could not create the bot key" });

  // The only response that ever contains the raw token.
  return c.json({ data: { botKeyId: created.botKeyId, token }, error: null });
});

botKeyRoutes.post("/:id/revoke", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid bot key id" });

  const d = db();
  const [key] = await d.select({ teamMemberId: botKey.teamMemberId }).from(botKey).where(eq(botKey.botKeyId, id)).limit(1);
  if (!key) throw new HTTPException(404, { message: "Bot key not found or already revoked" });
  await requireSelfOrOwner(c.get("user"), key.teamMemberId);

  const [updated] = await d
    .update(botKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(botKey.botKeyId, id), isNull(botKey.revokedAt)))
    .returning({ botKeyId: botKey.botKeyId });

  if (!updated) throw new HTTPException(404, { message: "Bot key not found or already revoked" });
  return c.json({ data: { botKeyId: updated.botKeyId }, error: null });
});

export default botKeyRoutes;
