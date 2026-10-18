# ADVO MCP Server — Umbrella Plan (REWRITTEN 18-10-26)

**Feature:** advo-mcp
**Complexity:** COMPLEX (phase program — 2 phases, down from the stale 4-phase draft)
**Repo:** `/Users/princewagan/advo`, synced to `origin/main` tip `c14b292`
**Shared contract:** see `process/general-plans/active/integration_UMBRELLA_PLAN_18-10-26.md`
§"Shared contract" for the full cross-feature text this plan was written against. Treat
that contract as binding; this file restates only the parts load-bearing for advo-mcp.

This supersedes the previous 4-phase umbrella (keys+read / write / project-meetings-transcripts /
push-alerts). The previous Phase 3 (`project_meeting`/`meeting_transcript`) is **dropped** —
`meeting`, `meeting_attendee`, `meeting_recording` already exist and cover that ground (migrations
006, 036, 041, 054). The previous Phase 4 (push alerts) is **folded into Phase 2**, because the
user has since confirmed push alerts fire on every activity_log row, not just bot-initiated ones —
that requires the generic change-log middleware, which is naturally part of the same phase that
adds write tools and `activity.service.ts`.

---

## 1. Goal

Stand up a remote MCP server (Streamable HTTP transport, Web Standards variant) on ADVO's API
host so the user's "grokbot" (xAI Grok calling remote MCP servers via the Responses API `"mcp"`
tool type) gets live read access to ADVO data and can make bounded writes — no deletes, ever.
One bot key per team member, managed in **Settings → Members**. Every human or bot write that
lands in `activity_log` triggers a signed webhook push to every active member webhook.

## 2. Phase order, status, dependencies

| Phase | File | Status | Depends on |
|---|---|---|---|
| 1 | `advo-mcp_phase-1-keys-and-read-mcp_PLAN_18-10-26.md` | Done (18-10-26) — see its own "Execution report" section | None — foundation. Executes in the MAIN tree (Wave 1, per the shared contract). |
| 2 | `advo-mcp_phase-2-write-tools_PLAN_18-10-26.md` | Done (18-10-26) — see its own "Execution report" section, including the orchestrator-directed wave-sequencing deviation (executed in parallel with `feat/ios-app`/`feat/plaud-chat` still in progress, not after their merge) | Phase 1 (bot auth, MCP server scaffold, migration 055 landed). Executed in the MAIN tree. |

**Execution rule:** advance one phase at a time. Before Phase 2 EXECUTE, re-run RESEARCH against
the then-current repo state — Phase 1's EXECUTE may have deviated from this plan in ways that
change Phase 2's exact file/line anchors.

**Resume handoff:** the next action after this plan is approved is `ENTER EXECUTE MODE` against
`process/features/advo-mcp/active/advo-mcp_phase-1-keys-and-read-mcp_PLAN_18-10-26.md` only.

## 3. What changed from the stale draft (so EXECUTE doesn't silently regress)

- **Meetings:** no new tables. All meeting read/write tools operate on the existing `meeting` /
  `meeting_attendee` / `meeting_recording` tables via the existing `apps/api/src/routes/meeting.routes.ts`
  patterns (folded into Phase 1 reads + Phase 2 writes).
- **"Tasks":** there is no `task` table — migration 042 unified tasks into `deliverable`. Every
  "task" tool reads/writes `deliverable`.
- **MCP transport:** `@modelcontextprotocol/sdk` is listed in `apps/api/package-lock.json`
  (lockfile noise from a prior aborted attempt) but is **absent** from `apps/api/package.json`
  dependencies and from `node_modules` — confirmed by `npm ls` failing and `node -e
  "require.resolve(...)"` throwing `MODULE_NOT_FOUND`. It must be added as a real dependency.
  Current published version: `1.32.1`.
- **Transport shape upgraded.** The stale plan's biggest flagged risk — reaching into
  `@hono/node-server`'s raw `c.env.incoming`/`c.env.outgoing` — is no longer necessary. SDK
  `1.32.1` ships `WebStandardStreamableHTTPServerTransport`
  (`dist/esm/server/webStandardStreamableHttp.d.ts`), whose `handleRequest(req: Request, options?)`
  takes a Web Standard `Request` and **returns a `Response`** — exactly what a Hono handler
  returns. Confirmed via its own doc comment's Hono usage example:
  `app.all('/mcp', async (c) => { return transport.handleRequest(c.req.raw); });`. Use this
  class, not the Node-wrapper `StreamableHTTPServerTransport`. Both phase files use this API —
  do not reintroduce the raw-req/res approach.
- **Owner/money gating fact-check:** `AuthUser`/`Variables` (`apps/api/src/types/context.ts`) do
  **not** carry `isOwner` — every existing route re-queries `user.isOwner` per call (see
  `deliverables.routes.ts`'s local `getIsOwner`, `team.routes.ts`'s `requireOwnerCaller`,
  `commission.routes.ts`, `vps-monitor.routes.ts`, `settings.routes.ts` — four independent
  copies of the same one-line query, no shared helper). The bot-key auth middleware resolves
  `isOwner` once per request the same way and stores it on its own bot context type; no new
  shared helper is introduced (matches the existing repo convention of not centralizing this
  check, rather than inventing a new pattern — flagged here as a conscious choice, not an
  oversight).
- **No `can_write`/`can_delete` key-scoping column.** The stale plan's "Open Decision 1" invented
  a `can_delete` flag on `bot_key`. The user's decision is simpler and final: **every** bot key
  can read and write; **no** bot key can ever delete; there is exactly one key per member, not a
  menu of scoped keys. `bot_key` therefore has no permission columns at all — permission is
  derived per-call from the linked `team_member.userId → user.role/isOwner`, exactly mirroring
  how a human session's role is checked today (see Phase 2 §"Write-tool permission model").

## 4. Cross-phase technical decisions (locked, apply to both phases)

- **Bot auth is a separate path from JWT.** `requireAuth`/`requireRole` (`middleware/auth.ts` +
  `rbac.ts`) are untouched. MCP tool calls are authenticated by a new `requireBotKey` middleware
  (Phase 1) that hashes the bearer token (`sha256` hex) and looks it up in `bot_key.key_hash` —
  never JWT, never touches `rbac.ts` (the shared contract reserves `rbac.ts` edits for the
  Plaud-chat plan's `requireOwner`; MCP does not touch that file).
- **Migration numbers:** `055_bot_key.sql` (Phase 1), `056_change_webhooks.sql` (Phase 2) — both
  reserved in the shared contract. Highest migration on disk today is `054_meeting_audio_url.sql`.
  Re-run `ls apps/api/migrations/` immediately before each phase's EXECUTE; if a lower number has
  landed in the meantime from a concurrent worktree, STOP and reconcile with the integration
  umbrella rather than silently renumbering.
- **Migration file shape:** copy the `050`/`053`/`041` convention exactly — `BEGIN;` → DDL →
  `INSERT INTO schema_migration (filename, is_backfilled) VALUES ('<file>', false) ON CONFLICT
  (filename) DO NOTHING;` → `COMMIT;`. (`054` skipped this wrapper because it was a single
  idempotent `ALTER ... ADD COLUMN IF NOT EXISTS`; both new migrations create tables, so they use
  the full transactional form.)
- **Local verification path:** `npm run db:local` (via `scripts/db-local.mjs`) applies
  `schema.ts` (drizzle push) then every `apps/api/migrations/*.sql` not yet in `schema_migration`,
  in filename order, then runs `scripts/migration-drift.mjs` as the pass/fail verdict. Run this
  after adding each migration + its `schema.ts` block, against a disposable DB name
  (`npm run db:local -- --name advo_mcp_check`), never against the shared `advo_dev` the other
  two worktrees are using, to avoid cross-feature migration-order contamination before merge.
- **Validators:** every new zod schema accepting a URL or date/time uses `looseUrl()` /
  `requiredUrl()` / `flexibleDateTime()` from `apps/api/src/utils/validators.ts` — never bare
  `.url()`/`.datetime()` (repo memory: strict zod 400s admin Save buttons; the bot-key/webhook
  forms are new admin UI and must not repeat that bug).
- **Growable string sets stay `varchar` + a comment, not a Postgres enum** — matches
  `calendar_event.category`/`contract.contract_type`.
- **No secrets in tool output or API responses.** Tool handlers and the bot-key/webhook routes
  never `select` or return `key_hash` or `secret_encrypted`. Verified explicitly in each phase's
  verification steps.
- **`apps/api/src/index.ts` ownership (shared contract):** MCP adds exactly: the three new route
  imports + mounts (`/mcp`, `/api/bot-keys`, `/api/webhooks`), the webhook-delivery poller's
  `setInterval`/self-reschedule start call inside `serve()`'s callback (same style as
  `startPlaudPoll`/`startRetentionSweep`), and its matching `stop*` call inside `shutdown()`. MCP
  does not touch CORS (`capacitor://localhost` is iOS's line) or add any other mount.
- **`apps/api/src/db/schema.ts` ownership:** MCP appends `botKey`, `memberWebhook`,
  `webhookDelivery` in one new block at the end of the file (after the existing VPS-monitor
  block), consistent with each feature owning its own trailing block per the shared contract.
- **Docs:** `docs/SCHEMA.md` gets one `###` entry per new table (append after the existing
  `### schema_migration` section, before "## Migration log", matching its current heading order).
  `docs/FEATURES.md` gets one line under "Operational Docs" is NOT touched (that table is for
  doc files, not features) — instead add one short entry in whatever "Shipped" section
  `docs/FEATURES.md` uses for recent features (re-check its structure at Phase 1 EXECUTE time;
  do not guess a heading that may have moved).

## 5. What each phase proves (gate criteria)

- **Phase 1 green check:** `npm run db:local` applies `055_bot_key.sql` cleanly and
  `migration-drift.mjs` reports clean; a bot key can be created for a team member who has a
  login account (Settings → Members UI), is shown once, and authenticates a `curl`/MCP Inspector
  session against `POST http://localhost:6407/mcp` that lists and calls every read tool
  successfully; a revoked key gets `401`; a non-owner member's bot session does not see any
  money-shaped tool in `tools/list`; `npm run build`, `npm run lint`, and
  `./scripts/test-local.sh` all pass; no response anywhere contains `key_hash`.
- **Phase 2 green check:** `056_change_webhooks.sql` applies cleanly; every write tool rejects
  unknown/invalid fields via zod and never exposes a delete-shaped tool; every successful bot
  write produces exactly one `activity_log` row with `metadata.viaBot = true`; the generic
  change-log middleware produces exactly one `activity_log` row for a human-made mutation that
  previously produced zero, and produces **zero** extra rows for the routes that already
  self-log (verified by the explicit deny-list test in Phase 2 §"Verification"); a member's
  webhook URL receives a correctly HMAC-signed test POST via the Settings → Members "Test"
  button; a real write (bot or human) produces exactly one `webhook_delivery` row that reaches
  `delivered`; a failing endpoint retries with backoff and eventually reaches `abandoned` without
  crashing the poller.

## 6. Resume and execution handoff

- Umbrella: this file.
- **Status (18-10-26): both phases Done.** advo-mcp's own implementation is complete — bot keys,
  read-only MCP tools, write tools, generic change-log middleware, and push webhooks all landed
  on `main` and are independently verified (see each phase file's "Execution report").
- Each phase file is self-sufficient for EXECUTE (exact files, schemas, routes, tool list with
  input schemas, UI touchpoints, verification, rollback). EXECUTE did not need this umbrella for
  implementation detail, only for phase sequencing.
- **Not done from this umbrella:** this feature's own two phases being Done does NOT mean the
  advo-mcp program is ready to archive. Phase 2 executed before `feat/ios-app` and
  `feat/plaud-chat` had merged into `main` (an orchestrator-directed deviation from this file's
  original wave-sequencing — see Phase 2's "Execution report"). The cross-feature merge,
  integration verification, and archival step all still live in
  `process/general-plans/active/integration_UMBRELLA_PLAN_18-10-26.md` §4, and remain gated on
  those two other features landing and that checklist passing in full.
- Next action: once `feat/ios-app` and `feat/plaud-chat` have merged into `main`, run the
  integration umbrella's §4 merge+verification checklist; only after that passes, flip this
  umbrella and move this feature's plan files to `process/features/advo-mcp/completed/`.
