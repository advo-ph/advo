/**
 * The client thread (migration 026): one flat conversation per project, both sides.
 *
 * Scoping is by SESSION ROLE. A client sees and writes only on projects that belong to
 * their client row; team and admin see every project. The author role on a row is the
 * JWT role — never the body — which is what lets a thread stand as a record of who said
 * what. A foreign project is a 403 here rather than the 404 projects.routes.ts uses,
 * because the Hub UI renders the two differently: "not yours" versus "gone".
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { client, project, projectMessage, teamMember, user } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyProjectClient } from "../services/notify.service.js";
import type { AuthUser, Variables } from "../types/context.js";

const projectMessageRoutes = new Hono<{ Variables: Variables }>();

projectMessageRoutes.use("*", requireAuth);

/** The notification body is a preview, not the message; 200 chars is a Hub card. */
const NOTIFICATION_PREVIEW_LENGTH = 200;

const createSchema = z.object({
  projectId: z.number().int(),
  body: z.string().min(1).max(4000),
});

const readSchema = z.object({
  projectId: z.number().int(),
});

/** 404 when the project does not exist; 403 when it exists but is not the client's. */
async function assertProjectVisible(u: AuthUser, projectId: number) {
  const [row] = await db()
    .select({ projectId: project.projectId, title: project.title, clientUserId: client.userId })
    .from(project)
    .leftJoin(client, eq(project.clientId, client.clientId))
    .where(eq(project.projectId, projectId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Project not found" });
  if (u.role === "client" && row.clientUserId !== u.userId) {
    throw new HTTPException(403, { message: "Not your project" });
  }
  return row;
}

function parseProjectId(raw: string | undefined) {
  const id = raw ? Number(raw) : NaN;
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "projectId is required" });
  return id;
}

// One shape for every read of a message, with the author resolved to something a
// human recognises: the team member's name, the client's company, or the login email.
const messageSelect = {
  projectMessageId: projectMessage.projectMessageId,
  projectId: projectMessage.projectId,
  authorUserId: projectMessage.authorUserId,
  authorRole: projectMessage.authorRole,
  authorEmail: user.email,
  teamMemberName: teamMember.name,
  clientCompanyName: client.companyName,
  body: projectMessage.body,
  isReadByTeam: projectMessage.isReadByTeam,
  isReadByClient: projectMessage.isReadByClient,
  createdAt: projectMessage.createdAt,
};

type MessageRow = {
  projectMessageId: number;
  projectId: number;
  authorUserId: number | null;
  authorRole: string;
  authorEmail: string | null;
  teamMemberName: string | null;
  clientCompanyName: string | null;
  body: string;
  isReadByTeam: boolean;
  isReadByClient: boolean;
  createdAt: Date;
};

function toProjectMessage(row: MessageRow) {
  const { authorEmail, teamMemberName, clientCompanyName, ...rest } = row;
  return {
    ...rest,
    authorName: teamMemberName ?? clientCompanyName ?? authorEmail ?? null,
  };
}

function selectMessage() {
  return db()
    .select(messageSelect)
    .from(projectMessage)
    .leftJoin(user, eq(projectMessage.authorUserId, user.userId))
    .leftJoin(teamMember, eq(teamMember.userId, user.userId))
    .leftJoin(client, eq(client.userId, user.userId));
}

// ─── Thread ───────────────────────────────────────────

projectMessageRoutes.get("/", async (c) => {
  const u = c.get("user");
  const projectId = parseProjectId(c.req.query("projectId"));
  await assertProjectVisible(u, projectId);

  const row = await selectMessage()
    .where(eq(projectMessage.projectId, projectId))
    .orderBy(asc(projectMessage.createdAt), asc(projectMessage.projectMessageId));

  return c.json({ data: row.map(toProjectMessage), error: null });
});

// ─── Unread counts (must precede nothing — GET / has no :id param) ──

projectMessageRoutes.get("/unread", async (c) => {
  const u = c.get("user");
  const d = db();

  const row =
    u.role === "client"
      ? await d
          .select({ projectId: projectMessage.projectId, unreadCount: count() })
          .from(projectMessage)
          .innerJoin(project, eq(projectMessage.projectId, project.projectId))
          .innerJoin(client, eq(project.clientId, client.clientId))
          .where(and(eq(client.userId, u.userId), eq(projectMessage.isReadByClient, false)))
          .groupBy(projectMessage.projectId)
      : await d
          .select({ projectId: projectMessage.projectId, unreadCount: count() })
          .from(projectMessage)
          .where(eq(projectMessage.isReadByTeam, false))
          .groupBy(projectMessage.projectId);

  return c.json({ data: row, error: null });
});

// ─── Post ─────────────────────────────────────────────

projectMessageRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const u = c.get("user");
  const data = c.req.valid("json");
  const proj = await assertProjectVisible(u, data.projectId);
  const isClient = u.role === "client";

  const [inserted] = await db()
    .insert(projectMessage)
    .values({
      projectId: data.projectId,
      authorUserId: u.userId,
      authorRole: u.role,
      body: data.body,
      // The author has, by definition, read their own message.
      isReadByClient: isClient,
      isReadByTeam: !isClient,
    })
    .returning({ projectMessageId: projectMessage.projectMessageId });

  if (!isClient) {
    await notifyProjectClient(data.projectId, {
      type: "custom",
      title: `New message on ${proj.title}`,
      body: data.body.slice(0, NOTIFICATION_PREVIEW_LENGTH),
    });
  }

  const [row] = await selectMessage()
    .where(eq(projectMessage.projectMessageId, inserted.projectMessageId))
    .limit(1);

  return c.json({ data: toProjectMessage(row), error: null }, 201);
});

// ─── Mark the caller's side read ──────────────────────

projectMessageRoutes.post("/read", zValidator("json", readSchema), async (c) => {
  const u = c.get("user");
  const { projectId } = c.req.valid("json");
  await assertProjectVisible(u, projectId);

  const flag = u.role === "client" ? projectMessage.isReadByClient : projectMessage.isReadByTeam;
  const updated = await db()
    .update(projectMessage)
    .set(u.role === "client" ? { isReadByClient: true } : { isReadByTeam: true })
    .where(and(eq(projectMessage.projectId, projectId), eq(flag, false)))
    .returning({ projectMessageId: projectMessage.projectMessageId });

  return c.json({ data: { projectId, updatedCount: updated.length }, error: null });
});

export default projectMessageRoutes;
