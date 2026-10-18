# Plaud Recording → Project Meeting Sync — COMPLEX Plan

**Date:** 18-10-26 (revised three times same day — auth approach switched to remote-MCP + DCR; model switched to `claude-opus-5-5`; the old "Review inbox" admin page replaced with a floating chat widget, attendees-confirmation flow dropped)
**Complexity:** COMPLEX (new integration, new data model, server-side OAuth/DCR, AI matching, new admin surfaces)
**Status:** ⏳ Not started
**Plan file:** `process/general-plans/active/plaud-meetings_PLAN_18-10-26.md`

---

## 1. Overview

Connect ADVO's server to the user's Plaud account. Every ~15 minutes, 24/7, the
server polls Plaud for new recordings, fully scrapes each one (audio link,
transcript, AI summary, notes, highlights, outline, metadata), classifies it
("is this a real meeting, and about which ADVO project?") with Claude, and —
for confident matches — automatically creates/extends a `meeting` row for that
project+day, links it into the existing records calendar. A floating chat
widget, bottom-right of every admin page, is the owner's single surface for
all of this: a short message appears in its **Updates** tab for every
confident match (FYI, tap OK/Change) and every unsure match (tap the likely
project, or "New project", or "Don't add"); a separate **Ask** tab lets the
owner type plain questions about projects/meetings/calendar and get short AI
answers. Non-meetings (lectures, casual chats, Plaud's own tutorial
recordings) produce no chat message at all — zero noise. A recording's one
**primary** project keeps the full, unmodified transcript forever; any
**side** projects mentioned in passing get a linked copy of only the
relevant excerpt, under the same title — the original is never touched.

This closes a gap `docs/ROADMAP.md` / `docs/FEATURES.md` / `docs/HANDOFF.md`
already flag explicitly: the ADVO records calendar's Phase 2 plan lists
**"meetings"** as a remaining, not-yet-built event layer. This feature builds
that layer, sourced automatically from Plaud instead of manual entry.

### Decisions already locked by the user (not reopened by this plan)

1. Sync runs server-side (PM2 `advo-api`), on a 24/7 ~15-minute interval, using
   the agency's own Plaud account — not the Mac's local MCP session.
2. Confident matches auto-link. Unsure matches are resolved via tap-button
   questions in the chat widget's Updates tab (no separate Review-inbox
   page). Non-meetings are skipped/ignored automatically, with no chat
   message.
3. One **primary** project per recording (full, untouched transcript). Any
   **side** projects mentioned get a linked copy under the same title with
   only the relevant excerpt — the primary's transcript is never modified.
4. One `meeting` per project per **Asia/Manila** calendar day. All of that
   project's recordings from that day attach to the same meeting.

### Revision note (18-10-26, same day)

Two changes from the original version of this plan, both reflected throughout
below:

1. **Auth approach switched.** New evidence (curl-verified against Plaud's
   own endpoints) shows Plaud exposes a full Dynamic-Client-Registration
   (DCR) OAuth server at `https://mcp.plaud.ai/` backing a remote MCP server
   at `https://mcp.plaud.ai/mcp`. ADVO's server now becomes an **MCP client**
   of the user's own Plaud account via that remote server — the same tools
   the user calls locally (`list_files`, `get_file`, `get_transcript`,
   `get_note`) — using `@modelcontextprotocol/sdk`'s client + OAuth helpers.
   This needs **no Plaud developer-portal signup** (that portal issues
   credentials for Plaud's *Embedded SDK*, a different product this feature
   does not use). §10.1's prior "register in the developer portal" open
   question is **removed** — see revised §10.1.
2. **Model switched.** Matching/excerpting uses **`claude-opus-5-5`**, not
   `claude-opus-4-8` (the model `contract-review.service.ts` happens to use).
   Low call volume (~15 recordings/day) and Tagalog/Taglish transcript
   accuracy justify the stronger model. Defined once as a shared constant,
   not duplicated.

### Revision note (18-10-26, third revision — chat widget replaces Review inbox)

User request: "make the website simpler" — replace the planned Review-inbox
admin page with a single floating chat widget. This plan now reflects:

1. **Old Phase 6 "Review inbox" is deleted, not built.** No `plaud-review`
   nav entry, no `PlaudReviewInbox.tsx`. Every unsure match, confident-match
   FYI, and new-project creation now happens as a tap-button conversation in
   the chat widget's **Updates** tab (§6, §8 Phase 6 below). The backend
   `plaud_recording.match_status='review'` state is unchanged — only how a
   human resolves it changed (a chat answer, not a list page).
2. **New "Ask" tab** (§6, §8 Phase 7): a second, independent chat for
   general questions about ADVO data (projects, meetings, calendar),
   answered by Claude from a small read-only data snapshot, short
   plain-English replies only.
3. **Attendees-confirmation is dropped outright, not kept as a tiny
   question.** `meeting.attendees` / `meeting.attendees_confirmed` columns,
   the "who attended?" prompt, and `MeetingAttendeesDialog.tsx` are removed
   from this plan entirely. Rationale: it would have added a second
   multi-step chat flow for low-value data the user did not ask for, which
   runs directly against the "make it very simple" / "very few words"
   instruction. If per-meeting attendee notes are wanted later, that is a
   new, separately-planned feature — not reopened here.
4. **Matching service (§8 Phase 3) now returns ranked candidates, not just
   one.** `classifyRecording` adds `rankedCandidates: Array<{projectId,
   confidence}>` (top 3, highest first) alongside the existing primary/side
   output, so the chat widget can offer the 2–3 most likely projects as tap
   buttons on an unsure match, per the user's explicit requirement.
5. **Two defaults are applied below and flagged for the user to confirm or
   override at plan review** (not hard blockers — the plan proceeds with the
   stated pick unless overridden): see §10.1.

---

## 2. Research findings (grounded in this repo + the installed Plaud MCP + live Plaud endpoints)

### 2.1 PRIMARY PATH — Plaud's remote MCP server (what the server actually calls)

Curl-verified today against Plaud's own well-known endpoints:

- `GET https://mcp.plaud.ai/.well-known/oauth-protected-resource` →
  `{"resource":"https://mcp.plaud.ai/mcp","authorization_servers":["https://mcp.plaud.ai/"]}`
- `GET https://mcp.plaud.ai/.well-known/oauth-authorization-server` →
  `authorization_endpoint: https://mcp.plaud.ai/authorize`,
  `token_endpoint: https://mcp.plaud.ai/token`,
  `registration_endpoint: https://mcp.plaud.ai/register` (RFC 7591 Dynamic
  Client Registration — **no pre-shared credentials needed**), PKCE `S256`,
  `grant_types_supported` includes `authorization_code` + `refresh_token`,
  `token_endpoint_auth_methods_supported` includes `"none"` (public client,
  no client secret required). This matches how third parties such as Nango
  integrate the Plaud MCP: call `mcp.plaud.ai/register` to obtain a
  `client_id`, no developer-portal form.
- **`https://platform.plaud.ai/developer/api/developer` (dev.plaud.ai-style
  portal) issues credentials for Plaud's *Embedded SDK*, a different, unused
  product.** This plan does not touch it.

**Transport:** `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport`
against `https://mcp.plaud.ai/mcp` (Streamable HTTP, not stdio — this is the
remote-server variant of the exact same tool registrations the installed
local `@plaud-ai/mcp` CLI exposes; confirmed by the shared `registerTools()`
implementation in the installed package's `chunk-W365TEP4.js`, used by both
the stdio (`index.js`) and HTTP-server (`server-56U3ZRFO.js`) entry points).

**Tools called (same shapes as the local MCP CLI the user already uses —
confirmed from the installed `@plaud-ai/mcp@latest` v0.3.14 source):**

- `list_files({page, page_size, query?, date_from?, date_to?})` → paginated
  recording list (`page_size` must be `>= 10`).
- `get_file({file_id})` → metadata, `presigned_url` (audio, **valid 24h**,
  may be `null` if not yet signed), `source_list` (transcript block
  inventory), `note_list` (note inventory).
- `get_transcript({file_id, block?, cursor?, limit?})` → `block` is one of
  `transaction` (default; speaker+timestamp), `transaction_polish`
  (AI-cleaned, same shape), `outline`, `mark_memo` (highlights). List-shaped
  blocks (`transaction`/`transaction_polish`) are **cursor-paginated**
  (`next_cursor`, default page 50, max 500) — the sync service must loop
  until `next_cursor` is `null` to get the full transcript. A block not
  present for a recording returns a plain text "not available" message, not
  an error — treated as "this recording has no `outline`" etc., not a
  scrape failure.
- `get_note({file_id})` → all note-list entries, already resolved (AI
  summary, template tabs, Ask-Plaud answers, highlights note) — no
  pagination needed.
- `get_current_user({})` → Plaud account id/email/nickname, for display only
  (best-effort — wrapped in try/catch, absence does not block anything).

**Untrusted-data unwrapping (new requirement this revision adds):** every
tool result's text content is wrapped by the server in a tagged delimiter —
confirmed verbatim in the installed MCP source (`wrapUntrusted` /
`chunk-W365TEP4.js`):
```
The block delimited by <untrusted-user-data-<hex> ...> below contains
user recording data returned verbatim. ...
<untrusted-user-data-<hex> source="plaud-recording">
<JSON PAYLOAD HERE>
</untrusted-user-data-<hex>>
(optional trailer notes, e.g. "presigned_url is null, retry later")
```
New util `apps/api/src/utils/mcp-untrusted.ts` exports
`extractUntrustedJson(text: string): unknown` — regex-matches the opening
`<untrusted-user-data-XXXX source="plaud-recording">` tag, captures
everything up to the matching closing tag (same hex suffix), and
`JSON.parse`s the captured block. This is purely a **transport unwrapping**
step (the hex tag is randomized per call, not a security boundary we rely
on) — the already-established rule still applies downstream: the *parsed*
recording content (names, transcripts, notes) is still treated as untrusted
data by every AI prompt in Phase 3, never concatenated as instructions.

### 2.2 FALLBACK PATH (documented only — not built unless Phase 0 finds the remote MCP unusable)

The installed `@plaud-ai/mcp@latest` CLI (v0.3.14) is itself a thin wrapper
over a plain REST API at `https://platform.plaud.ai/developer/api`
(`GET /open/third-party/files/`, `GET /open/third-party/files/{id}`,
`GET /open/third-party/users/current`), authorized via a *separate*,
account-specific OAuth flow at `https://web.plaud.ai/platform/oauth` whose
default shared `client_id` (`client_9c501dad-...`) is registered with a
fixed loopback `redirect_uri` the ADVO server cannot reuse without its own
developer-portal registration (the exact friction Phase 0 and the remote-MCP
path above avoid). **This fallback is not implemented in this plan.** It
remains documented here only so that if Phase 0 (below) discovers the remote
MCP path is unreliable (rate-limited, unstable, or missing a needed tool for
server-to-server use), the next step is "build the direct-REST client
described in this paragraph," not a fresh research cycle. No code, schema,
or env var in this plan commits to this path.

### 2.3 Chosen auth approach — ADVO's server as an MCP client of the user's own Plaud MCP

**Decision:** The ADVO API server becomes a long-lived **MCP client** of
`https://mcp.plaud.ai/mcp`, authenticated via standard MCP OAuth (RFC 9728
protected-resource discovery → RFC 8414 authorization-server metadata → RFC
7591 Dynamic Client Registration → PKCE `S256` authorization-code flow →
refresh-token rotation), using `@modelcontextprotocol/sdk`'s exported OAuth
helper functions (`discoverOAuthServerInfo`, `registerClient`,
`startAuthorization`, `exchangeAuthorization`, `refreshAuthorization` — all
confirmed present in the installed SDK, `@modelcontextprotocol/sdk@1.32.1`,
`dist/esm/client/auth.d.ts`) driven by a small custom, Postgres-backed
implementation of the SDK's `OAuthClientProvider` contract. "Connect Plaud"
in Settings → Integrations triggers: DCR (once per environment — see §3.1),
then a normal browser-based PKCE login by the admin, then token exchange;
"Sync now" / the 15-minute poller then calls `list_files`/`get_file`/
`get_transcript`/`get_note` as an authenticated MCP client, refreshing tokens
automatically when they near expiry.

**Why this, and not the alternatives:**
- *Copy the Mac's local token file* (`~/.plaud/tokens-mcp.json`) — rejected:
  shares one refresh-token chain across two independent consumers; the first
  side to refresh invalidates the file on disk for the other, exactly the
  failure mode the user flagged. Also requires manually shipping a secret
  file to the VPS.
- *Direct REST client against `platform.plaud.ai/developer/api` with a
  dedicated developer-portal app registration* — this was the prior
  revision's choice; **superseded**. It required a manual signup step in a
  portal that (per this revision's research) issues credentials for a
  different product (the Embedded SDK), not for MCP-shaped third-party
  access. Kept only as the documented fallback in §2.2.
- **MCP client of the remote Plaud MCP server, via DCR (chosen)** — this is
  literally "connect ADVO to the Plaud MCP the user already uses," calls the
  exact same tools, needs no portal signup (DCR is self-service and
  anonymous — it is how Nango's own Plaud integration works), and still
  gives the server its **own independent OAuth client registration + own
  token chain**: DCR issues a fresh `client_id` for ADVO specifically, and
  each subsequent authorization-code exchange against that `client_id`
  produces its own refresh-token chain, independent of the Mac's local MCP
  session's own (differently-registered) client.

### 2.4 ADVO codebase conventions confirmed (so EXECUTE has zero ambiguity)

- Monorepo: `apps/api` (Hono + Drizzle + Postgres, Node 20, ESM `.js` import
  extensions), `apps/web` (React/Vite admin, `@tanstack/react-query`,
  shadcn/ui `Tabs`, `Panel`, `Badge`, `Dialog` components, `get/post/patch/del`
  wrapper in `apps/web/src/lib/api.ts`, camelCase↔snake_case mapping done by
  hand in each hook's `map*` function — see `apps/web/src/hooks/useAdminPortfolio.ts`).
- Drizzle schema source of truth: `apps/api/src/db/schema.ts`. Raw SQL
  migrations live at `apps/api/migrations/NNN_description.sql`, applied
  directly via `psql` as the app DB user, then mirrored into `schema.ts`.
  Current highest migration is `005_portfolio_enabled.sql` (uncommitted, from
  an unrelated in-flight task — **do not touch or renumber it**). This plan's
  migration is `006_plaud_meetings.sql`.
- Growable, app-validated string sets use `varchar` + a documented
  `COMMENT ON TABLE`, not a Postgres enum (see `calendar_event.category`,
  `contract.contract_type`/`status`) — this plan follows the same convention
  for `plaud_recording.sync_status`/`match_status` and
  `meeting_recording.role`.
- RBAC: `requireAuth` (any logged-in user) + `requireTeam` (`admin`|`team`) /
  `requireAdmin` from `apps/api/src/middleware/rbac.ts`. **Every** new Plaud
  and chat route is `requireAdmin` (§5, §10.1 decision #1) — the third
  revision scopes this whole feature to the single ADVO owner, not
  `requireTeam`.
- Route/service pattern: one `Hono` router per domain in `apps/api/src/routes/*.routes.ts`,
  mounted in `apps/api/src/index.ts` via `app.route("/api/x", xRoutes)`; `zod`
  + `@hono/zod-validator`; lenient validators `looseUrl`/`flexibleDateTime`
  from `apps/api/src/utils/validators.ts` for any admin-editable
  URL/date field (per repo memory: strict `.url()`/`.datetime()` 400s admin
  Save buttons).
- Periodic background work: `apps/api/src/index.ts` already runs an hourly
  `setInterval` (`cleanExpiredSessions`) after `serve(...)`, with try/catch +
  `log.error`. The Plaud sync poller follows this exact pattern (new
  `setInterval`, independent of the session-cleanup one).
- AI calls: `@anthropic-ai/sdk`, bare `new Anthropic()` (reads
  `ANTHROPIC_API_KEY` from env — already configured in prod for contract
  review / brand analysis); JSON-only system prompt, strip code fences,
  `JSON.parse`, validate shape before trusting any field, **fall back to a
  heuristic on any error, missing key, or malformed output** (same pattern as
  `reviewWithClaude` / `contract-review.service.ts:233-280`). This plan
  reuses that exact call/validate/fallback *pattern*, but **not** that file's
  model string: per the 18-10-26 revision, matching/excerpting uses a
  dedicated shared constant `PLAUD_MATCHING_MODEL = "claude-opus-5-5"`
  (defined once in `plaud-matching.service.ts`), not
  `contract-review.service.ts`'s `"claude-opus-4-8"` — low call volume
  (~15/day) and Tagalog/Taglish accuracy justify the stronger model; this is
  an intentional, documented deviation from that file's model choice, not an
  inconsistency to "fix."
- Env/config: `apps/api/src/utils/env.ts` is a single `zod` schema parsed once
  in `loadEnv()`; new env vars are added there as `.optional()` so an
  un-configured Plaud integration does not break existing deploys/tests.
- Tests: `apps/web/src/test/api-wiring.test.ts` is a single integration suite
  hitting one live shared API+DB, run with `fileParallelism: false`
  (`apps/web/vitest.config.ts`) specifically because tests mutate shared
  state serially. New Plaud endpoint tests are added as a new
  `describe("Plaud", ...)` block there, following the existing
  auth-gate + shape + CRUD assertion style seen in `describe("Contracts ...)`.
  No existing `apps/api`-local test runner was found — `apps/api` has no
  `*.test.ts` files; all current API behavior is exercised from
  `apps/web/src/test/api-wiring.test.ts` against a running API instance. This
  plan follows that same integration-test convention rather than introducing
  a new one.
- `notification` table (`client_id` **NOT NULL** FK → `client`) is a
  **client-portal-facing** notification feed, not an internal admin inbox.
  The chat widget's bot messages live in a new, separate `chat_message`
  table (§3.6) — not `notification` rows; see §3.6 for why.
- UI kit already has everything the chat widget needs: `apps/web/src/components/ui/sheet.tsx`
  (full-screen mobile sheet), `drawer.tsx`, `tabs.tsx` (Updates/Ask tabs),
  `badge.tsx` (unread counts) — all shadcn components, same import style as
  existing admin screens. `apps/web/src/hooks/useMobile.ts`'s
  `useIsMobile()` already exists and is the mobile/desktop switch the
  widget uses (full-screen sheet below the existing `MOBILE_BREAKPOINT`,
  small fixed bottom-right panel above it) — no new breakpoint logic
  needed.
- No realtime infra exists in this repo (no websocket/SSE/socket.io found
  anywhere in `apps/api`/`apps/web`) — the chat widget's "new message"
  signal is plain `@tanstack/react-query` polling (`refetchInterval`), the
  same library already used everywhere else in `apps/web`. No new
  transport/dependency is introduced for this.
- `project.clientId` is a **NOT NULL** FK to `client` — the chat's "New
  project" flow cannot create a project without a client. See §6's
  new-project flow for the exact one-extra-question handling of this.
- `userRoleEnum` is exactly `admin`\|`team`\|`client`
  (`apps/api/src/db/schema.ts`) — there is no dedicated "owner" role. The
  plan defaults the chat widget to `requireAdmin`-only (§10.1 decision #1,
  flagged for confirmation).

---

## 3. Data model — migration `006_plaud_meetings.sql`

Six new tables — the usual five Plaud/meeting tables plus `chat_message`
(new in the third revision, §3.6, backing the chat widget).
`project`/`calendar_event`/`client`/`team_member`/`user` are unchanged
(read-only FKs).

### 3.1 `plaud_oauth_client`

Holds the result of Dynamic Client Registration against
`https://mcp.plaud.ai/register`. **Registered once per distinct
`redirect_uri`** (i.e. once for prod, once for local dev) and reused for
every subsequent connect/reconnect — DCR is not re-run on every "Connect
Plaud" click, only when no row exists yet for the environment's
`redirect_uri`.

| Column | Type | Notes |
|---|---|---|
| `plaud_oauth_client_id` | bigserial PK | |
| `redirect_uri` | varchar(500) NOT NULL UNIQUE | the `redirect_uri` this registration was issued for |
| `mcp_client_id` | varchar(255) NOT NULL | from DCR response |
| `mcp_client_secret_encrypted` | text | nullable — AES-256-GCM; DCR's `token_endpoint_auth_methods_supported` includes `"none"`, so a secret may not be issued, but the column exists in case Plaud issues one |
| `raw_registration` | jsonb NOT NULL | full `registerClient()` response, for forward-compat/debugging |
| `registered_at` | timestamptz NOT NULL DEFAULT NOW() | |

### 3.2 `plaud_connection`

One active row = one connected Plaud account (tied to one
`plaud_oauth_client` registration). Historical rows kept (`is_active=false`)
for audit on reconnect; never hard-deleted.

| Column | Type | Notes |
|---|---|---|
| `plaud_connection_id` | bigserial PK | |
| `plaud_oauth_client_id` | integer NOT NULL FK → `plaud_oauth_client.plaud_oauth_client_id` ON DELETE CASCADE | which DCR registration this token chain belongs to |
| `connected_by` | integer FK → `user.user_id` ON DELETE SET NULL | admin who ran the connect flow, nullable (see §7.3 callback note) |
| `plaud_user_id` | varchar(100) | from `get_current_user`, nullable, best-effort |
| `plaud_email` | varchar(255) | from `get_current_user`, nullable, display-only |
| `access_token_encrypted` | text NOT NULL | AES-256-GCM, see §3.7 |
| `refresh_token_encrypted` | text NOT NULL | AES-256-GCM |
| `token_type` | varchar(20) NOT NULL DEFAULT 'Bearer' | |
| `expires_at` | timestamptz | access token expiry |
| `is_active` | boolean NOT NULL DEFAULT true | exactly one true row expected (app-enforced, not a DB constraint — mirrors `calendar_event`-style app-validated fields) |
| `last_synced_at` | timestamptz | |
| `last_sync_error` | text | last poll's error, cleared on success |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `idx_plaud_connection_active` on `is_active`,
`idx_plaud_connection_oauth_client` on `plaud_oauth_client_id`.

### 3.3 `plaud_recording`

One row per Plaud `file_id`. Append/update-only from the sync poller.
**Unchanged from the prior revision** — still populated by calling the same
logical operations (`list_files`/`get_file`/`get_transcript`/`get_note`),
now sourced via the MCP tool calls of §2.1 instead of raw REST, with results
unwrapped via `extractUntrustedJson` before being written to these columns.

| Column | Type | Notes |
|---|---|---|
| `plaud_recording_id` | bigserial PK | |
| `plaud_file_id` | varchar(100) UNIQUE NOT NULL | idempotency key |
| `name` | varchar(500) | Plaud's recording title |
| `recording_started_at` | timestamptz | `start_at` from Plaud, nullable (untitled/odd recordings may lack it — fall back to `created_at_plaud`) |
| `duration_ms` | integer | |
| `created_at_plaud` | timestamptz | Plaud's own `created_at`, for ordering/backfill paging |
| `audio_presigned_url` | varchar(1000) | **24h-expiring** — re-fetched on demand by the admin UI's "play"/"download" action via `GET /api/plaud/recordings/:id/audio`, never trusted stale from this column beyond a few minutes |
| `audio_presigned_url_fetched_at` | timestamptz | so the API route knows to re-fetch from Plaud instead of serving a stale link |
| `transcript_transaction` | jsonb | raw speaker+timestamp utterances, fully paginated/assembled |
| `transcript_polish` | jsonb | AI-cleaned transcript, same shape, fully paginated/assembled |
| `transcript_outline` | jsonb | |
| `highlights` | jsonb | `mark_memo` marks, `[]` if none |
| `notes` | jsonb | resolved `get_note` output (AI summary, template tabs, Ask-Plaud, highlights note) |
| `raw_metadata` | jsonb | full unwrapped `get_file` payload, for forward-compat/debugging |
| `sync_status` | varchar(30) NOT NULL DEFAULT 'pending' | `pending`\|`scraping`\|`ready`\|`retry_pending_transcript`\|`error` — app-validated, documented via `COMMENT ON TABLE` |
| `sync_error` | text | last scrape error |
| `last_scraped_at` | timestamptz | |
| `match_status` | varchar(30) NOT NULL DEFAULT 'unprocessed' | `unprocessed`\|`matched`\|`review`\|`ignored_non_meeting`\|`ignored_manual` |
| `is_meeting` | boolean | AI/heuristic verdict, null until classified |
| `match_confidence` | numeric(4,3) | 0.000–1.000, primary-project confidence |
| `match_reasoning` | text | one-paragraph AI explanation, used when composing the chat widget's unsure-match question (§6.3) |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `idx_plaud_recording_match_status`, `idx_plaud_recording_sync_status`,
`idx_plaud_recording_started_at`.

### 3.4 `meeting`

**Unchanged from the prior revision.** One row per project per Manila day.

| Column | Type | Notes |
|---|---|---|
| `meeting_id` | bigserial PK | |
| `project_id` | integer NOT NULL FK → `project.project_id` ON DELETE CASCADE | |
| `meeting_date` | date NOT NULL | Asia/Manila calendar date of the recording(s) |
| `title` | varchar(255) NOT NULL | derived, e.g. `"<project.title> — Meeting"` |
| `calendar_event_id` | integer FK → `calendar_event.calendar_event_id` ON DELETE SET NULL | the `category='meeting'` row this meeting backs |
| `created_at` / `updated_at` | timestamptz | |

**No `attendees`/`attendees_confirmed` columns** (removed in the third
18-10-26 revision — see the revision note above). Attendee tracking is out
of scope for this plan entirely, not deferred to a later phase here.

Unique index: `uq_meeting_project_date` on `(project_id, meeting_date)`.
Index: `idx_meeting_calendar_event`.

### 3.5 `meeting_recording`

**Unchanged from the prior revision.** Links recordings to the meeting they
belong to; carries the primary/side distinction and, for side links only,
the excerpt copy.

| Column | Type | Notes |
|---|---|---|
| `meeting_recording_id` | bigserial PK | |
| `meeting_id` | integer NOT NULL FK → `meeting.meeting_id` ON DELETE CASCADE | |
| `plaud_recording_id` | integer NOT NULL FK → `plaud_recording.plaud_recording_id` ON DELETE CASCADE | |
| `role` | varchar(10) NOT NULL DEFAULT 'primary' | `primary`\|`side` — app-validated |
| `excerpt_transcript` | jsonb | **only set when `role='side'`** — the AI-extracted subset of utterances relevant to that side project. Never set for `role='primary'`; the primary's full transcript lives untouched on `plaud_recording`, read by joining through this table. |
| `excerpt_summary` | text | short AI summary of why/what was discussed, side-project rows only |
| `created_at` | timestamptz | |

Unique index: `uq_meeting_recording` on `(meeting_id, plaud_recording_id)`.
Index: `idx_meeting_recording_plaud_recording`.

**Why not the `notification` table:** `notification.client_id` is `NOT NULL`
and the feature is client-portal-facing (progress updates, invoice issued,
etc.). Every message this plan's bot sends is an **internal admin-only**
action with no client-visible equivalent, so it is modeled as a new
`chat_message` row (§3.6) in the admin app only, not a `notification` row.
This avoids widening the client-notification feature's blast radius for an
unrelated internal need.

### 3.6 `chat_message`

New table backing the floating chat widget (§6). One row per message —
either the bot or the owner. Both the **Updates** channel (new-recording
prompts, new-project flow) and the **Ask** channel (general Q&A) share this
one table, distinguished by `channel`.

| Column | Type | Notes |
|---|---|---|
| `chat_message_id` | bigserial PK | |
| `channel` | varchar(10) NOT NULL | `updates`\|`ask` — app-validated |
| `sender` | varchar(10) NOT NULL | `bot`\|`owner` — app-validated |
| `sent_by_user_id` | integer FK → `user.user_id` ON DELETE SET NULL | which admin sent it; always `null` for `sender='bot'` |
| `body` | text NOT NULL | the message text — short, plain, per §6's copy rules |
| `input_mode` | varchar(10) NOT NULL DEFAULT 'none' | `none`\|`buttons`\|`text` — what reply THIS message (when `sender='bot'`) expects next; app-validated |
| `options` | jsonb | present only when `input_mode='buttons'` — array of `{id: string, label: string, style?: 'primary'\|'default'\|'danger'}` |
| `answered_option_id` | varchar(50) | set once the owner taps one of `options`; locks the buttons client-side and server-side (a second tap on an already-answered message is rejected) |
| `context` | jsonb | drives server-side handling of the owner's next reply — `{type: 'confident_fyi'\|'meeting_match'\|'new_project_name'\|'new_project_client'\|'ask_followup', recordingId?: number, candidateProjectIds?: number[], projectName?: string}`; `null` for the owner's own free-text messages |
| `created_at` | timestamptz NOT NULL DEFAULT NOW() | |

Index: `idx_chat_message_channel_created` on `(channel, created_at DESC)`.

**No separate "unread" table.** The unread badge is computed client-side
from a per-channel "last seen" timestamp kept in `localStorage` (§6) — this
keeps the schema minimal and matches the "very simple" instruction; it does
mean unread counts are per-browser, not per-admin-account, which is
acceptable for a single-owner chat.

### 3.7 Token encryption — new `apps/api/src/utils/crypto.ts`

No existing encryption utility in the repo (searched; none found). Add a
small AES-256-GCM helper:

```
encryptSecret(plaintext: string): string   // -> base64(iv):base64(authTag):base64(ciphertext)
decryptSecret(encoded: string): string
```

Key source: new required-when-used env var `PLAUD_TOKEN_ENCRYPTION_KEY`
(64 hex chars = 32 bytes), validated in `utils/env.ts` as
`.optional()` at the schema level (so apps without the Plaud feature
configured still boot) but asserted present at runtime the first time
`plaud_connection`/`plaud_oauth_client` is written to (clear
`HTTPException(501, "PLAUD_TOKEN_ENCRYPTION_KEY not configured")` rather than
a silent crash).

---

## 4. Touchpoints

**New dependency (apps/api):**
- `@modelcontextprotocol/sdk` (`^1.32.1`, matching the version already
  installed transitively via the local `@plaud-ai/mcp` CLI package, confirmed
  compatible) — added to `apps/api/package.json`. Used for: `Client`,
  `StreamableHTTPClientTransport` (`@modelcontextprotocol/sdk/client/streamableHttp.js`),
  and the OAuth helper functions `discoverOAuthServerInfo`, `registerClient`,
  `startAuthorization`, `exchangeAuthorization`, `refreshAuthorization`
  (`@modelcontextprotocol/sdk/client/auth.js`).

**New files (apps/api):**
- `apps/api/migrations/006_plaud_meetings.sql`
- `apps/api/src/utils/crypto.ts`
- `apps/api/src/utils/mcp-untrusted.ts` — `extractUntrustedJson(text)` (§2.1).
- `apps/api/src/services/plaud-client.service.ts` — DCR (`ensureOAuthClient()`,
  idempotent per `redirect_uri`), authorize-URL builder, code exchange,
  refresh, and a thin `callPlaudTool(name, args)` wrapper around the MCP
  `Client`/`StreamableHTTPClientTransport` that attaches the current valid
  bearer token, unwraps the result via `extractUntrustedJson`, and assembles
  full cursor-paginated transcript blocks.
- `apps/api/src/services/plaud-sync.service.ts` — poll loop body, backfill,
  per-recording full scrape (all 4 transcript blocks + notes), idempotent
  upsert by `plaud_file_id`, retry-when-not-yet-processed logic.
- `apps/api/src/utils/ai-model.ts` — exports
  `export const ADVO_AI_MODEL = "claude-opus-5-5";`, the single shared
  model constant for **every** Claude call this feature makes (matching,
  excerpting, and the Ask-chat replies in §6) — one string literal in the
  whole feature, not re-declared per file.
- `apps/api/src/services/plaud-matching.service.ts` — Claude classification
  (is-meeting + primary project + ranked candidates + side projects +
  excerpts) with heuristic fallback; untrusted-data prompt wrapping; imports
  `ADVO_AI_MODEL` from `utils/ai-model.ts` (re-exported as
  `PLAUD_MATCHING_MODEL` for call-site readability, same value, not a
  second literal).
- `apps/api/src/services/plaud-meeting.service.ts` — find-or-create
  `meeting` + `calendar_event` for `(project_id, Manila day)`, attach
  `meeting_recording` rows.
- `apps/api/src/routes/plaud.routes.ts` — all `/api/plaud/*` endpoints
  (§5).
- `apps/api/src/data/plaud-non-meeting-examples.ts` *(optional, Phase 3)* —
  few-shot examples for the classifier (Plaud tutorial recordings, casual
  chats) derived from the 15 real recordings seen in research, with any
  personal content stripped — only titles/patterns, not real transcript text.
- `apps/api/src/services/chat.service.ts` — the chat widget's whole backend
  (§6): `postBotMessage`, `listMessages`, `answerOption`, `sendOwnerText`,
  the Updates-channel state machine (confident FYI, unsure ranked
  candidates, new-project name/client prompts), and the Ask-channel
  AI-reply path (`buildAskContextSnapshot` + one `ADVO_AI_MODEL` call per
  owner message, JSON-only reply, parse/validate/fallback to a plain "Sorry,
  I don't know." on any error — same call/validate/fallback *pattern* as
  `reviewWithClaude`, per §2.4).
- `apps/api/src/routes/chat.routes.ts` — all `/api/chat/*` endpoints (§5).

**Modified files (apps/api):**
- `apps/api/src/db/schema.ts` — add `plaudOauthClient`, `plaudConnection`,
  `plaudRecording`, `meeting`, `meetingRecording`, `chatMessage` tables
  (Drizzle, mirrors §3).
- `apps/api/src/utils/env.ts` — add `PLAUD_MCP_SERVER_URL` (default
  `"https://mcp.plaud.ai/mcp"`), `PLAUD_REDIRECT_URI` (default derived from
  the existing `API_URL` env + `/api/plaud/oauth/callback` — no new required
  var), `PLAUD_TOKEN_ENCRYPTION_KEY`, `PLAUD_SYNC_INTERVAL_MS` (default
  `900000`), `PLAUD_SYNC_ENABLED` (default `"true"`, set `"false"` in
  CI/test env) — all `.optional()`/defaulted, zero impact if unset. **No
  `PLAUD_CLIENT_ID`/`PLAUD_CLIENT_SECRET` env vars** — DCR produces these
  dynamically; they live in `plaud_oauth_client`, not env.
- `apps/api/src/index.ts` — import + mount `plaudRoutes` at `/api/plaud`;
  add a second `setInterval` (after the existing session-cleanup one) that
  calls `runPlaudSyncTick()` guarded by `PLAUD_SYNC_ENABLED` and by "is a
  connection active" — same try/catch + `log.error` pattern as the existing
  interval.
- `docs/SCHEMA.md` — document the 6 new tables + migration `006` log entry.
- `docs/FEATURES.md` / `docs/ROADMAP.md` / `docs/HANDOFF.md` — mark the
  "meetings" calendar layer as shipped, same place the existing Phase 2
  entries live (EXECUTE-time doc update, per repo convention of updating
  these alongside shipped features).

**New files (apps/web):**
- `apps/web/src/hooks/usePlaudIntegration.ts` — connection status
  (`GET /api/plaud/status`), connect/disconnect/sync-now mutations.
  *(unchanged from the prior revision)*
- `apps/web/src/hooks/useMeetings.ts` — per-project meetings list + recording
  detail (no attendees mutation — dropped per the third revision).
- `apps/web/src/components/admin/ProjectMeetingsTab.tsx` — content for the
  new "Meetings" tab inside `ProjectCommandCenter.tsx`: meetings list for
  that project, per-meeting recording(s), transcript/summary/highlights
  viewer, audio player (fetches a fresh presigned URL on open).
- `apps/web/src/hooks/useChat.ts` — `GET /api/chat/messages` per channel
  (polled, see §6), `POST /api/chat/messages` (owner free text), `POST
  /api/chat/messages/:id/answer` (button tap) mutations; tracks each
  channel's `localStorage` "last seen" timestamp for the unread badge.
- `apps/web/src/components/admin/ChatWidget.tsx` — the floating
  bottom-right bubble + unread badge + the open panel: `Tabs` for
  Updates/Ask (shadcn `tabs.tsx`), message list, free-text input. Renders a
  `Sheet` (full-screen) on mobile via `useIsMobile()`, a small fixed panel
  on desktop. Always mounted (§6, §12).
- `apps/web/src/components/admin/ChatMessageBubble.tsx` — renders one
  `chat_message` row: bot vs. owner alignment/styling, the option buttons
  (locked + highlighted once `answered_option_id` is set), or a text input
  prompt when `input_mode='text'`.

**Modified files (apps/web):** *(unchanged from the prior revision)*
- `apps/web/src/components/admin/ProjectCommandCenter.tsx` — add a
  `"meetings"` entry to the tabs array and a `TabsContent value="meetings"`
  rendering `ProjectMeetingsTab`, following the exact pattern of the existing
  `overview`/`deliverables`/`files`/`dev`/`contracts`/`finance` tabs
  (lines ~180–580).
- `apps/web/src/components/admin/AdminSettings.tsx` — extend the existing
  `Panel title="Integrations"` block (currently API + Vercel rows, lines
  ~365–398) with a third row: Plaud connection status (`Connected as
  <email>` / `Not connected`), "Connect Plaud" / "Disconnect" button, "Last
  synced <relative time>", "Sync now" button (admin-only).
- `apps/web/src/pages/Admin.tsx` — render `<ChatWidget />` once, unconditionally,
  alongside the existing layout (outside the `activeSection` if/else chain,
  so it floats over every section, not just one) — no new nav entry, no new
  `AdminSection` value; this is the explicit replacement for the old
  "plaud-review" nav-entry plan.
- `apps/web/src/test/api-wiring.test.ts` — new `describe("Plaud", ...)`
  block (see §11).

**Documentation-only:**
- `docs/SETUP.md` — add the new `PLAUD_*` env vars to the "API
  (`apps/api/.env`)" section. **No developer-portal registration step** (per
  the 18-10-26 revision) — just note that "Connect Plaud" self-registers via
  DCR on first use.

---

## 5. Public contracts — `/api/plaud/*`

All routes mounted as `app.route("/api/plaud", plaudRoutes)` in
`apps/api/src/index.ts`. Response envelope matches repo convention:
`{ data, error }`. **Route shapes are unchanged from the prior revision** —
only the internal implementation behind `oauth/start`/`oauth/callback`
changes (§7).

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/plaud/status` | `requireAdmin` | `{connected, plaudEmail, lastSyncedAt, lastSyncError}` — `reviewQueueCount` dropped (the chat widget's own unread badge replaces it) |
| `GET /api/plaud/oauth/start` | `requireAdmin` | Ensures DCR has run for this environment's `redirect_uri` (registers once if not), returns `{authorizeUrl}` |
| `GET /api/plaud/oauth/callback` | **public** (Plaud redirects the admin's browser here directly; verified by the signed `state`, not a session cookie) | Exchanges `code` via `exchangeAuthorization`, stores the new `plaud_connection` row (deactivating the previous one), redirects the browser to `${FRONTEND_URL}/admin?section=settings&plaud=connected` (or `...&plaud=error` on failure) |
| `POST /api/plaud/disconnect` | `requireAdmin` | Marks the active `plaud_connection` row inactive (does not delete history; does not delete the `plaud_oauth_client` registration) |
| `POST /api/plaud/sync-now` | `requireAdmin` | Runs one sync tick synchronously, returns `{scanned, newRecordings, matched, review, ignored}` |
| `GET /api/plaud/recordings/:id` | `requireAdmin` | Full recording detail: metadata, transcript blocks, notes, highlights (no audio URL — see next route) |
| `GET /api/plaud/recordings/:id/audio` | `requireAdmin` | Fetches a **fresh** presigned URL via `get_file` if the stored one is stale/missing, returns `{url, expiresAt}` — never serves a cached URL older than a few minutes |
| `GET /api/plaud/meetings?projectId=` | `requireAdmin` | Meetings for a project, each with its linked recordings (primary + side, with side excerpts) |
| `GET /api/chat/messages?channel=updates\|ask&after=` | `requireAdmin` | List of `chat_message` rows for that channel, newest-last, optionally only those after a given `chat_message_id`/timestamp — also used as the poll endpoint (§6) |
| `POST /api/chat/messages` | `requireAdmin` | Body `{channel, body}` — owner sends free text (new-project name, an Ask-channel question, or an untracked note); server decides what happens next per §6's state machine |
| `POST /api/chat/messages/:id/answer` | `requireAdmin` | Body `{optionId}` — owner taps a button; rejected (409) if that message is already answered; server advances the relevant state machine per §6 |

Dropped from the prior revision: `GET /api/plaud/review`,
`POST /api/plaud/review/:id/confirm`, `POST /api/plaud/review/:id/ignore`,
`PATCH /api/plaud/meetings/:id/attendees` — all replaced by the three
`/api/chat/*` routes above (§6).

**Auth note (decision #1, §10.1):** every route above is `requireAdmin`
(not `requireTeam` as the prior revision had some of these). This plan
defaults the whole chat widget — and, for consistency, every other
Plaud-admin action — to the single ADVO owner (`admin` role), matching the
user's own "the bot messages the owner" framing; there is no dedicated
"owner" role in `userRoleEnum` (§2.4). Flagged for the user to confirm or
widen to `requireTeam` at plan review.

`looseUrl`/`flexibleDateTime` are used wherever an admin-editable date/URL
field is accepted (none of the above take raw URL/datetime input directly
from a form today — no new strict-zod `.url()`/`.datetime()` footguns
introduced).

---

## 6. Chat design — conversation model, option buttons, copy rules

### 6.1 Widget shell

- Floating bubble, bottom-right, on every admin page (mounted once in
  `Admin.tsx`, outside the `activeSection` branches — §4). Unread-count
  `Badge` on the bubble (sum of both channels' unread).
- Tap opens the panel: two tabs at the top, **Updates** and **Ask**
  (shadcn `tabs.tsx`), each with its own unread `Badge`.
- Mobile (`useIsMobile()`, existing `MOBILE_BREAKPOINT`): opens as a
  full-screen `Sheet` (`side="bottom"`, ~95% height) — big tap targets,
  one input row pinned to the bottom above the keyboard.
- Desktop: a small fixed panel (~360×520px) anchored bottom-right, same
  internal layout as the mobile sheet.
- Polling: `useChat.ts` runs `useQuery` with `refetchInterval: 20_000` for
  the currently-open channel, `60_000` for the other channel (cheap
  background check), against `GET /api/chat/messages?channel=&after=`.
  Unread = bot messages with `created_at` after that channel's
  `localStorage` "last seen" timestamp; opening a tab sets that channel's
  "last seen" to now and clears its badge.

### 6.2 Generic message shape (drives every flow below)

Every `chat_message` row (§3.6) renders as one of three bubble types in
`ChatMessageBubble.tsx`:

1. **Plain text** (`input_mode='none'`) — just the `body`, no action.
2. **Button question** (`input_mode='buttons'`) — `body` + a row of
   `options` buttons. Covers A/B/C/D, Yes/No, OK/Change, Confirm/Cancel —
   all the same `{id, label, style?}` shape, just different `options`
   arrays. Once `answered_option_id` is set (via
   `POST /api/chat/messages/:id/answer`), the buttons render locked, with
   the picked one highlighted and the rest dimmed — never tappable again.
3. **Text prompt** (`input_mode='text'`) — `body` (e.g. "Name?") + the
   widget's normal text input is the reply; no buttons. The owner's next
   `POST /api/chat/messages` on that channel is treated as the answer to
   this prompt (§6.3) rather than a disconnected note.

### 6.3 Updates channel — new-recording flow

Posted by `plaud-matching.service.ts` right after classification (§8
Phase 3), via `chat.service.ts`'s `postBotMessage`:

- **Not a meeting** (`isMeeting=false`) → no chat message. Zero noise.
- **Confident match** (`primaryConfidence >= AUTO_MATCH_CONFIDENCE`) →
  `input_mode='buttons'`, `body="New meeting added to <Project>."`,
  `options=[{id:'ok',label:'OK'},{id:'change',label:'Change'}]`,
  `context={type:'confident_fyi', recordingId, projectId}`.
  - Tap **OK** → no-op, just locks the buttons.
  - Tap **Change** → `chat.service.ts` posts the next message using the
    exact same ranked-candidates flow as an unsure match below (reuses one
    function, one code path for both entry points).
- **Unsure match** (`primaryConfidence < AUTO_MATCH_CONFIDENCE`) →
  `input_mode='buttons'`, `body="New meeting: <short title>. Which project?"`
  (`<short title>` = `plaud_recording.name`, truncated to ~40 chars),
  `options` = the matcher's top 2–3 `rankedCandidates` (label = each
  project's `title`, truncated to ~24 chars) **+** `{id:'new_project',
  label:'New project'}` **+** `{id:'skip', label:"Don't add"}`,
  `context={type:'meeting_match', recordingId, candidateProjectIds:[...]}`.
  - Tap a **project candidate** → `plaud-meeting.service.ts`'s
    `attachRecordingToProject(recordingId, projectId, 'primary')` (same
    function Phase 4 already defined for the auto-match path) + each
    `sideProjects` entry above `SIDE_PROJECT_CONFIDENCE`; then
    `postBotMessage` confirms: `body="Added to <Project>."`
    (`input_mode='none'`).
  - Tap **"New project"** → `postBotMessage(body="Name?",
    input_mode='text', context={type:'new_project_name', recordingId})`.
  - Tap **"Don't add"** → `plaud_recording.match_status='ignored_manual'`;
    `postBotMessage(body="OK, skipped.")`.

### 6.4 Updates channel — "New project" text/client flow

Triggered when the owner's next `POST /api/chat/messages` on `updates`
lands while the most recent bot message has `input_mode='text'` and no
reply yet (`chat.service.ts` always looks at exactly that one message —
never a general-purpose free-text parser):

1. `context.type === 'new_project_name'`: the owner's text is the new
   project's `title`.
   - If the org has exactly one `client` row → auto-assign it, skip
     straight to step 2's creation.
   - If more than one `client` exists → post
     `body="Which client?"`, `input_mode='buttons'`,
     `options` = one button per `client.companyName` (short names, no
     truncation expected — company names are already short),
     `context={type:'new_project_client', recordingId, projectName:<typed text>}`.
     This is the **one extra button question** the user's own instruction
     allows for a required field (`project.clientId` is `NOT NULL`, §2.4)
     — never a form.
2. `context.type === 'new_project_client'` (button tap): create
   `project{clientId: <tapped>, title: <projectName from step 1>}` with
   every other column left at its schema default (no form, no extra
   questions — `description`/`repositoryName`/etc. are all nullable or
   defaulted per `apps/api/src/db/schema.ts`); call
   `attachRecordingToProject(recordingId, newProjectId, 'primary')`; post
   `body="Done. Added to <Name>."` (`input_mode='none'`).

### 6.5 Ask channel — general Q&A

- Owner types a question → `POST /api/chat/messages {channel:'ask', body}`.
- `chat.service.ts`'s `buildAskContextSnapshot()` queries a small,
  read-only snapshot (capped ~50 rows each): open projects
  (`title`, `projectStatus`, `clientCompanyName`), recent `meeting` rows
  (project, date, recording count), upcoming `calendar_event` rows. **No
  transcripts are included** — keeps the prompt small and the AI's answers
  scoped to "what/when", not "what exactly was said."
- One `ADVO_AI_MODEL` (`claude-opus-5-5`) call per owner message: system
  prompt forces short, plain, common-word answers (≤ ~2 sentences) and
  **strict JSON**: `{reply: string, options?: Array<{id,label}>}`. Parse,
  validate; on any error/malformed output, fall back to a plain
  `"Sorry, I don't know."` bot message rather than erroring the request
  (same call/validate/fallback *pattern* as `reviewWithClaude`, §2.4).
- If the AI's JSON includes `options` (it needs the owner to pick
  something to proceed), `chat.service.ts` posts a `input_mode='buttons'`
  bot message with `context={type:'ask_followup'}`. Tapping one of those
  buttons simply resubmits that option's `label` text as the owner's next
  `POST /api/chat/messages` turn — the AI sees it as ordinary conversation
  text, no special server-side branching needed for this channel.
- This is a **single-call-per-turn, context-snapshot** design, not a
  multi-step agentic tool-calling loop (decision #2, §10.1) — the data
  volume (a handful of projects, ~15 recordings/day) does not justify the
  extra complexity of a tool-use harness, and a stuffed-context prompt
  answers "what/when" questions just as well at this scale.

### 6.6 Copy rules

Every bot `body` string in this feature follows these rules — common
words only, concise, ≤ ~8 words per line wherever possible:

- `"New meeting added to <Project>."`
- `"New meeting: <short title>. Which project?"`
- `"Added to <Project>."`
- `"Name?"`
- `"Which client?"`
- `"Done. Added to <Name>."`
- `"OK, skipped."`
- `"Sorry, I don't know."`
- Button labels: `"OK"`, `"Change"`, `"New project"`, `"Don't add"`, plus
  each project's/client's own short name verbatim (not rephrased).

---

## 7. OAuth connect flow — exact mechanics (MCP DCR + PKCE)

### 7.1 `GET /api/plaud/oauth/start`

1. `discoverOAuthServerInfo(PLAUD_MCP_SERVER_URL)` →
   `{authorizationServerUrl: "https://mcp.plaud.ai/", authorizationServerMetadata, resourceMetadata}`
   (per §2.1's curl-verified `.well-known` responses; this call performs both
   the RFC 9728 protected-resource lookup and the RFC 8414 authorization-server
   metadata lookup in one step).
2. `ensureOAuthClient(redirectUri)`: look up `plaud_oauth_client` by
   `redirect_uri = PLAUD_REDIRECT_URI`; if absent, call
   `registerClient(authorizationServerUrl, {metadata: authorizationServerMetadata, clientMetadata: {client_name: "ADVO", redirect_uris: [PLAUD_REDIRECT_URI], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none"}})`
   → persist the returned `OAuthClientInformationFull` (encrypting
   `client_secret` if one is present, though `"none"` auth is expected per
   §2.1) into a new `plaud_oauth_client` row. This DCR call happens **at most
   once per distinct `redirect_uri`** (i.e. once ever for prod, once for
   local dev), not on every connect.
3. `startAuthorization(authorizationServerUrl, {metadata, clientInformation, redirectUrl: PLAUD_REDIRECT_URI, state: <signed JWT>, resource: resourceMetadata?.resource})`
   → `{authorizationUrl, codeVerifier}`.
4. Build `state` the same way the prior revision did: a signed, short-lived
   JWT (reuse `JWT_SECRET`, 10-minute expiry) containing `{codeVerifier}` —
   this embeds the PKCE verifier directly in the OAuth `state` param instead
   of a server-side session table, surviving a server restart mid-flow with
   no new table.
5. Return `{authorizeUrl: authorizationUrl.toString()}`.
6. Frontend does a **full browser redirect** (`window.location.href = authorizeUrl`)
   — this must happen in the admin's real browser since it is their Plaud
   login, not an API-to-API call.

### 7.2 `GET /api/plaud/oauth/callback?code=&state=`

1. Verify+decode the `state` JWT (reject if expired/invalid — redirect to
   `...&plaud=error`), recovering `codeVerifier`.
2. Re-resolve `authorizationServerUrl`/`metadata` (cheap — the same
   `discoverOAuthServerInfo` call as step 1 of §7.1; no caching needed given
   call volume) and load the active `plaud_oauth_client` row for
   `clientInformation`.
3. `exchangeAuthorization(authorizationServerUrl, {metadata, clientInformation, authorizationCode: code, codeVerifier, redirectUri: PLAUD_REDIRECT_URI, resource})`
   → `OAuthTokens` (`access_token`, `refresh_token`, `expires_in`, `token_type`).
4. On success: `UPDATE plaud_connection SET is_active=false WHERE is_active=true`,
   then `INSERT` the new row with encrypted tokens + `plaud_oauth_client_id`.
   `connected_by`: this route has no session cookie since Plaud's redirect is
   a plain browser GET with no ADVO auth header — nullable, left `null`
   unless Phase 4 EXECUTE confirms the ADVO auth cookie's `SameSite` setting
   permits a soft read on top-level GET navigation (same open mechanical
   detail as the prior revision; not user-facing either way, since
   `plaud_email` from `get_current_user` is what the UI actually displays).
5. Best-effort `get_current_user` call to populate `plaud_user_id`/`plaud_email`.
6. Redirect to `${FRONTEND_URL}/admin?section=settings&plaud=connected`.

### 7.3 Refresh

Before any tool call, `plaud-client.service.ts` checks `expires_at` on the
active `plaud_connection` row; if within 60s of expiry, calls
`refreshAuthorization(authorizationServerUrl, {metadata, clientInformation, refreshToken, resource})`
(the SDK's own refresh helper, which preserves the original refresh token if
the server doesn't rotate it — mirrors the rotation-tolerant behavior
observed in the local MCP CLI's own `OAuth.refresh()`), updates the row
(encrypted) in the same transaction as the read, and proceeds. A rejected
refresh (401/403) sets `last_sync_error` and flips
`plaud_connection.is_active=false`, surfaced in `GET /api/plaud/status` as
`connected:false` so the Settings UI prompts a reconnect — never a silent
infinite-retry loop.

### 7.4 Routine tool calls

`callPlaudTool(name, args)` in `plaud-client.service.ts`: ensures a fresh
access token (§7.3), constructs (or reuses a cached, process-lifetime)
`StreamableHTTPClientTransport(new URL(PLAUD_MCP_SERVER_URL), {requestInit: {headers: {Authorization: \`Bearer ${accessToken}\`}}})`
+ `Client`, calls `client.callTool({name, arguments: args})`, extracts the
first text content block, unwraps it via `extractUntrustedJson` (§2.1), and
returns the parsed JSON (or the raw "not available"/"not yet signed"-style
plain-text message when the tool returns one instead of JSON — callers
handle both).

---

## 8. Phasing (each phase independently verifiable; EXECUTE works through them in order)

### Phase 0 — ⏳ Validate the remote-MCP + DCR path (spike, ~30–45 min, de-risks everything else)

1. From a throwaway local script (not committed): call
   `discoverOAuthServerInfo("https://mcp.plaud.ai/mcp")`, then
   `registerClient(...)` against `https://mcp.plaud.ai/register` with a
   `http://localhost:<port>/callback` redirect URI, confirm a `client_id`
   comes back with no error and no credentials were required.
2. `startAuthorization(...)`, open the resulting URL in a real browser, log
   in with the user's real Plaud account, capture the `code` from the local
   callback, `exchangeAuthorization(...)` → confirm real tokens come back.
3. Call `list_files({page: 1, page_size: 10})` as an authenticated MCP tool
   call against `https://mcp.plaud.ai/mcp`, confirm a real result wrapped in
   the expected untrusted-data tag, `extractUntrustedJson` parses it, and the
   15 real recordings (or a subset) are visible.
4. Record the result in this plan's "What's functional now" note. If this
   spike fails for any structural reason (not just a transient error), fall
   back to §2.2's documented REST path instead — this is the only
   circumstance under which this plan's auth approach reverts.

**What's functional after Phase 0:** nothing user-facing; the remote-MCP+DCR
auth approach is confirmed against the real account (or the fallback is
triggered, per §2.2).

### Phase 1 — ⏳ Data model + encryption util

1. Write `apps/api/migrations/006_plaud_meetings.sql` (6 tables, including
   `chat_message`, per §3, `BEGIN`/`COMMIT`, `COMMENT ON TABLE` for every
   app-validated varchar set, indexes per §3).
2. Apply locally (`psql` against local DB per `docs/SETUP.md`).
3. Mirror into `apps/api/src/db/schema.ts` (Drizzle), confirm
   `drizzle-kit` introspection/`db:generate` produces no diff against the
   hand-written migration.
4. Add `apps/api/src/utils/crypto.ts` (AES-256-GCM `encryptSecret`/
   `decryptSecret`), add `PLAUD_TOKEN_ENCRYPTION_KEY` to `utils/env.ts`
   (optional at schema level).
5. Add `@modelcontextprotocol/sdk` to `apps/api/package.json`.
6. Update `docs/SCHEMA.md` with the 6 new tables + a `006` migration-log row.

**Verification:** `npm run build` (apps/api) typechecks 0 errors; migration
applies cleanly to a scratch local DB; a throwaway script round-trips
`encryptSecret`/`decryptSecret`.

**What's functional after Phase 1:** nothing user-facing; schema + dependency
exist.

### Phase 2 — ⏳ Plaud MCP client + sync service (no UI yet)

1. `plaud-client.service.ts`: `ensureOAuthClient`, authorize-URL builder,
   `exchangeCode`, `refreshIfNeeded`, `callPlaudTool` (§7.4), plus typed
   helpers `listFiles`, `getFile`, `getFullTranscript` (loops all 4 blocks +
   cursor pagination per §2.1), `getNotes`, `getCurrentUser` — all built on
   `callPlaudTool`, all token reads go through `decryptSecret`.
2. `apps/api/src/utils/mcp-untrusted.ts`: `extractUntrustedJson`.
3. `plaud-sync.service.ts`:
   - `runPlaudSyncTick()`: no active connection → no-op; else `listFiles`
     filtered to recordings newer than `last_synced_at` (minus a small
     overlap window, e.g. 1h, to tolerate clock skew/late-arriving
     recordings), upsert by `plaud_file_id`, full-scrape any
     `pending`/`retry_pending_transcript` row via `getFullTranscript` +
     `getNotes` + `getFile` (for `presigned_url`/metadata), set
     `sync_status='ready'` once transcript+notes are present, or
     `retry_pending_transcript` if Plaud hasn't finished processing yet
     (every block reports "not available" with no content at all — mirrors
     the MCP's own "audio not ready yet, retry" note), update
     `plaud_connection.last_synced_at`/`last_sync_error`.
   - `runPlaudBackfill()`: same logic but paginates `listFiles` from the
     beginning with no date filter, for first-connect backfill of all
     existing recordings (triggered once automatically right after a
     successful OAuth connect, and re-runnable via "Sync now").
4. Wire `apps/api/src/index.ts`: mount nothing yet (routes come in Phase 4);
   add the `setInterval` calling `runPlaudSyncTick()` guarded by
   `PLAUD_SYNC_ENABLED` (default `false` in `NODE_ENV=test`).

**Verification:** a throwaway local script (not committed) calls
`runPlaudBackfill()` against the real connected account from Phase 0 and
confirms all 15 real recordings land in `plaud_recording` with populated
transcript/notes JSON and correct `sync_status='ready'`.

**What's functional after Phase 2:** recordings sync into the DB via the
real remote MCP; still zero admin-visible surface.

### Phase 3 — ⏳ Matching service (AI classification + excerpting)

1. `apps/api/src/utils/ai-model.ts`: `export const ADVO_AI_MODEL = "claude-opus-5-5";`.
2. `plaud-matching.service.ts`:
   - `export const PLAUD_MATCHING_MODEL = ADVO_AI_MODEL;` — re-exported
     alias, not a second literal; used for this file's two Claude calls
     (classification and, where applicable, side-project excerpt
     extraction).
   - `classifyRecording(recording, projects)`: builds an untrusted-data-wrapped
     prompt (recording name + full `transaction` transcript, truncated to a
     safe token budget, + AI summary note) against the list of
     `{projectId, title, description, repositoryName, techStack, clientCompanyName}`
     for all non-archived projects. Calls Claude with `model: PLAUD_MATCHING_MODEL`
     (same call/validate/fallback shape as `reviewWithClaude` in
     `contract-review.service.ts`, different model), expects strict JSON:
     `{isMeeting, primaryProjectId, primaryConfidence, rankedCandidates:[{projectId, confidence}], sideProjects:[{projectId, confidence, excerpt, summary}], reasoning}`.
     `rankedCandidates` is every scored project, confidence descending,
     top 3 kept — this is new in the third revision, feeding the chat
     widget's unsure-match buttons (§6.3). Validates shape; on any
     error/malformed output, falls through to the heuristic.
   - Heuristic fallback: case-insensitive substring match of each project's
     `title`/`repositoryName` against the recording `name`, then against the
     transcript text; a hit on `name` → `confidence=0.9` (auto-match
     threshold passes); a hit only in transcript → `confidence=0.65` (lands
     in review); no hit anywhere → stays `unprocessed`/goes to review rather
     than being auto-ignored (the heuristic cannot reliably detect
     non-meetings — documented limitation, see §10.2). `rankedCandidates` in
     the heuristic path = every project sorted by substring-hit strength,
     top 3.
   - Thresholds: `AUTO_MATCH_CONFIDENCE = 0.82`, `SIDE_PROJECT_CONFIDENCE = 0.6`
     — both named constants at the top of the file, not magic numbers.
   - Verdict mapping: `isMeeting=false` → `match_status='ignored_non_meeting'`,
     **no chat message posted** (§6.3). `isMeeting=true` and
     `primaryConfidence >= AUTO_MATCH_CONFIDENCE` → `match_status='matched'`
     (auto-link path, §9) + `chat.service.postBotMessage` posts the
     confident-FYI message (§6.3). Otherwise → `match_status='review'` +
     `postBotMessage` posts the ranked-candidates question (§6.3).
3. Wire into `plaud-sync.service.ts`: any `plaud_recording` reaching
   `sync_status='ready'` with `match_status='unprocessed'` is classified
   immediately in the same tick, and the resulting chat message (if any) is
   posted in that same tick — never a separate delayed job.
4. (Optional) seed `apps/api/src/data/plaud-non-meeting-examples.ts` with a
   few sanitized title patterns (`"Welcome to Plaud.ai"`, `"How to use
   Plaud"`, generic lecture/chat titles) as a few-shot hint in the prompt —
   improves non-meeting recall day one without waiting on real production
   misses.

**Verification:** run classification over the user's real 15 recordings
(already scraped by Phase 2's verification run); manually confirm: both
Tagalog "Pagpupulong"/"Pulong" meeting recordings classify `isMeeting=true`
with a correct primary project; "Welcome to Plaud.ai"/"How to use Plaud"/the
casual music chat classify `isMeeting=false`; the untitled 17-second clips
land in `review` or `ignored_non_meeting` (not falsely auto-matched to a
project on no real content).

**What's functional after Phase 3:** recordings auto-classify; still no
admin UI to see any of it (classification results sit in the DB; this phase
focuses purely on classification quality).

### Phase 4 — ⏳ Meeting creation + calendar linkage + API routes

1. `plaud-meeting.service.ts`:
   - `manilaDayOf(date): string` (`YYYY-MM-DD` in `Asia/Manila`).
   - `attachRecordingToProject(recordingId, projectId, role)`:
     find-or-create `meeting` for `(projectId, manilaDayOf(recording.recordingStartedAt))`;
     on create, also create a `calendar_event` (`category='meeting'`,
     `projectId`, `title`, `startsAt`=recording start, `endsAt`=start+duration)
     and set `meeting.calendarEventId`; on existing meeting, extend
     `calendar_event.endsAt` if the new recording's end is later; insert the
     `meeting_recording` row (`role`, and for `role='side'` the AI-provided
     `excerpt`/`summary` from Phase 3's `sideProjects` output — **never**
     touching the primary recording's stored transcript).
   - Called from `plaud-sync.service.ts` for every `match_status='matched'`
     recording (primary + each `sideProjects` entry above threshold) right
     after classification, and from `chat.service.ts`'s button-tap handler
     for the chat-confirmed-unsure path (§6.3/§6.4) — same function, one
     code path for both "sure" and "confirmed-via-chat" matches.
2. `apps/api/src/routes/plaud.routes.ts` — implement every route in §5.
3. Mount in `apps/api/src/index.ts`.

**Verification:** `apps/web/src/test/api-wiring.test.ts` new `describe("Plaud", ...)`
block (§11) passes against a local API with a seeded `plaud_connection` + a
couple of hand-inserted `plaud_recording` rows (no live Plaud network calls
in CI — see test matrix). Manually, running the real backfill end-to-end
produces correct `meeting`/`calendar_event`/`meeting_recording` rows for the
two real "Pulong"/"Pagpupulong" days, visible via `GET /api/calendar`
(existing endpoint, zero changes needed — it already reads `calendar_event`
generically).

**What's functional after Phase 4:** the whole pipeline works end-to-end via
API calls; `GET /api/calendar` already shows the new meetings; no admin UI
yet beyond raw API testing (e.g. via `curl`/Postman).

### Phase 5 — ⏳ Admin UI: Settings → Integrations connect flow

1. `AdminSettings.tsx`: add the Plaud row to the existing `Panel title="Integrations"`
   block; `usePlaudIntegration.ts` hook; "Connect Plaud" button → calls
   `GET /api/plaud/oauth/start` → `window.location.href = authorizeUrl`;
   handle the `?plaud=connected|error` query param on mount (toast + clean up
   the URL); "Disconnect"/"Sync now" buttons.
2. No developer-portal prerequisite to resolve here (unlike the prior
   revision) — the connect button's first click triggers DCR automatically
   via `GET /api/plaud/oauth/start` (§7.1 step 2).

**Verification:** manual click-through of the real connect flow with the
user's real Plaud login; confirm `plaud_connection` row populated,
`GET /api/plaud/status` returns `connected:true` with the right email.
Screenshot of the Settings Integrations panel showing "Connected as
<email>".

**What's functional after Phase 5:** a human can connect/disconnect/trigger
sync from the UI; sync runs for real every 15 minutes in dev if left running.

### Phase 6 — ⏳ Admin UI: Chat widget shell + Updates flow

1. `apps/api/src/services/chat.service.ts` + `apps/api/src/routes/chat.routes.ts`
   — implement `postBotMessage`, `listMessages`, `answerOption`,
   `sendOwnerText`, and the whole Updates-channel state machine (§6.3,
   §6.4): confident-FYI OK/Change, unsure ranked-candidates buttons,
   new-project name prompt → client-pick (or auto-pick, single-client case)
   → project creation → confirmation. Mount `chatRoutes` at `/api/chat` in
   `apps/api/src/index.ts`.
2. Wire `plaud-matching.service.ts`'s verdict mapping (§8 Phase 3) to call
   `postBotMessage` for the confident and unsure cases; confirm the
   not-a-meeting case posts nothing.
3. `apps/web/src/hooks/useChat.ts` + `apps/web/src/components/admin/ChatWidget.tsx`
   + `ChatMessageBubble.tsx` (§6.1, §6.2): floating bubble + unread badge,
   Updates/Ask tabs, polling, mobile `Sheet` / desktop panel, button-question
   rendering + lock-after-answer, text-prompt input mode. Mount
   `<ChatWidget />` once in `apps/web/src/pages/Admin.tsx` per §4.
4. Build only the **Updates** tab's real behavior in this phase; the **Ask**
   tab exists in the shell (tab switches, empty state) but its AI reply path
   is Phase 7.

**Verification:** manual walkthrough against the real backfilled recordings
from Phase 2/3 — trigger (or force, via a lowered threshold test row) one
confident match and confirm the OK/Change FYI message renders and locks on
tap; trigger one unsure match and walk the full "New project" path end to
end (name prompt → client buttons or auto-pick → "Done. Added to \<Name\>.")
against a real recording; confirm a tapped project-candidate button attaches
the meeting correctly (`GET /api/plaud/meetings?projectId=` shows it).
Screenshots required at **1440px** (desktop panel) and **390px** (mobile
full-screen sheet) width, each showing: the bubble with unread badge, the
Updates tab with an unanswered button-question, and the same question after
answering (locked state). Use the `vc-frontend-design` skill during EXECUTE
for the widget's visual polish/mobile pass; verify both widths with the
`ui`/`ux` review passes before marking this phase ✅.

**What's functional after Phase 6:** every unsure match, confident-match
FYI, and new-project creation is resolved entirely from the chat widget —
no admin page beyond Settings exists or is needed for this.

### Phase 7 — ⏳ Admin UI: Ask chat (general Q&A)

1. `chat.service.ts`: `buildAskContextSnapshot()` (read-only query across
   `project`/`client`/`meeting`/`calendar_event`, capped rows per §6.5);
   `askAssistant(ownerMessage)` — one `ADVO_AI_MODEL` call per owner
   message with the snapshot + a short-plain-answer system prompt, strict
   JSON `{reply, options?}`, parse/validate/fallback to
   `"Sorry, I don't know."` on any error (§6.5).
2. Wire `POST /api/chat/messages {channel:'ask', ...}` in `chat.routes.ts`
   to call `askAssistant` synchronously and insert both the owner's message
   and the bot's reply before responding.
3. `ChatWidget.tsx`: the Ask tab now sends real messages and renders real
   AI replies, including `ask_followup` button questions (§6.5) — tapping
   one resubmits its label as the next owner turn.

**Verification:** manual walkthrough — ask a real question the snapshot can
answer ("How many active projects?", "Any meetings this week?") and confirm
a correct, short, plain-English reply; ask something outside the snapshot's
scope (e.g. "What did we discuss in yesterday's call?") and confirm the
graceful `"Sorry, I don't know."` fallback rather than a hallucinated
answer (transcripts are intentionally excluded from the snapshot, §6.5).
Screenshot of the Ask tab showing one real question/answer exchange, at
1440px and 390px.

**What's functional after Phase 7:** the owner can ask plain questions
about ADVO data from the same widget, any time, without opening a project
page.

### Phase 8 — ⏳ Admin UI: Project Meetings tab

1. `ProjectMeetingsTab.tsx` + `useMeetings.ts`; wire into
   `ProjectCommandCenter.tsx`'s tabs array.
2. Per-meeting: date, list of linked recordings (primary badge vs.
   side badge), transcript viewer (reuse the already-stored
   `transcript_transaction`/`transcript_polish` JSON, no need to re-call
   Plaud), AI summary + highlights display, audio player (calls
   `GET /api/plaud/recordings/:id/audio` on open/play, never embeds a stale
   URL). No attendees UI — dropped per the third revision (§3.4).

**Verification:** manual walkthrough on a real project that has a real
matched meeting from the backfill; play the audio (confirms a fresh
presigned URL round-trip); confirm side-project excerpts render on the
*other* project's Meetings tab without touching the primary's full
transcript. Screenshot of the tab showing a real meeting with transcript +
summary + audio player.

**What's functional after Phase 8:** the feature is complete end-to-end —
automatic detection, matching, chat-based resolution, meeting+calendar
creation, general Q&A, full data browsing — matching every item in the
user's request.

### Phase 9 — ⏳ Docs + deploy

1. Update `docs/SCHEMA.md` (already partly done in Phase 1 — finalize),
   `docs/FEATURES.md`, `docs/ROADMAP.md`, `docs/HANDOFF.md` (mark "meetings"
   calendar layer shipped, same section the Phase 2 calendar entries live
   in), `docs/SETUP.md` (new env vars).
2. Deploy: apply `006_plaud_meetings.sql` to prod as the app DB user; set the
   new `PLAUD_*` env vars on the VPS; `pm2 restart advo-api`; rsync the web
   build (watch for the known `chown /var/www/advo/dist` to `advo-deploy`
   issue if GitHub Actions rsync 403s per repo memory); run the real
   (DCR-based, self-service) OAuth connect flow against prod once.

**Verification:** `GET https://api.advo.ph/api/plaud/status` returns
`connected:false` immediately post-deploy (expected, pre-connect); after the
one-time prod connect, returns `connected:true`; prod `pm2 logs advo-api`
shows a clean sync tick within 15 minutes with no errors.

**What's functional after Phase 9:** live in production, syncing the user's
real Plaud account every 15 minutes, with the chat widget as the owner's
only interaction surface for it.

---

## 9. Matching → meeting-creation data flow (summary)

```
Plaud recording (new or updated, via mcp.plaud.ai/mcp tool calls)
  └─ plaud-sync: upsert plaud_recording, assemble all transcript/note blocks, sync_status='ready'
       └─ plaud-matching: classify (claude-opus-5-5) → is_meeting?, primary project + confidence,
                            ranked candidates, side projects + excerpts
            ├─ not a meeting            → match_status='ignored_non_meeting'   (stop, no chat message)
            ├─ confidence >= 0.82       → match_status='matched'
            │    ├─ plaud-meeting.attachRecordingToProject(primary, role='primary')
            │    │    └─ find-or-create meeting(project, Manila day) + calendar_event
            │    ├─ for each side project >= 0.6 confidence:
            │    │    attachRecordingToProject(side, role='side', excerpt=AI-extracted subset)
            │    └─ chat.postBotMessage: Updates tab, confident-FYI OK/Change buttons (§6.3)
            └─ confidence <  0.82       → match_status='review'
                 └─ chat.postBotMessage: Updates tab, ranked-candidate buttons +
                      "New project" + "Don't add" (§6.3) — owner's tap answer calls the
                      same attachRecordingToProject path as the 'matched' branch, or
                      creates a project first (§6.4), or sets `ignored_manual`
```

Failure modes & handling:
- **Transcript not ready yet** (every block returns "not available", no
  content at all) → `sync_status='retry_pending_transcript'`, re-attempted
  next 15-minute tick, no partial/garbage classification run against it.
- **Classification JSON malformed/Claude error** → heuristic fallback (§8
  Phase 3); never leaves a recording stuck at `unprocessed` silently — logs
  `log.error` with the recording id.
- **Refresh token rejected** → `plaud_connection.is_active=false`,
  `last_sync_error` set, `GET /api/plaud/status` surfaces it, sync tick
  no-ops until reconnected (no infinite retry storm).
- **Plaud MCP rate limit / transient 5xx** → tick catches, logs, retries next
  interval (15 min is generous for ~15 recordings/day of real volume).
- **Audio presigned URL expired** → never read stale from storage; always
  re-fetched by `GET /api/plaud/recordings/:id/audio` at view/play time.

---

## 10. Risks & open questions

### 10.1 Open questions requiring the user

**No hard blockers.** The prior revision's open question (a Plaud
developer-portal signup) is removed: DCR against
`https://mcp.plaud.ai/register` is self-service and needs no portal account
or form. The only thing the user needs to do — unchanged from decision #1
at the top of this plan — is log into their own real Plaud account once,
in a browser, during Phase 0's spike and again (or the same session) during
Phase 5's UI connect flow. This was always expected; it is not a new ask.

**Two defaults applied by this revision, for the user to confirm or
override at plan review (not blockers — EXECUTE proceeds with the stated
pick if neither is overridden):**

1. **Chat widget + every Plaud-admin route scoped to `requireAdmin`-only**
   (§5), not `requireTeam`. There is no dedicated "owner" role in
   `userRoleEnum` (§2.4); `requireAdmin` matches the user's "the bot
   messages the owner" framing most literally — only the `admin`-role user(s)
   see or use the widget. **Recommended pick: keep `requireAdmin`.** The
   alternative is widening every route in §5 to `requireTeam` so any
   `team`-role user can also see/answer Updates prompts and use Ask.
2. **"Ask" tab AI answers use a single-call, stuffed-context-snapshot
   design** (§6.5) — one `ADVO_AI_MODEL` call per owner message, fed a
   capped read-only snapshot of projects/meetings/calendar, no
   tool-calling loop and no transcript access. **Recommended pick: keep
   this simple design** — call volume and data size are small enough that
   it answers "what/when" questions well, and it is far cheaper to build
   and reason about than an agentic tool-use harness. The alternative is a
   full tool-calling loop (Claude issues read-only DB-query tool calls
   itself) which would let it answer deeper questions (e.g. transcript
   content) at the cost of materially more implementation complexity for
   this phase.

The only remaining soft, non-blocking uncertainty is whether Phase 0's
spike confirms the remote MCP path end-to-end without surprises (rate
limits, missing tool behavior under server-to-server use, etc.). If it does
not, §2.2's documented REST fallback becomes the plan of record for auth
instead — a plan update at that point, not a question for the user now.

### 10.2 Risks (mitigated in-plan, no user decision needed)

| Risk | Mitigation |
|---|---|
| Heuristic (no `ANTHROPIC_API_KEY`) can't reliably spot non-meetings | Documented limitation (§8 Phase 3); `ANTHROPIC_API_KEY` is already configured in this prod environment for contract review/brand analysis, so this is a cold-start/local-dev-only concern, not a prod risk |
| Transcript/notes contain prompt-injection-shaped text (anyone in a recorded room can say anything) | Every AI call wraps recording payloads in the same untrusted-data delimiter pattern the real Plaud MCP uses (§2.1); strict JSON-shape validation before trusting any field |
| Side-project excerpting accidentally mutates the primary transcript | Schema-enforced: `excerpt_transcript`/`excerpt_summary` only exist on `meeting_recording` (role='side'); the primary's transcript lives solely on `plaud_recording`, read-only after Phase 2's scrape — no code path writes to it after ingest |
| 15-min poll interval under real load (15+ recordings/day, growing) | `listFiles` pagination + a 1-hour overlap window on `last_synced_at` tolerates late arrivals without re-scraping everything; full re-scrape only happens for rows still `pending`/`retry_pending_transcript` |
| Token encryption key loss (VPS rebuild) | `plaud_connection`/`plaud_oauth_client` history is kept, not deleted, on reconnect — a lost key just means "reconnect once," not data loss of past recordings/meetings (those live independently in `plaud_recording`/`meeting`) |
| Remote MCP server (`mcp.plaud.ai`) is a third-party dependency the server now talks to continuously | Scoped entirely to Phase 0's spike validating real-world reliability before anything else depends on it; §2.2's direct-REST path is a documented, ready-to-build fallback if it proves unreliable |
| Migration numbering collision with the in-flight uncommitted `005_portfolio_enabled.sql` work | This plan's migration is explicitly `006_*`; Phase 1 EXECUTE must re-check `ls apps/api/migrations/` for the current highest number before writing the file, in case `005` has been renumbered/merged by the other task in the meantime |
| Owner sends free text on the Updates channel with no pending text prompt (no open `input_mode='text'` bot message) | `chat.service.ts`'s `sendOwnerText` only interprets free text against the single most-recent unanswered `input_mode='text'` bot message; with none pending, the text is stored as a plain unactioned message with no bot reply — never misrouted into an unrelated flow |
| "Ask" tab's stuffed-context snapshot could leak more project/client data than a given reply needs | Snapshot is already capped (~50 rows/table) and excludes transcripts entirely (§6.5); `requireAdmin`-only scope (decision #1 above) means only the owner ever sees it |

---

## 11. Test matrix

| Layer | Coverage | Where |
|---|---|---|
| Crypto round-trip | `encryptSecret`/`decryptSecret` symmetric, wrong-key failure | throwaway script during Phase 1 EXECUTE (no dedicated unit runner exists in `apps/api` today — see §2.4) |
| Untrusted-JSON unwrapping | `extractUntrustedJson` correctly extracts/parses a tagged block, and returns a clear non-throwing signal for plain-text "not available" tool responses | throwaway script during Phase 2 EXECUTE, using a captured real tool response as a fixture |
| API wiring (integration) | Auth-gate on every `/api/plaud/*` route (401/403 without `admin`), `GET /status` shape, `GET /meetings?projectId=` shape incl. primary/side recordings | new `describe("Plaud", ...)` in `apps/web/src/test/api-wiring.test.ts` — seeded via direct DB inserts (no live Plaud network calls; the suite must not depend on real Plaud credentials) |
| Matching quality (manual, not CI) | Real 15-recording set classifies correctly per Phase 3's verification step | run once during Phase 3 EXECUTE against the connected real account; results recorded in this plan's phase-status notes, not re-run automatically |
| Calendar integration | `GET /api/calendar?from&to` already includes `category='meeting'` rows generically — confirm no existing Calendar test block breaks | re-run existing `describe("Calendar", ...)` block in `api-wiring.test.ts` unmodified |
| Chat state machine (integration) | `GET /api/chat/messages` shape, `POST /api/chat/messages` (free text) + `POST .../:id/answer` (button tap) mutate `chat_message` correctly; answering an already-answered message returns 409; auth-gate `requireAdmin` on all three routes | new `describe("Chat", ...)` in `apps/web/src/test/api-wiring.test.ts` — seeded via direct DB inserts, no live Claude calls (Ask-channel reply path mocked/stubbed in this suite, not exercised live) |
| E2E / manual UI | Connect flow (incl. DCR on first use); chat widget Updates flow (confident FYI, unsure ranked-candidate buttons, full "New project" path); Ask tab Q&A incl. the no-answer fallback; Meetings tab transcript/audio playback | manual walkthroughs per Phase 5/6/7/8, each with a required screenshot at 1440px and 390px before marking that phase ✅ |
| Full regression | `npm run build` (apps/api) + `npm run build` (apps/web) both 0 errors; full `api-wiring.test.ts` suite green | before any deploy step in Phase 9, per existing repo convention (`HANDOFF.md` entries always cite "typecheck 0/0, both builds ✓, suite N/N") |

---

## 12. Blast radius

- **Net-new tables only** — no existing table is altered. Zero migration risk
  to `project`/`client`/`calendar_event`/`notification`/etc.
- **Net-new runtime dependency** (`@modelcontextprotocol/sdk`) added to
  `apps/api/package.json` only — does not touch `apps/web`'s dependency tree
  or any existing API dependency version.
- `calendar_event` gains new **rows** (category `'meeting'`, already a valid
  value in `MANUAL_CATEGORIES` in `calendar.routes.ts`) but no schema change
  and no code change to `calendar.routes.ts` — `GET /api/calendar` already
  reads `calendar_event` generically, so meetings appear on the existing
  calendar UI with zero calendar-layer changes.
- `apps/api/src/index.ts` gains one new route mount + one new `setInterval` —
  additive, follows the exact existing pattern, does not touch the existing
  session-cleanup interval or any existing route.
- `ProjectCommandCenter.tsx` gains one new tab — additive to the `tabs`
  array/`TabsContent` list; no existing tab's markup is touched.
- `AdminSettings.tsx` gains one new row inside the existing Integrations
  `Panel` — no existing row (API/Vercel) is touched.
- `Admin.tsx` gains one unconditional `<ChatWidget />` render alongside the
  existing layout — **no new nav entry, no new `AdminSection` value, no
  existing `activeSection` branch touched.** The widget floats over every
  section via fixed/absolute positioning, not via routing.
- No changes to auth, billing/invoicing, contracts, or client-portal-facing
  code paths at all. The `notification` table is explicitly **not** touched
  (§3.6) — zero risk to the client notification feature.
- `meeting.attendees`/`attendees_confirmed` and `MeetingAttendeesDialog.tsx`
  never existed in any shipped code (this plan has not been executed yet) —
  dropping them is a pure plan-authoring change, not a migration/rollback
  concern.
- Known **uncommitted, unrelated** in-flight changes
  (`apps/api/src/db/schema.ts`, `apps/api/src/routes/content.routes.ts`,
  `apps/web/src/components/admin/AdminPortfolio.tsx`,
  `apps/web/src/hooks/useAdminPortfolio.ts`,
  `apps/api/migrations/005_portfolio_enabled.sql`) are **not** reverted,
  touched, or depended upon by this plan. EXECUTE must diff-check
  `schema.ts` edits don't collide with that in-flight portfolio work (append
  Plaud's new tables; do not reformat/reorder unrelated existing exports).

---

## 13. Verification evidence (what EXECUTE must produce before closeout)

- `npm run build` output (apps/api, apps/web) — 0 errors, pasted/linked.
- `api-wiring.test.ts` full run output showing the new `Plaud` describe block
  passing alongside the full existing suite (N/N, matching the
  `HANDOFF.md`-style convention).
- Phase 0's spike result (DCR + login + one `list_files` call succeeded
  against the real account — or the fallback was triggered and why).
- Phase 3's real-15-recording classification results (which recordings
  matched which project, at what confidence, and which were correctly
  ignored as non-meetings) — recorded as plain text in the EXECUTE
  session/commit message, not necessarily a new doc file.
- Screenshots (1440px desktop **and** 390px mobile for every chat-widget
  shot, per Phase 6/7's verification requirement): Settings → Integrations
  (connected state); chat bubble + unread badge; Updates tab with an
  unanswered ranked-candidate button question; the same question after
  answering (locked state); the full "New project" flow's final "Done.
  Added to \<Name\>." message; Ask tab with one real question/answer
  exchange; Project Meetings tab (a real meeting with transcript + summary
  + working audio playback).
- Prod verification after Phase 9: `GET https://api.advo.ph/api/plaud/status`
  response before and after the one-time prod connect; one clean `pm2 logs
  advo-api` sync-tick excerpt.

---

## 14. Resume and execution handoff

- **Single plan file, single EXECUTE target:** this file. No umbrella/phase-
  program split — the user asked for one COMPLEX plan, and the phases above
  are sequential sections of this one document, not separate plan files.
- **Entry point for EXECUTE:** start at Phase 0 (cheap, de-risks the
  remote-MCP+DCR assumption before anything else is built on it). Do not
  skip to Phase 5's UI before Phases 1–4 are verified, since Phase 5 depends
  on real recordings already flowing through the pipeline for a meaningful
  manual test.
- **No hard dependency on a separate user action mid-plan** (unlike an
  earlier revision's open question) — the only user involvement is logging
  into their own Plaud account in a browser during Phase 0 and/or Phase 5
  (always expected per decision #1), plus confirming or overriding the two
  defaults in §10.1 before EXECUTE begins.
- **Before writing `006_plaud_meetings.sql`:** re-run
  `ls apps/api/migrations/` to confirm `005` is still the highest number (see
  §10.2's collision risk) and pick the next integer accordingly.
- **If Phase 0 fails structurally:** do not improvise a new approach —
  switch to §2.2's documented REST fallback, update §2.3/§7/Phase 0/Phase 2/
  Phase 5 of this same plan file accordingly, and resume from Phase 1 (the
  data model is unaffected either way except for dropping the
  `plaud_oauth_client` table, which only exists for the DCR path).
- **Phase order is now 0–9** (Phase 6 chat shell/Updates, Phase 7 Ask chat,
  Phase 8 Meetings tab, Phase 9 docs+deploy) — do not resume against any
  older cached mental model of "Phase 6 = Review inbox."
- **Status markers:** update each phase's ✅/🚧/⏳ marker and this file's
  top-level `Status:` line as EXECUTE progresses; keep the "What's Functional
  Now" note under each completed phase accurate for anyone resuming mid-plan.
