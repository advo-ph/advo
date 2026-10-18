/**
 * Routes the generic activity-log middleware must skip (middleware/activity-log.middleware.ts).
 */

export const DENY_LISTED_PREFIXES = [
  "/api/auth",
  "/api/event", // analytics ingest — high-volume, not a human/bot "change"
  "/api/visitor-stats",
  "/api/bot-keys",
  "/api/webhooks",
  "/api/chat", // plaud-chat's own direct-insert convention (source: 'chat')
  "/api/payment/webhook", // external provider webhook, signature-authenticated
  "/api/message/webhook",
  "/api/github", // GitHub webhook ingestion, same reasoning
  "/api/connector", // read-through proxies — nothing in ADVO's own DB mutates
];

/** Routes that already insert their own activity_log row — skip to avoid a duplicate row
 *  and a duplicate webhook push. Verified against the repo on 2026-10-18 at
 *  change-order.routes.ts:134, commission.service.ts:614,935,974,1009,
 *  project-signoff.service.ts:423,559,657,763,817, projects.routes.ts:772,949,1325. */
export const SELF_LOGGING_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/change-order$/ }, // change_order_filed
  { method: "POST", pattern: /^\/api\/projects\/\d+\/preview-request$/ }, // preview_requested
  { method: "POST", pattern: /^\/api\/projects\/\d+\/preview-artifact$/ }, // preview_artifact_uploaded
  { method: "POST", pattern: /^\/api\/projects\/\d+\/suggest-timeline$/ }, // timeline_suggested
  { method: "POST", pattern: /^\/api\/commission$/ }, // commission_plan_created
  { method: "POST", pattern: /^\/api\/commission\/\d+\/finalize$/ }, // commission_plan_finalized
  { method: "POST", pattern: /^\/api\/commission\/\d+\/void$/ }, // commission_plan_voided
  { method: "DELETE", pattern: /^\/api\/commission\/\d+$/ }, // commission_plan_deleted
  { method: "POST", pattern: /^\/api\/project-signoff$/ }, // project_signoff_created
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/issue$/ }, // project_signoff_issued
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/sign$/ }, // project_signoff_signed
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/revision$/ }, // signoff_revision_recorded
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/void$/ }, // project_signoff_voided
];
