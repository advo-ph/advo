import { Hono } from "hono";
import { checkDb } from "../db/connection.js";

const health = new Hono();

health.get("/", async (c) => {
  const dbOk = await checkDb();

  return c.json({
    status: dbOk ? "ok" : "degraded",
    db: dbOk,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default health;
