import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimiter } from "hono-rate-limiter";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";

import { loadEnv, env } from "./utils/env.js";
import { logger, createLogger } from "./utils/logger.js";
import { recordError } from "./utils/error-capture.js";
import { initDb, closeDb } from "./db/connection.js";
import { requestId } from "./middleware/requestId.js";
import { cleanExpiredSessions } from "./services/auth.service.js";
import { startPlaudPoll, stopPlaudPoll } from "./services/plaud-poll.service.js";

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
import contractRoutes from "./routes/contracts.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import meetingRoutes from "./routes/meeting.routes.js";
import previewRoutes from "./routes/preview.routes.js";
import calendarRoutes from "./routes/calendar.routes.js";
import changeOrderRoutes from "./routes/change-order.routes.js";
import commissionRoutes from "./routes/commission.routes.js";
import projectSignoffRoutes from "./routes/project-signoff.routes.js";
import recurringFeeRoutes from "./routes/recurring-fee.routes.js";
import proposalRoutes from "./routes/proposal.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import libraryRoutes from "./routes/library.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import messageRoutes from "./routes/message.routes.js";
import insightRoutes from "./routes/insight.routes.js";

import type { Variables } from "./types/context.js";

// ─── Bootstrap ────────────────────────────────────────

const log = createLogger("server");
const e = loadEnv();
initDb();

const app = new Hono<{ Variables: Variables }>();

// ─── Global Middleware ────────────────────────────────

app.use("*", requestId);

const isDev = e.NODE_ENV !== "production";

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return e.FRONTEND_URL;
      if (
        isDev &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return origin;
      }
      const allow = [
        e.FRONTEND_URL,
        "https://advo.ph",
        "https://www.advo.ph",
        "http://localhost:6400",
        "http://localhost:6441",
        "http://127.0.0.1:6441",
        "http://localhost:6447",
        "http://127.0.0.1:6447",
        "http://localhost:6100",
        "http://localhost:6101",
        "http://localhost:5173",
        "http://localhost:3000",
      ];
      return allow.includes(origin) ? origin : "";
    },
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
app.route("/api/campaign", campaignRoutes);
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

// Recurring infrastructure fee (Admin Finance). Generation is an ENDPOINT, not a cron:
// POST /api/recurring-fee/run. Nothing here starts a timer or auto-suspends hosting.
app.route("/api/recurring-fee", recurringFeeRoutes);

// Payment rail (migration 022) — the first way money can ARRIVE. The provider webhook
// under /api/payment/webhook/:provider is DELIBERATELY public: PayMongo and Xendit call
// it with no ADVO credential, so its authentication is the request SIGNATURE, verified
// before anything is judged. Everything else on this router requires a session.
app.route("/api/payment", paymentRoutes);

// Message channels (migration 023) — SMS / Viber / Messenger, in and out. The inbound
// webhooks under /api/message/webhook/:channel are public for the same reason the payment
// one is: the providers call with no ADVO credential, so authentication is the signature.
// Nothing here auto-replies; a message actuates nothing.
app.route("/api/message", messageRoutes);

// Time entry (migration 024) + the three derived ops reads. TEAM-ONLY. The time model is
// deliberately effort, not cost: no rate column, no billable flag, nothing that turns a
// record of work into a judgement about a person.
app.route("/api/insight", insightRoutes);

// Commission split — the 60/25/15 payout model (migration 018). TEAM-ONLY: no /hub path
// reaches this router. Finalizing is an explicit admin POST, never automatic.
app.route("/api/commission", commissionRoutes);

// Meeting MoM records (Admin Meetings + Hub)
app.route("/api/meeting", meetingRoutes);

// Change orders (Hub file + team list; CONTRACTS.md policy 3)
app.route("/api/change-order", changeOrderRoutes);

// Project sign-off (client-facing final delivery; NOT deliverable.verified_at)
app.route("/api/project-signoff", projectSignoffRoutes);

// Preview links (public redirect for "Show Client Now")
app.route("/api/preview", previewRoutes);

// Internal library (team-wide catalog)
app.route("/api/library", libraryRoutes);

// Scrapers
app.route("/api/scrape", scrapeRoutes);
app.route("/api/scrape", fbScrapeRoutes);

// ─── Global Error Handler ─────────────────────────────

app.onError((err, c) => {
  const reqId = c.get("requestId") || "unknown";

  if (err instanceof HTTPException) {
    return c.json(
      { data: null, error: err.message },
      err.status
    );
  }

  // Unexpected error — log full details, return sanitized message.
  // recordError keeps a redacted, stack-free copy for GET /api/health.
  log.error({ err, requestId: reqId }, "Unhandled error");
  recordError("http", err);

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
  startPlaudPoll();
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
  stopPlaudPoll();
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
