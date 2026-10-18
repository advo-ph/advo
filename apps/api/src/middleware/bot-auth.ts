import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/connection.js";
import { botKey, teamMember, user } from "../db/schema.js";
import { hashBotToken } from "../utils/bot-key.js";
import type { McpVariables } from "../types/bot-context.js";

export const requireBotKey = createMiddleware<{ Variables: McpVariables }>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing bearer token" });
  }
  const keyHash = hashBotToken(header.slice(7));
  const d = db();

  const [row] = await d
    .select({
      botKeyId: botKey.botKeyId,
      teamMemberId: botKey.teamMemberId,
      teamMemberName: teamMember.name,
      linkedUserId: teamMember.userId,
      role: user.role,
      isOwner: user.isOwner,
    })
    .from(botKey)
    .innerJoin(teamMember, eq(botKey.teamMemberId, teamMember.teamMemberId))
    .leftJoin(user, eq(teamMember.userId, user.userId))
    .where(and(eq(botKey.keyHash, keyHash), isNull(botKey.revokedAt)))
    .limit(1);

  if (!row) throw new HTTPException(401, { message: "Invalid or revoked bot key" });

  c.set("botKey", {
    botKeyId: row.botKeyId,
    teamMemberId: row.teamMemberId,
    teamMemberName: row.teamMemberName,
    linkedUserId: row.linkedUserId,
    role: (row.role as "admin" | "team" | "client" | null) ?? null,
    isOwner: row.isOwner ?? false,
  });

  // Fire-and-forget: a dashboard "last used" timestamp is not worth blocking the MCP call on.
  d.update(botKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(botKey.botKeyId, row.botKeyId))
    .catch(() => {});

  await next();
});
