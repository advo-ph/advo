# ADVO MCP — Phase 2: Write Tools + Change Log + Push Webhooks (REWRITTEN 18-10-26)

**Status:** Done — executed 18-10-26 against `main` (in parallel with the still-in-progress
`feat/ios-app` and `feat/plaud-chat` worktrees, per explicit orchestrator instruction — see
"Execution report" below for the resulting deviation from this plan's stated wave-sequencing
precondition). See "Execution report" at the end of this file for verification evidence and
deviations.
**Feature:** advo-mcp — Phase 2 of 2
**Umbrella:** `advo-mcp_UMBRELLA_PLAN_18-10-26.md`
**Wave:** 2 (main tree, after Wave 1's three parallel efforts — MCP phase 1, `feat/ios-app`,
`feat/plaud-chat` — have merged into `main`)
**Migration:** `056_change_webhooks.sql`

**Before EXECUTE:** re-run `ls apps/api/migrations/`, re-read Phase 1's actual landed files (its
EXECUTE may have adjusted file/line anchors), and re-read `apps/api/src/db/schema.ts`'s current
tail (chat's `parentMeetingId` addition and iOS's unrelated additions will have merged by now).

---

## 1. Scope

- `member_webhook` + `webhook_delivery` tables, migration 056.
- `apps/api/src/utils/crypto.ts` (MCP-owned) and `apps/api/src/services/activity.service.ts`
  (MCP-owned) — `logActivity()` helper.
- Generic change-log middleware: one `activity_log` row per successful human or bot mutation,
  deny-listed where routes already self-log or where logging is not meaningful.
- Write tools on `/mcp` (create/update, no deletes) for: projects, deliverables, meetings,
  calendar events, leads, change orders, team-member profile fields, and (owner-gated) invoices,
  contracts, expenses.
- Webhook delivery poller: HMAC-signed POST per `activity_log` row to every active
  `member_webhook`, with retry/backoff.
- Settings → Members UI: webhook URL/secret/test/status, alongside Phase 1's bot-key control.

## 2. Schema

### 2.1 Migration `apps/api/migrations/056_change_webhooks.sql`

```sql
-- Migration 056: member_webhook + webhook_delivery — push alerts on every activity_log row.
--
-- One webhook per team_member (mirrors bot_key's one-per-member shape). secret_encrypted must
-- be DECRYPTABLE (unlike bot_key.key_hash, one-way) because the poller signs each delivery
-- with it — see apps/api/src/utils/crypto.ts.
BEGIN;

CREATE TABLE IF NOT EXISTS member_webhook (
  member_webhook_id   bigserial PRIMARY KEY,
  team_member_id       integer NOT NULL REFERENCES team_member(team_member_id) ON DELETE CASCADE,
  url                  text NOT NULL,
  secret_encrypted     text NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_delivery_at     timestamptz,
  last_status          varchar(20),      -- 'ok' | 'failing' | null (never delivered)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_webhook_one_per_member
  ON member_webhook(team_member_id);

CREATE TABLE IF NOT EXISTS webhook_delivery (
  webhook_delivery_id bigserial PRIMARY KEY,
  member_webhook_id    integer NOT NULL REFERENCES member_webhook(member_webhook_id) ON DELETE CASCADE,
  activity_id           integer REFERENCES activity_log(activity_id) ON DELETE SET NULL,
  payload                jsonb NOT NULL,
  status                 varchar(20) NOT NULL DEFAULT 'queued', -- queued|delivered|failed|abandoned
  attempt_count          integer NOT NULL DEFAULT 0,
  next_attempt_at        timestamptz NOT NULL DEFAULT now(),
  last_error             text,
  delivered_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_poll
  ON webhook_delivery(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_webhook
  ON webhook_delivery(member_webhook_id);

COMMENT ON TABLE webhook_delivery IS
  'Queue + audit trail for push alerts. One row per (webhook, activity) pair; status/attempt_count/next_attempt_at drive services/webhook-delivery.service.ts.';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('056_change_webhooks.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

### 2.2 `apps/api/src/db/schema.ts` — append (after Phase 1's `botKey` block)

```ts
// ─── Member webhooks + delivery queue (migration 056) ────────────────

export const memberWebhook = pgTable(
  "member_webhook",
  {
    memberWebhookId: bigserial("member_webhook_id", { mode: "number" }).primaryKey(),
    teamMemberId: integer("team_member_id")
      .notNull()
      .references(() => teamMember.teamMemberId, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secretEncrypted: text("secret_encrypted").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastStatus: varchar("last_status", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_member_webhook_one_per_member").on(t.teamMemberId)]
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    webhookDeliveryId: bigserial("webhook_delivery_id", { mode: "number" }).primaryKey(),
    memberWebhookId: integer("member_webhook_id")
      .notNull()
      .references(() => memberWebhook.memberWebhookId, { onDelete: "cascade" }),
    activityId: integer("activity_id").references(() => activityLog.activityId, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_webhook_delivery_poll").on(t.status, t.nextAttemptAt),
    index("idx_webhook_delivery_webhook").on(t.memberWebhookId),
  ]
);
```

## 3. `apps/api/src/utils/crypto.ts` (new, MCP-owned)

AES-256-GCM, key derived via HKDF from `env().JWT_SECRET` when `SECRET_ENCRYPTION_KEY` is unset
(prod works with zero new env vars, per the shared contract), distinct salt/info so this
derived key can never collide with any other HKDF use in the repo.

```ts
import { randomBytes, createCipheriv, createDecipheriv, createHmac, hkdfSync } from "node:crypto";
import { env } from "./env.js";

const INFO = "advo-mcp-webhook-secret-v1";
const SALT = "advo-mcp";

function derivedKey(): Buffer {
  const material = env().SECRET_ENCRYPTION_KEY ?? env().JWT_SECRET;
  return Buffer.from(hkdfSync("sha256", material, SALT, INFO, 32));
}

/** iv(12) + authTag(16) + ciphertext, all base64, joined with '.' */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split(".");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}

/** HMAC-SHA256 hex signature of a webhook body, using the member's plaintext secret. */
export function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
```

`env().SECRET_ENCRYPTION_KEY` does not exist yet on `apps/api/src/utils/env.ts`'s schema — add
it as `z.string().min(32).optional()` (additive; fallback is the already-required `JWT_SECRET`).

## 4. `apps/api/src/services/activity.service.ts` (new, MCP-owned)

```ts
import { db } from "../db/connection.js";
import { activityLog } from "../db/schema.js";
import type { BotKeyContext } from "../types/bot-context.js";

type Source = "api" | "bot" | "plaud" | "chat";

export async function logActivity(input: {
  userId: number | null;
  action: string; // "<entity>_<verb>", verb in created|updated|deleted
  entityType: string;
  entityId: number | null;
  source: Source;
  metadata?: Record<string, unknown>;
  bot?: BotKeyContext;
}) {
  const [row] = await db()
    .insert(activityLog)
    .values({
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: {
        ...(input.metadata ?? {}),
        source: input.source,
        ...(input.bot
          ? { viaBot: true, teamMemberId: input.bot.teamMemberId, botKeyId: input.bot.botKeyId }
          : {}),
      },
    })
    .returning({ activityId: activityLog.activityId });
  return row.activityId;
}
```

Both the generic middleware (§5) and every MCP write-tool handler (§6) call this instead of
inserting into `activityLog` directly. Existing self-logging call sites (change-order,
commission, project-signoff, `projects.routes.ts`) are **not** rewritten to use this helper —
that refactor is out of scope here. They are deny-listed instead (§5.2) so they never double-log.

## 5. Generic change-log middleware

### 5.1 `apps/api/src/middleware/activity-log.middleware.ts` (new)

```ts
import { createMiddleware } from "hono/factory";
import { logActivity } from "../services/activity.service.js";
import { SELF_LOGGING_ROUTES, DENY_LISTED_PREFIXES } from "./activity-log.denylist.js";
import type { Variables } from "../types/context.js";

/** "project" from "/api/projects/42/preview-request". Crude plural strip — fine for logging. */
function entityTypeFromPath(path: string): string {
  const seg = path.split("/")[2] ?? "unknown";
  return seg.replace(/s$/, "");
}

const VERB_BY_METHOD: Record<string, string> = {
  POST: "created", PUT: "updated", PATCH: "updated", DELETE: "deleted",
};

export const activityLogMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  await next();
  const method = c.req.method;
  const verb = VERB_BY_METHOD[method];
  if (!verb) return; // GET/OPTIONS never log
  if (c.res.status < 200 || c.res.status >= 300) return;

  const path = new URL(c.req.url).pathname;
  if (DENY_LISTED_PREFIXES.some((p) => path.startsWith(p))) return;
  if (SELF_LOGGING_ROUTES.some((r) => r.method === method && r.pattern.test(path))) return;

  const user = c.get("user");
  const idMatch = path.match(/\/(\d+)(?:\/|$)/);
  try {
    await logActivity({
      userId: user?.userId ?? null,
      action: `${entityTypeFromPath(path)}_${verb}`,
      entityType: entityTypeFromPath(path),
      entityId: idMatch ? Number(idMatch[1]) : null,
      source: "api",
    });
  } catch {
    // A logging failure must never surface as a failure of the business mutation that already
    // succeeded and already responded. Swallow + rely on server logs, not the HTTP response.
  }
});
```

Mounted in `index.ts` as `app.use("/api/*", activityLogMiddleware)`, after the existing global
CORS/rate-limit middleware and before the route mounts.

### 5.2 `apps/api/src/middleware/activity-log.denylist.ts` (new)

```ts
export const DENY_LISTED_PREFIXES = [
  "/api/auth",
  "/api/event",            // analytics ingest — high-volume, not a human/bot "change"
  "/api/visitor-stats",
  "/api/bot-keys",
  "/api/webhooks",
  "/api/chat",              // plaud-chat's own direct-insert convention (source: 'chat')
  "/api/payment/webhook",   // external provider webhook, signature-authenticated
  "/api/message/webhook",
  "/api/github",            // GitHub webhook ingestion, same reasoning
  "/api/connector",         // read-through proxies — nothing in ADVO's own DB mutates
];

/** Routes that already insert their own activity_log row — skip to avoid a duplicate row and a
 *  duplicate webhook push. Re-verify against the named files at EXECUTE time: confirmed today
 *  at change-order.routes.ts:134, commission.service.ts:614,935,974,1009,
 *  project-signoff.service.ts:423,559,657,763,817, projects.routes.ts:772,949,1325 — line
 *  numbers will have shifted if any concurrent worktree touched these files. */
export const SELF_LOGGING_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/change-order$/ },                    // change_order_filed
  { method: "POST", pattern: /^\/api\/projects\/\d+\/preview-request$/ },  // preview_requested
  { method: "POST", pattern: /^\/api\/projects\/\d+\/preview-artifact$/ }, // preview_artifact_uploaded
  { method: "POST", pattern: /^\/api\/projects\/\d+\/suggest-timeline$/ }, // timeline_suggested
  { method: "POST", pattern: /^\/api\/commission$/ },                      // commission_plan_created
  { method: "POST", pattern: /^\/api\/commission\/\d+\/finalize$/ },       // commission_plan_finalized
  { method: "POST", pattern: /^\/api\/commission\/\d+\/void$/ },           // commission_plan_voided
  { method: "DELETE", pattern: /^\/api\/commission\/\d+$/ },               // commission_plan_deleted
  { method: "POST", pattern: /^\/api\/project-signoff$/ },                 // project_signoff_created
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/issue$/ },     // project_signoff_issued
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/sign$/ },      // project_signoff_signed
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/revision$/ },  // signoff_revision_recorded
  { method: "POST", pattern: /^\/api\/project-signoff\/\d+\/void$/ },      // project_signoff_voided
];
```

**Why a deny-list, not an opt-in flag:** a `c.set("activityLogged", true)` approach was
considered and rejected — the self-logging calls that matter most live inside service functions
with no Hono `Context`, so the flag would still have to be set back in the route handler after
awaiting the service call, which touches the same 4 files a deny-list avoids touching at all.

## 6. Write-tool permission model

`BotKeyContext` (Phase 1) carries `role` and `isOwner`, resolved once per request from the
linked `team_member.userId → user`. Every write-tool handler in
`apps/api/src/services/mcp-tools.service.ts` (Phase 1 file, extended with a
`registerWriteTools(server, botContext)` export) enforces:

- **Team-level tools:** allowed whenever `botContext.linkedUserId != null` (guaranteed — Phase 1
  requires a login to create a key), but every team/admin tool first rejects
  `botContext.role === "client"` (403) — a client mistakenly linked to a `team_member` row must
  never reach a write tool.
- **Admin-level tools** (edits `rbac.ts` gates with `requireAdmin` today): additionally require
  `botContext.role === "admin"`.
- **Money-gated tools** (invoices, contracts, expenses — mirrors Phase 1's read-side gating):
  additionally require `botContext.isOwner === true`, and are not registered at all otherwise.

No tool ever deletes. No tool wraps `team.routes.ts`'s `/accounts`/`/:id/account` (login
credentials) — those stay human-only regardless of role/owner.

### 6.1 Tool list

| Tool | Level | Mirrors | Notes |
|---|---|---|---|
| `create_deliverable` | team | `POST /api/deliverables` | Export+reuse `deliverables.routes.ts`'s `createSchema`; avoids drift. |
| `update_deliverable` | team | `PATCH /api/deliverables/:id` | Extract the route's `finished`-requires-admin-or-owner check into an exported `canMarkFinished({ role, isOwner })` reused by both. |
| `create_meeting` | team | `POST /api/meeting` | |
| `update_meeting` | team | `PATCH /api/meeting/:id` | Also covers transcript/summary edits — no separate "set transcript" tool needed. |
| `create_calendar_event` | team | `POST /api/calendar` | |
| `update_calendar_event` | team | `PATCH /api/calendar/:id` | |
| `create_change_order` | team | `POST /api/change-order` | Self-logging deny-list is HTTP-only; this tool still calls `logActivity` itself (`source: "bot"`). |
| `create_lead` | team | `POST /api/leads` | |
| `update_lead` | team | `PATCH /api/leads/:id` | |
| `update_project` | admin | `PATCH /api/projects/:id` | Money fields (`totalValueCents`, `listValueCents`, `discountCents`, `discountReason`) are silently dropped (not a 403) unless `botContext.isOwner`; say so in the tool description. |
| `update_team_member` | admin | `PATCH /api/team/:id` | Non-credential fields only (`bio`, job-title field — confirm exact name against the live `updateSchema`, `isActive`, `linkedinUrl`, `githubUrl`). Never touches `/account`. |
| `create_invoice` / `update_invoice` | owner | `POST`/`PATCH /api/invoices` | |
| `create_contract` / `update_contract` | owner | `POST`/`PATCH /api/contracts` | |
| `create_expense` / `update_expense` | owner | `POST`/`PATCH /api/expense` | |

Commission writes (plan creation/finalize/void) are explicitly **deferred** — the payout math is
too sensitive for a first pass at bot-driven writes.

### 6.2 Every write tool, after a successful DB write

```ts
await logActivity({
  userId: botContext.linkedUserId,
  action: `${entityType}_${verb}`,
  entityType,
  entityId: created.id,
  source: "bot",
  bot: botContext,
});
```

This is the only place `source: "bot"` is written — the generic middleware only runs on
JWT-authenticated `/api/*` calls (`/mcp` is a separate mount it never sees).

## 7. Webhook delivery poller

### 7.1 `apps/api/src/services/webhook-delivery.service.ts` (new)

- `queueDeliveriesForActivity(activityId)`: called from inside `logActivity()` itself (so it
  can't be forgotten) — for every active `member_webhook`, inserts one `webhook_delivery` row
  (`status: 'queued'`, `payload: { event, entityType, entityId, source, actorUserId, occurredAt,
  activityId }`).
- `startWebhookPoll()`/`stopWebhookPoll()`: same self-rescheduling `setTimeout` shape as
  `plaud-poll.service.ts`. Every 5s, pick up to 20 rows where
  `status IN ('queued','failed') AND next_attempt_at <= now()`; for each, decrypt the webhook's
  secret, sign the JSON body, POST with `X-ADVO-Signature: sha256=<hex>` + `X-ADVO-Event`, 5s
  timeout.
  - 2xx → `delivered`, reset `consecutive_failures = 0`, `last_status = 'ok'`.
  - failure → `attempt_count += 1`; `>= 6` → `abandoned`; else `failed` with
    `next_attempt_at = now() + backoff(attempt_count)` (`30s, 2m, 10m, 30m, 2h`, capped);
    `last_status = 'failing'` once `consecutive_failures >= 3`.
  - Per-row try/catch — one bad webhook must never stop the poller from processing the rest.

### 7.2 `apps/api/src/routes/webhooks.routes.ts` (new)

Owner-gated, mounted at `/api/webhooks`:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/` | List, never includes `secretEncrypted`. |
| `POST` | `/` | `{ teamMemberId, url }`. Generates+encrypts a random secret, returns `{ memberWebhookId, secret }` once (same one-shot-reveal pattern as the bot-key token). |
| `PATCH` | `/:id` | `{ url?, isActive? }`. |
| `POST` | `/:id/test` | One synthetic delivery (no `activityId`), sent synchronously (not queued) for an immediate pass/fail. |
| `POST` | `/:id/rotate-secret` | Regenerates + re-encrypts, returns once. |

No delete endpoint — "revoke" is `PATCH { isActive: false }`.

### 7.3 `apps/api/src/index.ts` — additive edits

```ts
import webhookRoutes from "./routes/webhooks.routes.js";
import { activityLogMiddleware } from "./middleware/activity-log.middleware.js";
import { startWebhookPoll, stopWebhookPoll } from "./services/webhook-delivery.service.js";

app.use("/api/*", activityLogMiddleware); // once, after existing global middleware, before mounts
app.route("/api/webhooks", webhookRoutes);
// mcp.routes.ts calls registerWriteTools internally — no further index.ts change needed.

// inside serve()'s callback, alongside the existing start* calls:
startWebhookPoll();
// inside shutdown():
stopWebhookPoll();
```

## 8. Settings → Members UI — webhook section

Same panel/file (`AdminSettings.tsx`), owner-only. Per member row, below Phase 1's bot-key
control: URL input + "Save", a status dot (ok/failing/never), and a "Test" button calling
`POST /api/webhooks/:id/test`. Secret shown once at creation via the same copy-dialog pattern as
the bot-key token.

## 9. Verification

- `npm run db:local -- --name advo_mcp_check2` applies 055 then 056 cleanly; drift check clean.
- Every `SELF_LOGGING_ROUTES` path, exercised as a human: exactly one `activity_log` row (no
  duplicate). At least 3 paths outside both lists (e.g. `PATCH /api/projects/:id`,
  `POST /api/calendar`, `PATCH /api/team/:id`): exactly one new `source: 'api'` row where
  previously there were zero.
- Every write tool via MCP Inspector/curl with a non-owner and an owner bot key: money-gated
  tools absent from a non-owner's `tools/list`, present for an owner's; `update_project` with a
  money field from a non-owner key silently drops that field (verify via `get_project`).
- Webhook: create, `POST /:id/test` against a local echo listener with a verified HMAC
  signature; a real bot write reaches `delivered` within one poll interval; an unreachable
  endpoint progresses `queued → failed → ... → abandoned` with growing gaps while a second,
  working webhook keeps receiving deliveries in the same cycle.
- `npm run build`, `npm run lint`, `./scripts/test-local.sh` green.
- `grep -rn "secretEncrypted\|secret_encrypted" apps/web/src` returns nothing.

## 10. Rollback

- `DROP TABLE IF EXISTS webhook_delivery; DROP TABLE IF EXISTS member_webhook;` + remove the
  `schema_migration` row.
- Remove the middleware/mount/lifecycle lines from `index.ts`; delete the new files in §3, §4,
  §5, §7.
- Remove the `registerWriteTools` call from `mcp.routes.ts`, reverting `/mcp` to Phase 1's
  read-only behavior without touching Phase 1's own files.
- To keep bot writes but disable generic logging: comment out just the
  `app.use("/api/*", activityLogMiddleware)` line — bot-initiated `logActivity` calls (§6.2) are
  independent of it.

## 11. Touchpoints / Public contracts / Blast radius

- **New files:** `apps/api/src/utils/crypto.ts`, `apps/api/src/services/activity.service.ts`,
  `apps/api/src/middleware/activity-log.middleware.ts`,
  `apps/api/src/middleware/activity-log.denylist.ts`,
  `apps/api/src/services/webhook-delivery.service.ts`, `apps/api/src/routes/webhooks.routes.ts`,
  `apps/api/migrations/056_change_webhooks.sql`.
- **Edited files:** `apps/api/src/db/schema.ts` (append), `apps/api/src/index.ts` (3 import +
  1 middleware + 1 mount + 2 lifecycle lines), `apps/api/src/utils/env.ts` (1 optional field),
  `apps/api/src/services/mcp-tools.service.ts` (Phase 1 file — add `registerWriteTools`),
  `apps/api/src/routes/mcp.routes.ts` (Phase 1 file — call the new export),
  `apps/api/src/routes/deliverables.routes.ts` (extract `canMarkFinished`, additive),
  `apps/web/src/components/admin/AdminSettings.tsx` (add webhook section), `docs/SCHEMA.md`
  (append).
- **New public contracts:** `GET/POST/PATCH /api/webhooks`, `POST /api/webhooks/:id/test`,
  `POST /api/webhooks/:id/rotate-secret`, plus every write tool name under `/mcp`.
- **Blast radius:** `activityLogMiddleware` runs on every successful `/api/*` mutation
  repo-wide. Its `logActivity` call is try/caught (§5.1) so a logging bug can never turn an
  already-successful business mutation into a failed response.

## 12. Resume and execution handoff

Next action after Phase 1 is verified and Wave 1 has merged: `ENTER EXECUTE MODE` against this
file. This is the last phase in the advo-mcp program — on completion, flip both phase statuses
and the umbrella to Done, then route to the integration umbrella's merge+verification checklist.

## 13. Execution report (18-10-26)

**Wave-sequencing deviation (orchestrator-directed, not silent):** this plan's §"Resume and
execution handoff" and the umbrella's §2 state Phase 2 should start only after Wave 1's three
parallel efforts (MCP Phase 1, `feat/ios-app`, `feat/plaud-chat`) have merged into `main`. At
EXECUTE time, `feat/ios-app` and `feat/plaud-chat` had **not yet merged** — no `057_plaud_chat.sql`,
no `meeting.parent_meeting_id`, no `capacitor://localhost` CORS entry existed on `main`. The
orchestrator explicitly directed EXECUTE to proceed anyway, in parallel with those two
still-in-progress worktrees, while confirming this plan's reserved migration number (`056`) and
file-ownership boundaries (no edits to `rbac.ts`, `ai-model.ts`, `Admin.tsx`, `App.tsx`,
`main.tsx`, `vite.config.ts`, `JobProgressWidget`, CORS allowlist, `plaud-*.service.ts`,
`meeting-route.service.ts` — none were touched). No conflict resulted: `056_change_webhooks.sql`
applied cleanly against the shared `advo_dev`, and the pre-existing `057_plaud_chat.sql` orphan
entry in the drift report (from the parallel `plaud-chat` worktree applying directly against
`advo_dev`) is unrelated and pre-existing, confirmed unchanged before/after this phase.

**Other deviations found and fixed during EXECUTE (not design changes):**
- `update_project`'s money-field-drop path could call `db().update(project).set({})` with an
  empty object when a non-owner sent ONLY money fields (all dropped), which Drizzle rejects
  with "No values to set". Fixed by returning the current (money-stripped) project row with a
  `_note` explaining nothing changed, instead of attempting an empty write.
- The plan's own `TEAM_MEMBER_UPDATE_FIELDS` constant example was unused once written (the
  actual allow-list is enforced by `teamMemberUpdateSchema`'s shape) — removed to avoid an
  unused-variable lint/type issue.
- Resolved the plan's open field-name question: `team.routes.ts`'s `createSchema`/`updateSchema`
  have no separate "job title" field — `role` (`z.string().min(1).max(100)`) **is** the job
  title shown in the roster UI, distinct from `user.role` (admin/team/client) and
  `team_member.permissionRole` (RBAC). `update_team_member`'s tool schema uses `role` for this.

**Touchpoints as actually landed** (all additive; matches §11 plus the export-only edits §11
already anticipated under "reuse the HTTP route's schema to avoid drift"):
- New: `apps/api/migrations/056_change_webhooks.sql`, `apps/api/src/utils/crypto.ts`,
  `apps/api/src/services/activity.service.ts`, `apps/api/src/services/webhook-delivery.service.ts`,
  `apps/api/src/middleware/activity-log.middleware.ts`,
  `apps/api/src/middleware/activity-log.denylist.ts`, `apps/api/src/routes/webhooks.routes.ts`,
  `apps/web/src/test/mcp-write-tools-webhooks.test.ts`.
- Edited (additive only): `apps/api/src/db/schema.ts` (append `memberWebhook`/`webhookDelivery`),
  `apps/api/src/utils/env.ts` (`SECRET_ENCRYPTION_KEY` optional field), `apps/api/src/index.ts`
  (3 imports, 1 middleware mount, 1 route mount, 1 poller start, 1 poller stop),
  `apps/api/src/services/mcp-tools.service.ts` (`registerWriteTools` + 20 write-tool handlers),
  `apps/api/src/routes/mcp.routes.ts` (calls `registerWriteTools`),
  `apps/api/src/routes/deliverables.routes.ts` (export `createSchema`/`updateSchema`,
  extract+export `canMarkFinished`, export `parseDueDate`),
  `apps/api/src/routes/meeting.routes.ts` (export `meetingBaseShape`/`createSchema`/`updateSchema`),
  `apps/api/src/routes/calendar.routes.ts` (export `eventShape`/`createSchema`/`updateSchema`),
  `apps/api/src/routes/change-order.routes.ts` (export `createSchema`),
  `apps/api/src/routes/leads.routes.ts` (export `submitSchema`/`updateSchema`),
  `apps/api/src/routes/projects.routes.ts` (export `createSchema`/`updateSchema`,
  `discountArithmeticError`, `normalizeDiscountFields`; route's own finished-gate now calls the
  exported `canMarkFinished`), `apps/api/src/routes/invoices.routes.ts` (export
  `createSchema`/`updateSchema`), `apps/api/src/routes/contracts.routes.ts` (export
  `createSchema`/`updateSchema`), `apps/api/src/routes/expense.routes.ts` (export
  `createSchema`/`updateSchema`), `apps/api/src/routes/team.routes.ts` (left-join `memberWebhook`
  into `GET /api/team/accounts`'s response), `apps/web/src/components/admin/AdminSettings.tsx`
  (webhook section below the bot-key row, per-member URL/Save/Test/status-dot/active-toggle,
  one-shot secret reveal dialog), `docs/SCHEMA.md` (two new `###` entries), `docs/FEATURES.md`
  (one bullet, extends the existing bot-key bullet), `docs/SETUP.md` (one optional env var).

**Verification evidence:**
- `npm run build` and `npm run lint` — clean (same pre-existing `fetchPriority` dev-build
  warning and 22 pre-existing `react-refresh/only-export-components` lint warnings only, 0
  errors), confirmed after every code change in this phase.
- `npm run db:local -- --name advo_dev --base postgresql://advo:changeme@localhost:5432` applied
  `056_change_webhooks.sql` cleanly. `migration-drift.mjs`'s ORPHAN list is unchanged from
  before this phase (pre-existing renumbered filenames plus `057_plaud_chat.sql` from the
  parallel `plaud-chat` worktree, confirmed by diffing the list before/after).
- New suite `apps/web/src/test/mcp-write-tools-webhooks.test.ts` (8 tests, all passing): no
  `delete_*` tool in `tools/list`; a bot write (`create_calendar_event`) produces exactly one
  `activity_log` row with `metadata.viaBot: true` + correct `teamMemberId`/`botKeyId`;
  `update_project` silently drops money fields for a non-owner key (verified via `get_project`
  and the admin HTTP read) and an owner key can set them; a human `PATCH /api/team/:id` (outside
  both lists) produces exactly one new `source: 'api'` row; `POST /api/change-order` (a
  self-logging route) is not double-logged; webhook create→test delivers an HMAC-signed POST
  whose signature verifies against the one-shot-revealed secret, and the admin list response
  never contains `secretEncrypted`/`secret_encrypted`.
- `./scripts/test-local.sh` against the live local API: **4 files failed, 7 tests failed, 879
  passed, 3 skipped** (889 total, 0 collection failures) — identical 7 pre-existing failures to
  Phase 1's baseline (`legal-compliance.test.ts`, `plaud-resilience.test.ts` ×2,
  `client-thread.test.ts` ×2, `e2e-flow.test.ts` ×2), none touching this phase's code. +8 newly
  passing tests, 0 new failures.
- Manual live smoke via `/mcp` with a real bot key: `create_meeting` + `update_meeting` (transcript
  covered by the same tool) each produced the expected row and exactly one `recent_activity`
  entry with `source: 'bot', viaBot: true`. A webhook pointed at an always-500 local listener:
  one real write queued a delivery, the poller picked it up within one 5s tick, `consecutive_failures`
  incremented to 1 on the member_webhook row (full `abandoned`-after-6-attempts cycle not run to
  completion in-session — backoff reaches ~2+ hours by attempt 5 — but the retry/backoff/
  increment code path is exercised and the poller's per-row try/catch kept running afterward,
  confirmed by the next webhook's own successful delivery in the same run).
- Settings → Members webhook UI: screenshots (desktop 1440×900 + mobile 390×844, logged in as
  `admin`/`changeme`, via Playwright against the real running app) in
  `~/Downloads/ADVO/ADVO/Screenshots/mcp-webhooks-2026-10-18/`: `01-*-empty` (no webhook yet),
  `02-*-secret-shown` (one-shot reveal + copy button + "This will not be shown again"),
  `03-*-test-result` ("Test delivery succeeded" toast), `04-*-delivery-status` (green status
  dot, `lastStatus: 'ok'`). Both viewports visually inspected and confirmed rendering correctly.
  Dev web ran on port 6447 (the repo's current `vite.config.ts` default), not the `6400`
  named in the original environment brief — `vite.config.ts` is out of this phase's ownership
  and was not touched; the live port was used as-is.
- `grep -rn "secretEncrypted\|secret_encrypted" apps/web/src` — no output.

**Left for later / not done here:**
- The integration umbrella's own §4 merge+verification checklist and archival step are **not**
  run from this phase — they are explicitly gated on `feat/ios-app` and `feat/plaud-chat` also
  merging into `main`, which had not happened as of this EXECUTE. Both phase statuses and the
  advo-mcp umbrella are updated to reflect this feature's own completion; the cross-feature
  closeout stays with the integration umbrella.
- A full `abandoned`-after-6-attempts backoff cycle was not run end-to-end in this session (see
  verification evidence above) — the mechanics are code-reviewed and the first retry step was
  observed directly.
- `apps/api/.env`, dev servers (API, web), and every local HTTP test listener used for
  verification (ports 8899/8900 and the webhook-signature test harness) were stopped after
  verification; all webhooks created against `advo_dev` for testing were deactivated
  (`isActive: false`), not deleted, matching the "revoke, never delete" audit-trail convention.
