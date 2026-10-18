# Cross-Feature Integration Umbrella — MCP + Plaud Chat + iOS App (18-10-26)

**Repo:** `/Users/princewagan/advo`, synced to `origin/main` tip `c14b292`
**Scope:** coordinates three concurrently-planned features that share one API process, one
schema file, one `index.ts`, and one admin settings page. This file is the single place that
states the shared contract all three plans were written against, the execution waves, and the
merge/verification checklist. It does not re-derive each feature's internals — it points at
each feature's own plan files, which are each independently self-sufficient for EXECUTE.

**The three features:**

| Feature | Plans | Status |
|---|---|---|
| ADVO MCP server | `process/features/advo-mcp/active/advo-mcp_UMBRELLA_PLAN_18-10-26.md` + 2 phase files (`phase-1-keys-and-read-mcp`, `phase-2-write-tools`) | Both phases Done (18-10-26). Phase 2 executed before `feat/ios-app`/`feat/plaud-chat` merged (orchestrator-directed — see Phase 2's "Execution report"). Still blocked on this file's own §4 merge+verification checklist before archival. |
| Plaud chat widget | `process/features/plaud-chat/active/plaud-chat_PLAN_18-10-26.md` | Being written concurrently by another planner at the time this file was written — not yet readable. Reference by path once it lands. |
| iOS app (Capacitor) | `process/features/ios-app/active/ios-app_PLAN_18-10-26.md` | Being written concurrently by another planner at the time this file was written — not yet readable. Reference by path once it lands. |

This file was written from the shared contract text handed to all three planners (reproduced in
§1 below) plus direct verification of the current repo state for the MCP feature's portion. The
Plaud-chat and iOS sections of §1 are the contract's own text, not independently re-verified
here — each of those plans' own RESEARCH is responsible for confirming its own facts the same
way the MCP plans did (see `advo-mcp_UMBRELLA_PLAN_18-10-26.md` §3 "What changed from the stale
draft" for an example of that verification depth).

---

## 1. Shared contract (binding, reproduced verbatim from the planning brief)

### Environment

- Ports: web 6400, API 6407. Local API env: `apps/api/.env` → local Postgres `advo_dev` (user
  `advo`), at migration 053 as of planning time (054 not yet applied — **re-check at each
  EXECUTE**, this drifts constantly). Never touch prod.
- No `ANTHROPIC_API_KEY` locally; prod Anthropic key reportedly has no credit. Every AI path
  must degrade gracefully.
- Highest migration on disk at planning time: `054_meeting_audio_url.sql`. New migrations follow
  the repo's current convention (`BEGIN`/`COMMIT` + `INSERT INTO schema_migration (filename,
  is_backfilled) ... ON CONFLICT DO NOTHING` — copy the exact form from `050`–`054`; confirmed
  during MCP planning that `054` itself skips the wrapper because it is a single idempotent
  `ALTER ... ADD COLUMN IF NOT EXISTS` — new migrations that `CREATE TABLE` use the full
  transactional form, see `050`/`053`).
- **Reserved migration numbers:** `055_bot_key.sql` (MCP phase 1), `056_change_webhooks.sql`
  (MCP phase 2), `057_plaud_chat.sql` (Plaud chat: `chat_message` + `meeting.parent_meeting_id`).
  iOS: none.

### Execution waves

- **Wave 1 (parallel):** MCP Phase 1 in the **main tree**; iOS app in its own git worktree
  (branch `feat/ios-app`); Plaud chat in its own git worktree (branch `feat/plaud-chat`).
  Worktree agents run their own API on a different port (iOS `6417`, chat `6427`) against
  `advo_dev`, applying only their own migration.
- **Wave 2:** MCP Phase 2 in the **main tree** (after Phase 1 is verified AND after Wave 1's two
  worktree efforts have merged — Phase 2's generic change-log middleware and write tools are
  easier to land cleanly against the post-merge schema than to merge afterward against a
  moving target).
- **Then:** merge `feat/ios-app` and `feat/plaud-chat` into `main`, resolve additive conflicts,
  run full integration verification (build, lint, `test:local`, screenshots, a simulator build
  containing the chat widget) — see §4.

### File ownership / conflict rules

- `apps/api/src/index.ts`: MCP adds `/mcp`, `/api/bot-keys`, `/api/webhooks` mounts, the generic
  change-log middleware, and the webhook-delivery poller's start/stop calls. iOS adds **only**
  `"capacitor://localhost"` to the CORS allowlist. Chat adds **only** the `/api/chat` mount.
  Keep every edit minimal and additive — no feature reorders another's lines.
- `apps/api/src/db/schema.ts`: each feature appends its own tables in its own block at the
  **end** of the file; chat also adds `parentMeetingId` to the existing `meeting` table
  definition (an edit to an existing block, not an append — the one place two features touch
  the same table definition; sequence MCP's append before chat's edit, or re-diff carefully if
  chat lands first).
- `apps/api/src/middleware/rbac.ts`: chat plan adds `requireOwner` (checks `user.isOwner` from
  migration 033). **MCP does not touch `rbac.ts`.**
- `apps/api/src/utils/ai-model.ts`: chat plan creates it:
  `export const ADVO_AI_MODEL = "claude-opus-5-5";`.
- `apps/api/src/utils/crypto.ts` + `apps/api/src/services/activity.service.ts`: **MCP phase 2
  owns these two new files.** Crypto key = env `SECRET_ENCRYPTION_KEY` (optional) else
  HKDF-derived from `JWT_SECRET` (distinct salt/info) so prod works without a new env var.
- `apps/web/src/components/admin/AdminSettings.tsx`: **MCP owns this file** (extends the
  existing owner-only "Member accounts" section with bot keys + webhook per member — confirmed
  during MCP planning at lines 310-339 of the current file; does not build a separate Members
  page).
- `apps/web/src/pages/Admin.tsx` + `apps/web/src/App.tsx`'s `JobProgressWidget` positioning:
  chat plan owns the `ChatWidget` mount. iOS owns `NativeGate` mount in `App.tsx` and
  `main.tsx` boot code. Both are additive.
- Teammate (Mar Angelo) is actively changing the Plaud import pipeline
  (`plaud-poll.service.ts`, `meeting-route.service.ts`, `plaud-import.service.ts`,
  `plaud-open.service.ts`) at the time of this planning round. Touch those files minimally:
  export/return data needed and add one hook call — never restructure them.

### `activity_log` convention (feeds MCP webhooks + MCP `recent_activity` tool)

- `action = <entity>_<verb>`, verb ∈ `created|updated|deleted` (plus existing custom actions
  already in the repo — grandfathered, e.g. `preview_requested`, `timeline_suggested`,
  `commission_plan_finalized`).
- `metadata.source ∈ 'api' | 'bot' | 'plaud' | 'chat'`. Bot rows also carry `{viaBot: true,
  teamMemberId, botKeyId}`.
- MCP phase 2 adds a generic Hono middleware that writes one `activity_log` row after every
  successful (2xx) `POST`/`PUT`/`PATCH`/`DELETE` under `/api/*` (`source: 'api'`), deny-listing
  at minimum `/api/auth`, `/api/event` + `/api/visitor-stats` (this repo's actual analytics/
  visitor-tracking paths — there is no `/api/analytics`), `/api/chat`, `/api/bot-keys`,
  `/api/webhooks`, and any read-only POST endpoints — the exact, re-verified deny-list and the
  "already self-logs, don't duplicate" list live in
  `advo-mcp_phase-2-write-tools_PLAN_18-10-26.md` §5.2, derived from grepping every current
  `activityLog` insert site in the repo. Rows never include request bodies or secrets (method,
  path, entityType, entityId, actor userId only).
- Plaud poller imports and chat-driven changes (meeting attached/moved, project created) do
  **not** go through HTTP mutation routes, so the chat service writes their `activity_log` rows
  explicitly with a direct `db` insert following this same convention (`source: 'plaud'` for
  auto-import results, `source: 'chat'` for owner answers). This avoids a file conflict on
  `activity.service.ts` — chat writes directly, it does not import MCP's `logActivity` helper
  (that helper does not exist until MCP Phase 2 lands, and chat's Wave-1 worktree runs before
  that).
- MCP webhooks fire for **every** new `activity_log` row ("push alerts on every change" — user
  decision). If generic rows would pollute an existing UI that reads `activity_log` (none found
  during MCP planning — only `projects.routes.ts`'s own `preview_requested` reader exists today,
  which already filters by `action`), filter `metadata.source='api'` out of that reader.

### Meetings: ONE data model

The existing `meeting` table (+ `meeting_attendee`, `meeting_recording`, `audio_url`,
`plaud_file_id`) is the single source of truth. **No new meeting tables anywhere** — this ruled
out the stale MCP draft's `project_meeting`/`meeting_transcript` idea (now dropped, see
`advo-mcp_UMBRELLA_PLAN_18-10-26.md` §3) and the stale `plaud-meetings` plan's `plaud_recording`
idea (now superseded, see §3 below). MCP meeting tools read/write `meeting` via existing
routes/services. Side-project excerpt copies are child `meeting` rows with `parent_meeting_id`
set (chat plan, migration 057).

### UI rules shared by chat + iOS

- `ChatWidget` (owner-only, bottom-right, admin area) and the existing global
  `JobProgressWidget` (`App.tsx`, bottom-right) must not overlap — chat plan owns the stacking
  fix.
- Both floating widgets pad with `max(16px, env(safe-area-inset-bottom))` / right equivalent so
  they clear the iPhone home indicator in the native app (`index.html` already has
  `viewport-fit=cover`).
- The native app shows `/admin` to admins, so the chat widget appears in the iOS app too.
- Screenshots go to `~/Downloads/ADVO/ADVO/Screenshots/<feature>-2026-10-18/` (desktop 1440 +
  mobile 390 for layout changes), shot from the real running app, inspected before reporting.

### User decisions already made (do not reopen)

- **MCP:** read + change, no deletes, one bot key per team member, managed in Settings →
  Members, "live" = fresh on every call + signed push webhooks on **every** change (human edits
  too), meetings merged into the existing meeting tables.
- **Plaud chat:** keep the teammate's shipped Open-API import + heuristic router (drop
  DCR/MCP-client OAuth and `plaud_*` tables). Add: floating chat widget, 2 tabs at top "Updates"
  and "Ask", very few common words, tap buttons for answers. Unsure match → buttons: top likely
  projects, "New project" (type name, bot creates it; one extra client button question if >1
  client), "Don't add". Confident match → short FYI with OK/Change. Not ADVO → no message. One
  main project keeps the full untouched transcript; side projects get a linked copy with only
  their excerpt, same title. One meeting per project per day (display grouping is acceptable
  since the teammate's model is one row per recording). Ask reads projects/meetings/calendar
  only (no transcripts). Widget is OWNER-only (`user.isOwner` — the "message the owner" ask; 9
  users are admin, only 2 are owners). Attendee prompt stays dropped.
- **iOS:** Capacitor, bundled dist, self-hosted OTA via `@capgo/capacitor-updater` and
  `advo.ph/app-updates/latest.json` from CI, members-only, password login in app (magic link
  web-only for now), appId `ph.advo.app`, app icon made from the current ADVO round mark, OTA CI
  steps inside the verify job.

---

## 2. What is already DONE and must be archived at closeout

These predate the three concurrent plans above and are confirmed complete by direct code
inspection (not just plan-file inspection) during this planning round:

- **`process/features/admin-simplify/` — all 11 phases** (`admin-simplify_UMBRELLA_02-09-26.md`
  + `phase-01` through `phase-11`, including `phase-11_tasks-unification_03-09-26.md`, which is
  confirmed shipped: `deliverable` table carries the unified task model, migration `042` exists
  on disk). **Exception:** `phase-10_plain-language_02-09-26.md` is **partial** — no
  owner-signed "rename table" artifact was found confirming every renamed label in that phase
  landed; archive the other 10 phases as done and leave `phase-10` + the umbrella open with a
  note, or re-verify `phase-10`'s specific checklist against the current UI before archiving it
  too (do not assume done without that check).
- **`process/general-plans/active/meetings-scheduling-join_PLAN_03-09-26.md`** — confirmed
  shipped: `meeting.starts_at`/`ends_at`/`location`/`description`, nullable `project_id`,
  `meeting_attendee` table all exist in `apps/api/src/db/schema.ts` today (migration content
  renumbered to `041` per `856d5f0`'s commit message, originally drafted as `034` in this plan
  file — the plan's own migration number is stale, the shipped feature is not). **One residual
  item:** the plan's goal #6 ("relabel all 'Plaud'-branded UI strings to 'Transcriptions'") has
  one known straggler at `apps/web/src/components/admin/AdminMeetings.tsx:582` — this is
  explicitly handled by the Plaud-chat plan (which touches that area anyway), not by this
  integration pass. Archive this plan at closeout once that one string is confirmed fixed by
  the chat plan's own EXECUTE.
- **`process/general-plans/active/visitor-analytics_PLAN_09-10-26.md`** — self-reports
  `Status: EXECUTED 2026-10-09` with its own execution log and deviations section at the bottom
  of the file. Archive as-is.

**Supersession, not completion:**

- **`process/general-plans/active/plaud-meetings_PLAN_18-10-26.md`** — self-reports `Status: ⏳
  Not started`, and its own header admits it was "revised three times same day." It is
  **superseded by `process/features/plaud-chat/active/plaud-chat_PLAN_18-10-26.md`**, which
  replaces its DCR/MCP-client OAuth approach and `plaud_*` table design with the Open-API
  import + heuristic router the user actually confirmed (see §1 "User decisions already made").
  Do not execute this file. Move it to `process/general-plans/completed/` (or a
  `superseded/` note) at closeout, pointing at the chat plan as its replacement — do not delete
  it outright, since its schema-decision writeup (why `recorded_at` vs `starts_at` are distinct)
  is still useful history.

## 3. Rationale snapshot: why each "meeting" plan converged on one table

Three separate planning rounds (`meetings-scheduling-join`, the stale `advo-mcp` Phase 3,
`plaud-meetings`) each independently proposed splitting meeting data into a second table for
their own purpose (join tracking, generic transcripts, Plaud-specific recordings). All three were
walked back to the single existing `meeting` table once each plan's author re-checked the
then-current schema and found the earlier plan's columns already shipped. This umbrella exists
partly so a fourth round doesn't repeat the mistake: **if a future plan proposes a new
meeting-shaped table, that is a signal to re-read `apps/api/src/db/schema.ts`'s `meeting` block
first**, not a new requirement.

## 4. Merge + integration-verification checklist (run after Wave 2 + both worktrees merge)

**Status (18-10-26, final integration pass, iOS merged): items 1-7 (including 5(c)) done and
verified below. iOS's `feat/ios-app` worktree output merged into `main` alongside the chat+MCP
work; two native-only bugs found in the worktree's own screenshots (double top safe-area padding,
marketing CTA reachable on native login) were fixed during this pass — see
`process/features/ios-app/reports/ios-app-integration-final-18-10-26.md` for full evidence. Item
8 (admin-simplify/visitor-analytics archival) remains deferred to an explicit UPDATE PROCESS
pass, not executed here (EXECUTE mode does not archive plans).**

1. ✅ Confirmed migration ordering on disk: `055_bot_key.sql`, `056_change_webhooks.sql`,
   `057_plaud_chat.sql` all present, all 57 migrations apply cleanly in order via
   `npm run db:local -- --name advo_integration_check --base postgresql://advo:changeme@localhost:5432`
   (fresh DB, dropped after) — `clean — every migration applied, and every declared CHECK is
   present.` `advo_dev` was also already at `057_plaud_chat.sql`.
2. ✅ Diffed `apps/api/src/index.ts` against `main`: only the additive mounts named in §1 "File
   ownership" landed (`/mcp`, `/api/bot-keys`, `/api/webhooks`, `/api/chat`, the generic
   change-log middleware, webhook poll start/stop) — no reordering of unrelated existing lines.
3. ✅ Diffed `apps/api/src/db/schema.ts` against `main`: `git diff main -- schema.ts` has zero
   removed lines — purely additive. `parentMeetingId` + `idx_meeting_parent` on the existing
   `meeting` block is the only non-append change, as specified. **Found and fixed one real merge
   defect during this pass**: the `webhookDelivery` table's `(t) => [...]` index array and the
   `pgTable(...)` call were left unclosed by the 3-way schema merge (`TS1137` on tsc), which also
   made `chatMessage`'s preceding doc comment get swallowed into the array. Fixed by closing the
   array/call before the comment; both `apps/api` and `apps/web` typecheck clean afterward.
4. ✅ `npm run build` — green (web typecheck + vite build + prerender, api `tsc`). `npm run lint`
   — 0 errors, 22 pre-existing warnings (`react-refresh/only-export-components`, unrelated files).
   `./scripts/test-local.sh` (full suite) — **884 passed / 7 failed / 3 skipped (894 total)**,
   0 collection failures. All 7 failures match the known pre-existing baseline exactly: legal
   footer copy mismatch (`legal-compliance.test.ts`), `plaud-resilience.test.ts` ×2 (poller
   suppression assertions), `client-thread.test.ts` ×2 (deliverable-completion notify), and
   `e2e-flow.test.ts` ×2 (magic-link enumeration status code, avatar URL path format) — **0 new
   failures introduced by this integration pass**. The new `describe("Chat", ...)` block in
   `api-wiring.test.ts` passed in full.
5. Manual smoke:
   - (a) **MCP** — minted a bot key for a live team member, called `tools/call` →
     `update_deliverable` directly over the stateless Streamable HTTP endpoint (no `initialize`
     needed — a fresh `McpServer` is constructed per POST) and got back the updated row. Done via
     curl rather than MCP Inspector (equivalent JSON-RPC wire format); not re-run through
     Inspector specifically.
   - (b) **Chat** — opened `/admin` as the real owner (`admin`/`changeme`), confirmed `ChatWidget`
     renders bottom-right, does not overlap `JobProgressWidget` (no active job during this run,
     so no visual collision to show, but the z-index/position contract is unchanged from the
     chat plan's own EXECUTE), and ran a full "Ask" exchange — got the honest
     `"Ask is off right now."` fallback (no local `ANTHROPIC_API_KEY`, as expected).
   - (c) **iOS** — merged and verified this pass. Reconciled `package-lock.json` (both the MCP
     SDK and the full `@capacitor/*`/`@capgo/capacitor-updater` trees now present via a root
     `npm install`). Found and fixed two native-only bugs from the worktree's own screenshot
     evidence: double top safe-area padding (`capacitor.config.ts`'s `ios.contentInset`
     `"automatic"` → `"never"`, the CSS `env(safe-area-inset-top)` rule in `index.css` is now the
     sole mechanism) and a marketing "Start a project" CTA + nav links reachable on the native
     `/login`/legal screens (`LandingNav.tsx` now hides both behind `isNativeApp()`). Root build/
     lint/`test:local` re-verified clean (897 passed/7 failed — exact pre-existing baseline/3
     skipped, 0 new failures, includes the 13 OTA tests). Native Simulator build (iPhone 17 Pro,
     `xcodebuild` via `.xcodeproj`, no `.xcworkspace` since this is SPM-only) succeeded; 3
     screenshots captured via `simctl` only (no GUI-coordinate automation, per the
     shared-machine safety constraint) confirming both fixes and the ChatWidget/AdminBottomNav
     non-overlap in the native shell. Final rebuild done with `VITE_API_URL=https://api.advo.ph`
     (matching CI's own prod build env, not the local test override) — confirmed no `localhost`
     string anywhere in the committed config or build output. Simulator shut down at the end.
     Full evidence: `process/features/ios-app/reports/ios-app-integration-final-18-10-26.md`.
6. ✅ Screenshots: desktop 1440 + mobile 390, saved to
   `~/Downloads/ADVO/ADVO/Screenshots/chat-mcp-integration-2026-10-18/` (10 files), inspected
   before reporting: chat bubble with unread badge, an unanswered Updates question, the same
   question locked after a real tap (button highlighted, others dimmed), the full "New project"
   flow end to end (name → "Which client?" → "Done. Added to \<Name\>."), an Ask exchange, the
   bot-key reveal dialog showing the new MCP server URL + Grok connect snippet, and the mobile
   full-screen sheet version of the Updates flow.
7. ✅ Triggered one real write of each of the four kinds and confirmed each produced one
   `activity_log` row and one `webhook_delivery` reaching a local listener with a valid
   `X-ADVO-Signature`, against a temporary active `member_webhook` (deactivated afterward):
   `project_updated`/`source:'api'` (human PATCH), `deliverable_updated`/`source:'bot'` (MCP
   `update_deliverable`), `meeting_routed`/`source:'plaud'` (simulated `onPlaudMeetingImported`
   import), `meeting_updated`/`source:'chat'` (chat-driven project reassignment). This also
   closes out this pass's own fix-list item 1: `chat.service.ts`'s `logChat()` and
   `plaud-chat.service.ts`'s `onPlaudMeetingImported()` activity-log inserts were switched from
   direct `db().insert(activityLog)` calls to the shared `logActivity()` helper (so Plaud/chat
   events now queue webhook deliveries, which they did not before this pass), and every
   pre-existing self-logging site (`change-order.routes.ts`, `projects.routes.ts` ×3,
   `project-signoff.service.ts` ×5, `commission.service.ts` ×4) now also calls
   `queueDeliveriesForActivity()` after its own insert (inside the same transaction's commit
   boundary for the four `tx.insert(...)` sites, via a captured activity id queued right after
   the transaction resolves — never from inside the still-open transaction).
8. **Not run this pass** — archival is correctly gated on iOS also merging per this file's own
   §5 sequencing ("Each of the three features' phase-1-equivalent plans must be independently
   approved and executed before Wave 2... re-run this file's §4 checklist... before archiving
   anything in §2"). Re-run full item 8 once iOS lands.

## 5. Resume and execution handoff

- This file is the **umbrella of umbrellas** — it is not itself an EXECUTE target.
- Immediate next action: `ENTER EXECUTE MODE` against
  `process/features/advo-mcp/active/advo-mcp_phase-1-keys-and-read-mcp_PLAN_18-10-26.md`
  in the main tree, in parallel with (separately, in their own worktrees) the iOS and Plaud-chat
  plans once they exist and are reviewed.
- Each of the three features' phase-1-equivalent plans must be independently approved and
  executed before Wave 2 (MCP Phase 2) begins — Wave 2 depends on the merged state of all of
  Wave 1, not just MCP's own Phase 1.
- Re-run this file's §4 checklist, not a shortened version of it, before archiving anything in
  §2 — the archival step is explicitly gated on integration verification passing, not on any
  single feature's own phase green-check alone.
