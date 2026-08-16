/**
 * Import a Plaud recording into meeting.
 * File id uses the consumer API (auth required).
 * Share URL uses the public /share/access path (no JWT).
 */
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { client, meeting, project, user } from "../db/schema.js";
import {
  PlaudApiError,
  fetchPlaudFile,
  fetchPlaudShare,
  hasPlaudAuth,
  parseFileId,
  parseShareKey,
  type PlaudPayload,
} from "./plaud.service.js";

export type ImportInput = {
  projectId: number;
  fileId?: string | null;
  shareUrl?: string | null;
  createdBy: number | null;
};

function shareKeyOf(payload: PlaudPayload): string | null {
  const raw = payload.shareKey;
  if (!raw) return null;
  return raw.length > 500 ? raw.slice(0, 500) : raw;
}

export async function importPlaudMeeting(input: ImportInput) {
  const fileId = input.fileId ? parseFileId(input.fileId) : null;
  const shareKey = input.shareUrl ? parseShareKey(input.shareUrl) : null;
  if (!fileId && !shareKey) {
    throw new HTTPException(400, {
      message: "Provide a Plaud file id or a share URL",
    });
  }

  const [proj] = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .where(eq(project.projectId, input.projectId))
    .limit(1);
  if (!proj) throw new HTTPException(400, { message: "Project not found" });

  let payload: PlaudPayload;
  try {
    // File-id fetch needs the consumer JWT. praud always sends a share URL
    // too — use that when this box has no Plaud auth (prod today).
    if (fileId && hasPlaudAuth()) {
      payload = await fetchPlaudFile(fileId);
    } else if (shareKey) {
      payload = await fetchPlaudShare(shareKey);
    } else {
      throw new HTTPException(503, {
        message: "Plaud auth is not configured (PLAUD_TOKEN or ~/.piper/plaud-auth.json)",
      });
    }
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    if (err instanceof PlaudApiError) {
      throw new HTTPException(502, { message: err.message });
    }
    throw new HTTPException(502, {
      message: err instanceof Error ? err.message : "Plaud fetch failed",
    });
  }

  if (!payload.transcript.trim()) {
    throw new HTTPException(422, {
      message: "Plaud file has no transcript yet",
    });
  }

  const value = {
    projectId: input.projectId,
    title: payload.title.slice(0, 255),
    recordedAt: payload.recordedAt,
    transcript: payload.transcript,
    summary: payload.summary,
    plaudFileId: payload.fileId ?? fileId,
    plaudShareKey: shareKeyOf(payload) ?? shareKey,
    updatedAt: new Date(),
  };

  if (value.plaudFileId) {
    const [existing] = await db()
      .select({ meetingId: meeting.meetingId })
      .from(meeting)
      .where(eq(meeting.plaudFileId, value.plaudFileId))
      .limit(1);
    if (existing) {
      const [updated] = await db()
        .update(meeting)
        .set(value)
        .where(eq(meeting.meetingId, existing.meetingId))
        .returning();
      return { meeting: updated, created: false };
    }
  }

  const [created] = await db()
    .insert(meeting)
    .values({ ...value, createdBy: input.createdBy })
    .returning();
  return { meeting: created, created: true };
}

export async function firstAdminUserId(): Promise<number | null> {
  const [admin] = await db()
    .select({ userId: user.userId })
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);
  return admin?.userId ?? null;
}

/**
 * Body projectId → ADVO_INBOX_PROJECT_ID → project titled Inbox
 * → create client "ADVO Inbox" + project Inbox.
 */
export async function resolveInboxProjectId(explicit?: number | null): Promise<number> {
  const d = db();
  if (explicit != null) {
    const [proj] = await d
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, explicit))
      .limit(1);
    if (!proj) throw new HTTPException(400, { message: "Project not found" });
    return proj.projectId;
  }

  const fromEnv = Number(process.env.ADVO_INBOX_PROJECT_ID ?? "");
  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    const [proj] = await d
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, fromEnv))
      .limit(1);
    if (proj) return proj.projectId;
  }

  const [named] = await d
    .select({ projectId: project.projectId })
    .from(project)
    .where(eq(project.title, "Inbox"))
    .limit(1);
  if (named) return named.projectId;

  const [existingClient] = await d
    .select({ clientId: client.clientId })
    .from(client)
    .where(eq(client.companyName, "ADVO Inbox"))
    .limit(1);
  const inboxClient =
    existingClient ??
    (
      await d
        .insert(client)
        .values({ companyName: "ADVO Inbox", contactEmail: "inbox@advo.ph" })
        .returning({ clientId: client.clientId })
    )[0];
  if (!inboxClient) throw new HTTPException(500, { message: "Failed to create Inbox client" });

  const [created] = await d
    .insert(project)
    .values({
      clientId: inboxClient.clientId,
      title: "Inbox",
      description: "Unassigned praud imports. Reassign to a client project before publishing.",
    })
    .returning({ projectId: project.projectId });
  if (!created) throw new HTTPException(500, { message: "Failed to create Inbox project" });
  return created.projectId;
}
