import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { db } from "../db/connection.js";
import { user } from "../db/schema.js";
import { getVpsMonitorStats, type VpsHistoryRange } from "../services/vps-monitor.service.js";
import type { Variables } from "../types/context.js";

const vpsMonitor = new Hono<{ Variables: Variables }>();

vpsMonitor.use("*", requireAuth);

vpsMonitor.get("/", requireAdmin, async (c) => {
  const caller = c.get("user");
  const [account] = caller
    ? await db().select({ isOwner: user.isOwner }).from(user).where(eq(user.userId, caller.userId)).limit(1)
    : [];
  if (!account?.isOwner) {
    throw new HTTPException(403, { message: "Owner access required" });
  }

  c.header("Cache-Control", "no-store");
  const requestedRange = c.req.query("range");
  const range: VpsHistoryRange = requestedRange === "1h" || requestedRange === "7d"
    ? requestedRange
    : "24h";
  const data = await getVpsMonitorStats(range);
  return c.json({ data, error: null });
});

export default vpsMonitor;
