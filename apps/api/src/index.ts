import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimiter } from "hono-rate-limiter";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";

import { loadEnv, env } from "./utils/env.js";
import { logger, createLogger } from "./utils/logger.js";
import { initDb, closeDb } from "./db/connection.js";
import { requestId } from "./middleware/requestId.js";
import { cleanExpiredSessions } from "./services/auth.service.js";

import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/projects.routes.js";
import clientRoutes from "./routes/clients.routes.js";
import teamRoutes from "./routes/team.routes.js";
import leadRoutes from "./routes/leads.routes.js";
import invoiceRoutes from "./routes/invoices.routes.js";
import deliverableRoutes from "./routes/deliverables.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import contentRoutes from "./routes/content.routes.js";
import githubRoutes from "./routes/github.routes.js";
import fileRoutes from "./routes/files.routes.js";
import settingRoutes from "./routes/settings.routes.js";
import healthRoutes from "./routes/health.routes.js";
import scrapeRoutes from "./routes/scrape.routes.js";
import fbScrapeRoutes from "./routes/fb-scrape.routes.js";
import availabilityRoutes from "./routes/availability.routes.js";
import brandRoutes from "./routes/brand-analysis.routes.js";
import contractRoutes from "./routes/contracts.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import meetingRoutes from "./routes/meeting.routes.js";
import previewRoutes from "./routes/preview.routes.js";
import calendarRoutes from "./routes/calendar.routes.js";
import changeOrderRoutes from "./routes/change-order.routes.js";
import proposalRoutes from "./routes/proposal.routes.js";
import libraryRoutes from "./routes/library.routes.js";

import type { Variables } from "./types/context.js";

// ─── Bootstrap ────────────────────────────────────────

const log = createLogger("server");
const e = loadEnv();
initDb();

const app = new Hono<{ Variables: Variables }>();

// ─── Global Middleware ────────────────────────────────

app.use("*", requestId);

app.use(
  "*",
  cors({
    origin: [
      e.FRONTEND_URL,
      "http://localhost:6400",
      "http://localhost:6441",
      "http://127.0.0.1:6441",
      "http://localhost:6100",
      "http://localhost:6101",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  })
);

// Serve uploaded files as static
app.use("/uploads/*", serveStatic({ root: e.UPLOAD_DIR.replace("./uploads", ".") }));

// ─── Rate Limiting ────────────────────────────────────
// 100x higher limits in development so the integration test suite can
// run without tripping the limiter.
const isDev = e.NODE_ENV !== "production";

const authLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: isDev ? 1000 : 10,
  keyGenerator: (c) => c.req.header("X-Forwarded-For") || "unknown",
});

const publicLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: isDev ? 3000 : 30,
  keyGenerator: (c) => c.req.header("X-Forwarded-For") || "unknown",
});

// ─── Routes ───────────────────────────────────────────

app.route("/api/health", healthRoutes);

// Auth (rate limited)
app.use("/api/auth/*", authLimiter);
app.route("/api/auth", authRoutes);

// Public endpoints (rate limited)
app.use("/api/leads", publicLimiter);

// Core
app.route("/api/projects", projectRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/team", teamRoutes);
app.route("/api/leads", leadRoutes);
app.route("/api/proposal", proposalRoutes);
app.route("/api/invoices", invoiceRoutes);
app.route("/api/deliverables", deliverableRoutes);
app.route("/api/availability", availabilityRoutes);
app.route("/api/calendar", calendarRoutes);
app.route("/api/notifications", notificationRoutes);

// Content
app.route("/api/content", contentRoutes);

// Integrations
app.route("/api/github", githubRoutes);

// Files
app.route("/api/files", fileRoutes);

// Settings
app.route("/api/settings", settingRoutes);

// Contracts (red-flag review)
app.route("/api/contracts", contractRoutes);

// Expense ledger (Admin Finance)
app.route("/api/expense", expenseRoutes);

// Meeting MoM records (Admin Meetings + Hub)
app.route("/api/meeting", meetingRoutes);

// Change orders (Hub file + team list; CONTRACTS.md policy 3)
app.route("/api/change-order", changeOrderRoutes);

// Preview links (public redirect for "Show Client Now")
app.route("/api/preview", previewRoutes);

// Internal library (team-wide catalog)
app.route("/api/library", libraryRoutes);

// Scrapers
app.route("/api/scrape", scrapeRoutes);
app.route("/api/scrape", fbScrapeRoutes);
app.route("/api/scrape", brandRoutes);

// ─── Global Error Handler ─────────────────────────────

app.onError((err, c) => {
  const reqId = c.get("requestId") || "unknown";

  if (err instanceof HTTPException) {
    return c.json(
      { data: null, error: err.message },
      err.status
    );
  }

  // Unexpected error — log full details, return sanitized message
  log.error({ err, requestId: reqId }, "Unhandled error");

  return c.json(
    { data: null, error: "Internal server error" },
    500
  );
});

app.notFound((c) => {
  return c.json({ data: null, error: "Not found" }, 404);
});

// ─── Start ────────────────────────────────────────────

const port = e.PORT;

serve({ fetch: app.fetch, port }, () => {
  log.info(`ADVO API running on port ${port} (${e.NODE_ENV})`);
});

// ─── Periodic Cleanup ─────────────────────────────────

setInterval(async () => {
  try {
    const cleaned = await cleanExpiredSessions();
    if (cleaned > 0) log.info({ cleaned }, "Expired sessions cleaned");
  } catch (err) {
    log.error({ err }, "Session cleanup failed");
  }
}, 60 * 60 * 1000); // Every hour

// ─── Graceful Shutdown ────────────────────────────────

async function shutdown(signal: string) {
  log.info(`${signal} received, shutting down...`);
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  log.fatal({ err }, "Uncaught exception — exiting");
  closeDb().finally(() => process.exit(1));
});

export default app;
