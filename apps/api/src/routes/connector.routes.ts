/**
 * Connector routes — Figma, Drive, Calendar. Read-through, team-only.
 *
 * Every endpoint here takes the remote resource as a QUERY PARAMETER (a Figma URL, a
 * Drive folder URL, a calendar id) rather than reading one off a stored column. That is
 * deliberate: storing "the Figma URL for this project" is a schema decision with a
 * migration behind it, and it should be made when someone actually wants it, not
 * inherited from whichever integration happened to need a place to put something.
 *
 * All three responses share the ConnectorResult shape — `{ isConfigured, item, detail }`
 * with `item` ALWAYS an array. An unconfigured connector is a 200 with an empty list and
 * a reason, never a 500. The UI renders the reason; a missing credential is a setup task,
 * not an error.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import {
  connectorStatus,
  listCalendarEvent,
  listDriveFile,
  listFigmaFrame,
} from "../services/connector.service.js";

const connectorRoutes = new Hono<{ Variables: Variables }>();

connectorRoutes.use("*", requireAuth, requireTeam);

/** Which connectors have credentials. The status strip in admin reads this. */
connectorRoutes.get("/status", (c) => {
  return c.json({ data: connectorStatus(), error: null });
});

connectorRoutes.get("/figma", async (c) => {
  const fileUrl = c.req.query("fileUrl");
  if (!fileUrl) throw new HTTPException(400, { message: "fileUrl is required" });
  return c.json({ data: await listFigmaFrame(fileUrl), error: null });
});

connectorRoutes.get("/drive", async (c) => {
  const folderUrl = c.req.query("folderUrl");
  if (!folderUrl) throw new HTTPException(400, { message: "folderUrl is required" });
  return c.json({ data: await listDriveFile(folderUrl), error: null });
});

/** Default window: 60 days back, 120 forward — a term's worth of school blackout. */
const DEFAULT_BACK_DAY = 60;
const DEFAULT_FORWARD_DAY = 120;

connectorRoutes.get("/calendar", async (c) => {
  const calendarId = c.req.query("calendarId");
  if (!calendarId) throw new HTTPException(400, { message: "calendarId is required" });

  const now = Date.now();
  const fromAt = c.req.query("fromAt")
    ? new Date(c.req.query("fromAt")!)
    : new Date(now - DEFAULT_BACK_DAY * 86_400_000);
  const toAt = c.req.query("toAt")
    ? new Date(c.req.query("toAt")!)
    : new Date(now + DEFAULT_FORWARD_DAY * 86_400_000);

  if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) {
    throw new HTTPException(400, { message: "fromAt / toAt must be ISO dates" });
  }
  if (fromAt >= toAt) {
    // Google returns an empty list for an inverted window, which would read as "this
    // person has nothing scheduled" — the most dangerous possible wrong answer here.
    throw new HTTPException(400, { message: "fromAt must be before toAt" });
  }

  return c.json({ data: await listCalendarEvent(calendarId, fromAt, toAt), error: null });
});

export default connectorRoutes;
