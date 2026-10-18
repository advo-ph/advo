# Plaud Chat Widget — COMPLEX Plan

**Date:** 18-10-26
**Feature:** plaud-chat
**Complexity:** COMPLEX (new tables, hook into teammate's live pipeline, new API surface, new always-mounted UI, AI-backed Q&A)
**Status:** Not started
**Plan file:** `process/features/plaud-chat/active/plaud-chat_PLAN_18-10-26.md`
**Worktree:** own git worktree, branch `feat/plaud-chat`, API on port **6427** against local `advo_dev` (migration 057 is this feature's only migration — do not touch 055/056, reserved for MCP).

---

## 1. Overview

Add a floating, owner-only chat widget to every admin page. It has two tabs:

- **Updates** — one short message per newly-imported Plaud recording: FYI for
  a confident project match (OK/Change), a tap-button question for an unsure
  match (pick a project / "New project" / "Don't add"), nothing at all for a
  non-ADVO recording. A short flow to create a brand-new project by typed
  name (+ one button question for client, only if more than one client
  exists).
- **Ask** — free-text questions about projects/meetings/calendar, answered by
  one Claude call against a small read-only snapshot (no transcripts), with a
  short honest fallback line when AI is unavailable.

This plan does **not** touch Plaud auth, Plaud sync scheduling, or the
recording-import pipeline — all of that already shipped on `main` (teammate
Mar Angelo, same day). This plan adds one new hook call into that pipeline, a
new `chat_message` table, a `meeting.parent_meeting_id` column for
side-project excerpt copies, and the widget itself.

### Decisions locked by the shared contract (not reopened here)

1. Widget is **owner-only** (`user.isOwner`, migration 033) — not `admin`,
   not `team`. New `requireOwner` middleware in `rbac.ts`.
2. Confident/unsure threshold, "Don't add" semantics, side-project copies,
   one-meeting-per-project-per-day display grouping, Ask's no-transcript
   snapshot, single-call-per-turn (no tool-use loop) — all per the contract
   and §6 below. None of these are reopened.
3. `ADVO_AI_MODEL = "claude-opus-5-5"`, one shared constant, used by every
   Claude call this feature makes (side-excerpting + Ask replies).
4. No new meeting tables. `meeting` (existing) + `chat_message` (new) are the
   only data model touched.

---

## 2. Research findings — current `main` state (verified in code, 18-10-26)

### 2.1 Import pipeline already shipped (read-only to this plan except one hook)

- `apps/api/src/services/plaud-poll.service.ts` — self-rescheduling tick
  (`setTimeout`, not `setInterval`; backs off on failure). `syncOpen()` (Open
  API transport, the one running in prod) does, per fresh file: route via
  `routeRecording()`, then
  `const projectId = route.projectId ?? (await resolveInboxProjectId(null));`
  then `importPlaudMeeting({projectId, fileId, createdBy, payload})`. Only
  reaches `importPlaudMeeting` when `route.isAdvo === true` — non-ADVO
  recordings are added to `notAdvoFileId` and skipped, no `meeting` row at
  all. `result.created` tells us whether this `importPlaudMeeting` call
  inserted a brand-new `meeting` row (true) or updated an existing one found
  by `plaud_file_id` (false, e.g. a retry once transcript appears).
- `apps/api/src/services/meeting-route.service.ts` — `routeRecording(text,
  candidates)` returns `{projectId, isAdvo, score, matched}`
  (`matched: string[]`, **not** a reasoning string — there is no AI reasoning
  text anywhere in this router, it is pure keyword scoring). `routeCandidate()`
  returns `RouteCandidate[] = {projectId, title, strong, weak}` for every
  project except "Inbox". The internal `scored` array (ranked by
  `titleScore` desc then `score` desc) is computed but **currently
  discarded** — only `scored[0]`/`scored[1]` are read, to decide
  confident-vs-tie. This plan's hook needs the **top 3** ranked candidates;
  see §4.1 for the minimal-diff way to get them out.
- `apps/api/src/services/plaud-import.service.ts` — `importPlaudMeeting()`
  upserts one `meeting` row keyed by `plaud_file_id` (unique index
  `idx_meeting_plaud_file`). `resolveInboxProjectId(explicit)` — explicit id,
  else `ADVO_INBOX_PROJECT_ID` env, else a project titled "Inbox", else
  auto-creates client "ADVO Inbox" + project "Inbox". **"Unsure" in the
  contract (`isAdvo && projectId === null`) still imports into Inbox today**
  — nothing is lost if this plan's hook never runs; it only adds a chat
  question on top of that already-successful import.
- `meeting` table (verified in `apps/api/src/db/schema.ts:530-564`):
  `meetingId` (bigserial PK), `projectId` (nullable FK → project, cascade),
  `title`, `recordedAt` (notNull), `transcript` (notNull default `""`),
  `summary`, `plaudFileId` (unique index, nullable), `plaudShareKey`,
  `isVisibleClient`, `createdBy`, `createdAt`/`updatedAt`, `startsAt`,
  `endsAt`, `location`, `description`, `audioUrl` (migration 054). **No
  `parentMeetingId` column exists yet** — this plan adds it (§3).
- `apps/api/src/routes/meeting.routes.ts` — mounted at `/api/meeting`.
  `PATCH /:id` (`requireTeam`) accepts a partial of the same shape, including
  `projectId: z.number().int().optional().nullable()` — reusable for "Change"
  / project-reassignment, but note it is `requireTeam` not `requireOwner`;
  this plan's chat flows call the **service functions**
  (`importPlaudMeeting`'s upsert path doesn't fit — reassigning an existing
  meeting's project is a plain `db().update(meeting).set({projectId})`), not
  this HTTP route, so no new auth exception is needed on that route.
- `apps/web/src/components/admin/ProjectCommandCenter.tsx` already has a
  working **"Meetings" tab** (`TabsContent value="meetings"`, lines
  1191–1363) — nothing to build there. `apps/web/src/components/admin/
  AdminMeetings.tsx:582` still renders a bare `"Plaud"` link label next to a
  Plaud share URL — unrelated cosmetic cleanup, §9.

### 2.2 No chat UI exists anywhere; widget mount point

- `apps/web/src/App.tsx` mounts `<JobProgressWidget />` once, fixed
  bottom-right, outside the router (line 104) — it "survives navigation and
  refresh." The contract assigns the *chat* widget to mount in
  `apps/web/src/pages/Admin.tsx` instead (owner-only, admin-only feature;
  `JobProgressWidget` is global/all-roles). Both are fixed bottom-right —
  this plan owns the stacking fix (§7.1).
- `apps/web/src/hooks/useRoles.ts` exposes `isOwner` (reads
  `GET /api/auth/me`'s `isOwner` field, migration 033,
  `apps/api/src/db/schema.ts:113`). `rbac.ts` currently has only
  `requireAdmin`/`requireTeam`/`requireAdminOrClient`, keyed off `user.role`
  — `isOwner` is a separate boolean column, not a role value, so every
  existing owner-gated route (`deliverables.routes.ts`, `commission.routes.ts`,
  `team.routes.ts`, `settings.routes.ts`, `vps-monitor.routes.ts`) currently
  re-implements its own local `getIsOwner(userId)` lookup rather than a shared
  middleware. This plan adds the first shared one: `requireOwner` in
  `rbac.ts`, same lookup pattern as `deliverables.routes.ts:76-83`, composed
  as `requireAuth` → look up `c.get("user")`, `db().select({isOwner:
  user.isOwner}).from(user).where(eq(user.userId, caller.userId))`, 403 if
  false.

### 2.3 AI call pattern (Claude)

- `apps/api/src/services/corpus.service.ts:391-393` — `new Anthropic()`
  (bare, reads `ANTHROPIC_API_KEY` from env), `model:
  process.env.CORPUS_EXTRACT_MODEL || "claude-opus-5"` — confirms the
  call/validate/fallback shape this plan reuses (JSON-only prompt, strip
  fences, `JSON.parse`, validate shape, heuristic/plain fallback on any
  error). No `ANTHROPIC_API_KEY` is configured locally (per contract) — every
  AI code path in this plan must degrade to a plain, honest line, never throw
  to the caller.
- **Before writing the Claude call code in EXECUTE**, read the `claude-api`
  skill (Skill tool name: `claude-api`) if present, for current SDK usage
  (model id format, message shape) — then keep the
  call/validate/fallback *pattern* above; do not copy
  `corpus.service.ts`'s model string, use `ADVO_AI_MODEL` from the new
  `apps/api/src/utils/ai-model.ts` (per contract, this plan creates that
  file: `export const ADVO_AI_MODEL = "claude-opus-5-5";`).

### 2.4 activity_log convention

- `apps/api/src/db/schema.ts:715-726` — `activityLog`: `activityId` (PK),
  `userId` (nullable FK, set null), `action` (varchar 50), `entityType`
  (varchar 50), `entityId` (nullable int), `metadata` (jsonb), `createdAt`.
  Existing call sites (`commission.service.ts:974-980`,
  `project-signoff.service.ts`) insert directly via
  `db().insert(activityLog).values({userId, action, entityType, entityId,
  metadata})` — this plan follows that exact shape, `metadata.source`
  = `'plaud'` (auto-import routing results) or `'chat'` (owner-driven
  changes), per the shared contract's convention. `userId: null` for
  bot-authored rows where no human acted (e.g. an auto-FYI that the owner
  never taps).

### 2.5 Project/client creation minimal shape

- `apps/api/src/db/schema.ts:148-191` — `client.companyName` NOT NULL is the
  only required client column beyond PK; `project.clientId` NOT NULL FK
  (cascade), `project.title` NOT NULL, everything else nullable or defaulted
  (`projectStatus` defaults `'discovery'`, money columns default `0`). No
  `slug` column on `project` exists in this schema at all (the stale plan's
  worry was unfounded — verified absent from `project` table).
  `apps/api/src/routes/projects.routes.ts:238-277` — `createSchema =
  z.object({clientId: z.number(), ...})`, `POST /` is `requireAdmin`. This
  plan's "New project" chat flow calls `db().insert(project).values({
  clientId, title})` directly from `chat.service.ts` (service-layer, not
  via the HTTP route — the route requires a full `createSchema` zod body
  this flow doesn't have, and the flow is already behind `requireOwner`),
  mirroring `resolveInboxProjectId`'s own direct-insert style in
  `plaud-import.service.ts:138-150`. One extra button question ("Which
  client?") only when `client` has 2+ rows, per contract.

### 2.6 Tests, build, env

- `apps/web/src/test/api-wiring.test.ts` — one `describe(...)` block per
  domain, `fileParallelism: false` (shared live DB), auth-gate assertions
  (`expect(status).toBe(401)` with no token) as the first case in every
  block, then CRUD/shape assertions, seeded via direct calls against the
  running API (not raw DB inserts in most existing blocks, but this plan's
  contract explicitly calls for direct DB inserts to seed `chat_message` rows
  — faster and avoids re-deriving the whole Plaud-import path in a test).
  `fileParallelism: false` means ordering within the file matters; this
  plan's new `describe("Chat", ...)` block is appended at the end, not
  interleaved.
  `scripts/test-local.sh` boots the API on **6407** by default — this
  worktree overrides to 6427 (contract); `VITE_API_URL` env var drives
  `apps/web/src/test/api-wiring.test.ts`'s target, confirm at EXECUTE time
  that `test:local`/`VITE_API_URL` honor a non-default port (read
  `scripts/test-local.sh` fully and `apps/web/src/test/api-wiring.test.ts`
  lines 1-30 before running).
- `apps/api/migrations/*.sql` convention: `BEGIN`/`COMMIT` +
  `INSERT INTO schema_migration (filename, is_backfilled) VALUES (...) ON
  CONFLICT DO NOTHING` — copy the exact form from 050-054 (migration 054
  shown in full in research; it is `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS` wrapped the same way — confirm exact wrapper text from 050-053 at
  EXECUTE time since 054's snippet above doesn't show the full
  BEGIN/COMMIT/INSERT wrapper).

---

## 3. Data model — migration `057_plaud_chat.sql`

### 3.1 `chat_message` (new table)

| Column | Type | Notes |
|---|---|---|
| `chat_message_id` | bigserial PK | |
| `channel` | varchar(10) NOT NULL | `updates`\|`ask` — app-validated, documented via `COMMENT ON TABLE` (repo convention — growable string sets are `varchar` + comment, not a pg enum) |
| `sender` | varchar(10) NOT NULL | `bot`\|`owner` |
| `sent_by_user_id` | integer FK → `user.user_id` ON DELETE SET NULL | always `null` when `sender='bot'` |
| `body` | text NOT NULL | |
| `input_mode` | varchar(10) NOT NULL DEFAULT 'none' | `none`\|`buttons`\|`text` |
| `options` | jsonb | present only when `input_mode='buttons'`: `Array<{id:string,label:string,style?:'primary'|'default'|'danger'}>` |
| `answered_option_id` | varchar(50) | set once; a second `POST .../answer` on the same row is rejected (409) |
| `context` | jsonb | `{type:'confident_fyi'|'meeting_match'|'new_project_name'|'new_project_client'|'ask_followup', meetingId?, candidateProjectIds?, projectName?}`; `null` for owner free text |
| `created_at` | timestamptz NOT NULL DEFAULT NOW() | |

Index: `idx_chat_message_channel_created` on `(channel, created_at DESC)`.

No separate "unread" table — unread badge computed client-side from a
per-channel `localStorage` "last seen" timestamp (contract, matches stale
plan §3.6's reasoning: single-owner chat, per-browser unread is acceptable).

### 3.2 `meeting.parent_meeting_id` (new column on existing table)

`parent_meeting_id integer REFERENCES meeting(meeting_id) ON DELETE CASCADE`,
nullable. Set only on side-project excerpt copies (§5). Primary meetings
(the one `importPlaudMeeting` created/updated) always have `parent_meeting_id
= NULL`. Index: `idx_meeting_parent` on `parent_meeting_id`.

Drizzle mirror in `apps/api/src/db/schema.ts`: add `chatMessage` pgTable as
its own new block at the end of the file (contract: each feature appends at
the end); add `parentMeetingId: integer("parent_meeting_id").references(()
=> meeting.meetingId, {onDelete: "cascade"})` to the existing `meeting`
pgTable definition (the one exception to "append-only," per contract line
19) plus `index("idx_meeting_parent").on(t.parentMeetingId)` in its index
array.

Migration file follows the exact `BEGIN`/`COMMIT` +
`INSERT INTO schema_migration (...) ON CONFLICT DO NOTHING` wrapper copied
verbatim from 050-054 (re-read one of those files at EXECUTE time for the
precise text, including the `is_backfilled` value used — confirm `true` vs
`false` convention for a fresh, non-backfilled migration).

---

## 4. Hook into the live import pipeline (minimal-diff)

### 4.1 `meeting-route.service.ts` — expose ranked candidates (small, additive change)

Add a second exported function (do not change `routeRecording`'s signature
or return shape — `plaud-poll.service.ts` destructures
`{projectId, isAdvo, score, matched}` today and must keep working
unmodified):

```
export type RankedCandidate = { projectId: number; title: string; score: number };

export function rankCandidates(
  text: { title: string; summary?: string | null },
  candidate: RouteCandidate[],
): RankedCandidate[]
```

Internally this re-runs the *same* scoring loop `routeRecording` already
computes (duplicator, not a refactor of the existing `scored` array out of
`routeRecording` — keeping `routeRecording`'s internals untouched is safer
given the teammate is actively editing this file today; a shared internal
helper can be introduced later without this plan owning that refactor). Top
3 by the same `titleScore` desc, `score` desc sort, `score > 0` filter.
`plaud-chat.service.ts` (§4.2) calls `rankCandidates` once per new
recording, independently of `routeRecording`'s own call in
`plaud-poll.service.ts`/`meeting-route.service.ts`'s existing call sites —
two calls, same inputs, no shared state, zero risk of changing today's
auto-import behavior.

### 4.2 New file `apps/api/src/services/plaud-chat.service.ts`

Exports one function:

```
export async function onPlaudMeetingImported(input: {
  meetingRow: typeof meeting.$inferSelect;  // the row importPlaudMeeting returned
  route: RouteResult;                        // from routeRecording, as already computed by the caller
  created: boolean;                          // only act when true — never re-post for an update-in-place
}): Promise<void>
```

Logic:
1. `if (!input.created) return;` — duplicate-safety: a row is only "newly
   created" once (upsert-by-`plaud_file_id` means a retry hits the `created:
   false` branch). This is the entire duplicate-prevention mechanism; no
   extra "already posted" flag needed because this function is the only
   caller of `postBotMessage` for Updates-channel import messages and it
   only ever runs once per `created: true` result.
2. `if (!input.route.isAdvo) return;` — not a meeting, zero noise (teammate's
   pipeline already guarantees `isAdvo: false` never reaches
   `importPlaudMeeting` at all today, so this check is defensive, not
   load-bearing — kept anyway since `onPlaudMeetingImported` could be called
   from the consumer-transport path too, which has no routing step at all;
   see 4.3).
3. Confident (`input.route.score` crosses a named threshold —
   `AUTO_MATCH_SCORE_THRESHOLD`, see §4.4) **and** `input.route.projectId !==
   null` → `postBotMessage('updates', {body: "New meeting added to
   <Project title>.", inputMode:'buttons', options:[{id:'ok',label:'OK'},
   {id:'change',label:'Change'}], context:{type:'confident_fyi', meetingId,
   projectId}})`.
4. Unsure (`input.route.projectId === null`, i.e. the import went to Inbox)
   → `rankCandidates` on the same title/summary + `routeCandidate()`, then
   `postBotMessage('updates', {body:"New meeting: <title, 40 chars>. Which
   project?", inputMode:'buttons', options: top up-to-3 candidates + {id:
   'new_project',label:'New project'} + {id:'skip',label:"Don't add"},
   context:{type:'meeting_match', meetingId, candidateProjectIds:[...]}})`.
5. Writes one `activity_log` row either way:
   `{userId:null, action:'meeting_routed', entityType:'meeting',
   entityId:meetingId, metadata:{source:'plaud', confident: <bool>,
   projectId: input.route.projectId}}`.

### 4.3 Caller: `plaud-poll.service.ts` (one-line-per-branch addition)

In `syncOpen()`, right after `const result = await importPlaudMeeting(...)`
and its `if (result.created)` block (current lines ~240-248), add:

```
if (result.created && result.meeting) {
  await onPlaudMeetingImported({ meetingRow: result.meeting, route, created: true }).catch((err) => {
    recordError("plaud-chat", err);
    log.warn({ err, fileId: f.fileId }, "chat hook failed; import kept");
  });
}
```

`syncConsumer()` (the fallback transport, not running in prod today — no
routing step exists there, it always targets Inbox) does **not** get this
hook — per contract scope ("never restructure" the teammate's files,
"minimal touch"); the consumer transport has no `RouteResult` to pass, and
adding routing to it is out of scope. Document this explicitly as an
accepted gap: if the consumer transport ever becomes primary, a follow-up
plan adds routing + the hook there.

A hook failure is caught and logged, never throws — the already-successful
`meeting` import (and corpus ingest, which already runs after this point in
the existing code) is never undone by a chat-posting failure.

### 4.4 Thresholds (named constants, `plaud-chat.service.ts`)

- `AUTO_MATCH_SCORE_THRESHOLD = 6` — `routeRecording`'s own doc comment says
  a strong title hit alone scores 6; this plan reuses that same number as
  "confident enough for FYI-not-a-question," so a single strong keyword hit
  in the title is enough for silent auto-link + FYI, matching the existing
  import behavior's own bar for routing at all (`score >= 2 && isAhead` is
  `routeRecording`'s floor for *any* auto-route; this plan's FYI-vs-question
  split only matters for `projectId !== null` cases, which already passed
  that floor — so this constant purely decides "does this FYI deserve a
  'Change' option that feels confident" vs a softer tone; both still show
  OK/Change). **Flagged for owner confirmation at plan review** — the exact
  number is a judgment call, not derived from a hard requirement; 6 is
  chosen because it is `routeRecording`'s own single-strong-title-hit score.
- `SIDE_PROJECT_SCORE_THRESHOLD = 2` — any other project's `rankCandidates`
  score at or above `routeRecording`'s own minimum routing floor (`score >=
  2`) gets a side-project excerpt copy (§5). Also flagged for confirmation.

---

## 5. Side-project excerpt copies

Triggered from two places: (a) immediately after `onPlaudMeetingImported`
confidently or ranked-routes a primary project, for every *other* candidate
project whose `rankCandidates` score `>= SIDE_PROJECT_SCORE_THRESHOLD`; (b)
after the owner answers an unsure-match button (§6.3) — same function, same
threshold, run once more now that the primary is finalized.

New function in `plaud-chat.service.ts`:

```
async function createSideProjectCopy(primaryMeeting, sideProjectId): Promise<void>
```

1. Builds an excerpt: if `ANTHROPIC_API_KEY` is set, one `ADVO_AI_MODEL` call
   — system prompt: "Extract only the parts of this transcript relevant to
   project <sideProject title>. Return JSON {excerpt: string, summary:
   string}." Untrusted transcript text is the user-turn payload, never
   concatenated into the system prompt (same untrusted-data discipline as
   every other AI call in this repo). Parse/validate; on any error/missing
   key, fall through to the heuristic.
2. Heuristic fallback (also the only path when no API key): split
   `primaryMeeting.transcript` into lines, keep any line matching that
   project's `keywordFor()` aliases (reuse `meeting-route.service.ts`'s
   exported `keywordFor`) plus one neighboring line each side, join.
3. `db().insert(meeting).values({projectId: sideProjectId, parentMeetingId:
   primaryMeeting.meetingId, title: primaryMeeting.title, recordedAt:
   primaryMeeting.recordedAt, transcript: excerptText, summary:
   excerptSummary, createdBy: primaryMeeting.createdBy})` — **no
   `plaudFileId`** (side copies are never found by the unique
   `plaud_file_id` index — only the primary row carries it, so a re-import
   retry never collides with or duplicates a side copy).
4. Primary meeting's own `transcript`/`summary` columns are never read-write
   touched by this function — read-only.

One side-project copy per `(sideProjectId, primaryMeeting.meetingId)` pair —
guarded by checking for an existing `meeting` row with that
`parentMeetingId` + `projectId` before inserting (idempotency if this
function is ever called twice for the same pair, e.g. once at import time
and once after a chat answer that confirms the same primary).

---

## 6. Chat design — reused verbatim from the stale plan's §6 (UX unchanged)

The conversation model, message shape, Updates/Ask flows, copy rules, and
widget shell below are the stale plan's §6.1-6.6, re-anchored to this
feature's actual tables/services (`chat_message` unchanged shape;
`recordingId` renamed `meetingId` throughout since there is no
`plaud_recording` table in this model — the `meeting` row *is* the
recording).

### 6.1 Widget shell

- Floating bubble, bottom-right, mounted once in `apps/web/src/pages/
  Admin.tsx`, outside any section-switching — renders unconditionally once
  `useRoles().isOwner` is true (never rendered at all for non-owners, not
  just visually hidden). Unread `Badge` = sum of both channels' unread.
- Tap opens the panel: `Tabs` (shadcn `tabs.tsx`) — **Updates** / **Ask** —
  each with its own unread `Badge`.
- Desktop: fixed panel, ~360×520px, anchored bottom-right.
- Mobile (`useIsMobile()`): full-screen `Sheet` (`side="bottom"`, ~95%
  height).
- Polling via `@tanstack/react-query`: `refetchInterval: 20_000` for the
  open channel, `60_000` for the background one, hitting
  `GET /api/chat/messages?channel=&after=`. Unread = bot messages with
  `created_at` after that channel's `localStorage` "last seen"; opening a
  tab sets "last seen" to now.

### 6.2 Generic message shape (`ChatMessageBubble.tsx`)

1. **Plain** (`input_mode='none'`) — body only.
2. **Buttons** (`input_mode='buttons'`) — body + `options` row. Once
   `answered_option_id` is set, buttons render locked: the picked one
   highlighted, the rest dimmed, never tappable again (checked both
   client-side for UX and server-side via the 409 on `POST
   /messages/:id/answer` for an already-answered row).
3. **Text prompt** (`input_mode='text'`) — body (e.g. "Name?"); the normal
   text input is the reply; the owner's next `POST /api/chat/messages` on
   that channel is treated as the answer to this specific message (server
   looks at exactly the most recent unanswered `input_mode='text'` bot
   message on that channel — never a general free-text parser).

### 6.3 Updates channel — new-meeting flow (driven by `plaud-chat.service.ts`, §4-5)

- **Not ADVO** → no message (§4.2 step 2).
- **Confident** → `body="New meeting added to <Project>."`,
  `options=[OK, Change]`, `context={type:'confident_fyi', meetingId,
  projectId}`.
  - Tap **OK** → locks, no-op.
  - Tap **Change** → posts the same ranked-candidates question as "unsure"
    below, reusing one function for both entry points.
- **Unsure** → `body="New meeting: <title, 40 chars>. Which project?"`,
  `options` = top 2-3 ranked candidates + New project + Don't add,
  `context={type:'meeting_match', meetingId, candidateProjectIds:[...]}`.
  - Tap a **candidate** → `db().update(meeting).set({projectId}).where(eq(
    meeting.meetingId, meetingId))`; run `createSideProjectCopy` for every
    other ranked candidate over threshold; reply
    `body="Added to <Project>."` (`input_mode='none'`).
  - Tap **New project** → `postBotMessage('updates', {body:"Name?",
    inputMode:'text', context:{type:'new_project_name', meetingId}})`.
  - Tap **Don't add** → `db().update(meeting).set({projectId:
    null}).where(...)` (meeting row kept, never deleted — per contract's
    recommended "Don't add" semantics); reply `"OK, skipped."`.

### 6.4 Updates channel — "New project" flow

- Owner's text reply while `context.type==='new_project_name'`: that text is
  the new project's title.
  - Exactly one `client` row exists → auto-assign it, create immediately
    (step 2 below).
  - 2+ clients → `body="Which client?"`, `options` = one button per
    `client.companyName`, `context={type:'new_project_client', meetingId,
    projectName:<typed text>}`.
- Button tap with `context.type==='new_project_client'`: `db().insert(
  project).values({clientId:<tapped>, title:<projectName>})` (§2.5 — every
  other column nullable/defaulted); `db().update(meeting).set({projectId:
  newProjectId}).where(...)`; reply `"Done. Added to <Name>."`.

### 6.5 Ask channel

- Owner text → `POST /api/chat/messages {channel:'ask', body}`.
- `buildAskContextSnapshot()`: open projects (title, status, client company
  name, capped ~50), recent `meeting` rows (project, date, has-transcript
  bool — **no transcript text**), upcoming `calendar_event` rows. All
  read-only, no writes.
- One `ADVO_AI_MODEL` call per owner message: system prompt forces short,
  plain, common-word replies, strict JSON `{reply:string, options?:
  Array<{id,label}>}`. Parse/validate; on any error, malformed JSON, missing
  `ANTHROPIC_API_KEY`, or thrown exception → post a plain bot message
  (`input_mode='none'`) reading **"Ask is off right now."** (per task
  instructions' honesty requirement — not a silent generic fallback, and not
  pretending to answer).
- If the AI's JSON includes `options`, post `input_mode='buttons'` with
  `context={type:'ask_followup'}`; tapping a button resubmits that option's
  `label` as the owner's next plain `POST /api/chat/messages` turn — no
  special server branching for this case, the AI sees it as ordinary
  conversation.
- Single-call-per-turn, context-snapshot design — no tool-calling loop (data
  volume does not justify it at this scale, per contract).

### 6.6 Copy rules

Every bot `body` uses only common words, short lines:

`"New meeting added to <Project>."`, `"New meeting: <title>. Which
project?"`, `"Added to <Project>."`, `"Name?"`, `"Which client?"`, `"Done.
Added to <Name>."`, `"OK, skipped."`, `"Ask is off right now."`. Button
labels: `"OK"`, `"Change"`, `"New project"`, `"Don't add"`, plus each
project's/client's own name verbatim.

---

## 7. Touchpoints, public contracts, blast radius

### 7.1 New files (apps/api)

- `apps/api/migrations/057_plaud_chat.sql`
- `apps/api/src/utils/ai-model.ts` — `export const ADVO_AI_MODEL =
  "claude-opus-5-5";`
- `apps/api/src/services/plaud-chat.service.ts` — `onPlaudMeetingImported`,
  `createSideProjectCopy`, thresholds (§4, §5).
- `apps/api/src/services/chat.service.ts` — `postBotMessage`, `listMessages`,
  `answerOption`, `sendOwnerText` (Updates state machine, §6.3-6.4), Ask-path
  (`buildAskContextSnapshot`, Claude call, §6.5).
- `apps/api/src/routes/chat.routes.ts` — `/api/chat/*` (§7.4).

### 7.2 Modified files (apps/api)

- `apps/api/src/services/meeting-route.service.ts` — add exported
  `rankCandidates` (§4.1). Existing exports (`routeRecording`,
  `routeCandidate`, `keywordFor`) unchanged in signature/behavior.
- `apps/api/src/services/plaud-poll.service.ts` — one `await
  onPlaudMeetingImported(...).catch(...)` call added inside `syncOpen()`'s
  existing `if (result.created)` block (§4.3). No other lines touched.
- `apps/api/src/middleware/rbac.ts` — add `requireOwner` (§2.2).
- `apps/api/src/db/schema.ts` — new `chatMessage` table block at end of
  file; `parentMeetingId` column + index added to the existing `meeting`
  table definition (the contract's one named exception to append-only).
- `apps/api/src/index.ts` — `app.route("/api/chat", chatRoutes);` added
  among the existing `app.route(...)` calls (§2.6's mount list) — additive,
  one line.

### 7.3 New files (apps/web)

- `apps/web/src/hooks/useChat.ts`
- `apps/web/src/components/admin/ChatWidget.tsx`
- `apps/web/src/components/admin/ChatMessageBubble.tsx`

### 7.4 Modified files (apps/web)

- `apps/web/src/pages/Admin.tsx` — render `<ChatWidget />` once,
  unconditionally (component itself gates on `isOwner`), outside the
  `activeSection` branch.
- `apps/web/src/components/admin/AdminMeetings.tsx` — line 582 cosmetic
  rename `"Plaud"` → `"Transcriptions"` (§9, no behavior change).
- `apps/web/src/test/api-wiring.test.ts` — append `describe("Chat", ...)`
  (§10).

### 7.5 Public contracts — `/api/chat/*`

All mounted `app.route("/api/chat", chatRoutes)`. Every route
`requireAuth` → `requireOwner`. Response envelope `{data, error}` (repo
convention).

| Method & path | Purpose |
|---|---|
| `GET /api/chat/messages?channel=updates\|ask&after=` | list, newest-last, optional cursor; also the poll endpoint |
| `POST /api/chat/messages` | body `{channel, body}` — owner free text; server runs the relevant state-machine step (§6.3-6.5) |
| `POST /api/chat/messages/:id/answer` | body `{optionId}` — button tap; 409 if already answered |

### 7.6 Blast radius

- **Teammate's files touched**: `meeting-route.service.ts` (one new
  exported function, zero changes to existing ones),
  `plaud-poll.service.ts` (one new awaited call inside one existing `if`
  block). Both are additive; a revert of this plan's diff on either file is
  a clean two-hunk git revert.
- **Schema**: one new table (zero impact on existing queries), one new
  nullable column + index on `meeting` (zero impact on existing
  `meeting`-reading code — `SELECT *`/Drizzle-typed reads simply gain one
  more nullable field they can ignore).
- **No existing route, page, or test is removed or behaviorally changed** —
  `AdminMeetings.tsx:582` is a label-string-only edit.
- **Risk surface**: the live Plaud poll tick is mid-development by a
  teammate on `main` today; merging `feat/plaud-chat` back carries normal
  merge-conflict risk on `plaud-poll.service.ts`/`meeting-route.service.ts`
  if the teammate's own edits land in the same regions — mitigated by
  keeping this plan's diff on those two files to the smallest possible
  surface (§4.1, §4.3), stated explicitly as a Wave-2-merge risk per the
  contract's execution waves.

---

## 8. Implementation Checklist

1. Confirm migration numbering: `ls apps/api/migrations | tail -5` shows
   057 is next; copy 050-054's exact `BEGIN`/`COMMIT`/`schema_migration`
   insert wrapper into `057_plaud_chat.sql`; add `chat_message` table +
   `ALTER TABLE meeting ADD COLUMN IF NOT EXISTS parent_meeting_id integer
   REFERENCES meeting(meeting_id) ON DELETE CASCADE` + both indexes;
   `COMMENT ON TABLE chat_message` documenting `channel`/`sender`/
   `input_mode` valid values. Apply against local `advo_dev` on this
   worktree only.
2. Mirror schema in `apps/api/src/db/schema.ts`: new `chatMessage` pgTable
   block at EOF; `parentMeetingId` + `idx_meeting_parent` added to existing
   `meeting` table.
3. Create `apps/api/src/utils/ai-model.ts` (`ADVO_AI_MODEL` constant).
4. Add `requireOwner` to `apps/api/src/middleware/rbac.ts` (mirrors
   `deliverables.routes.ts`'s `getIsOwner` lookup, exported as reusable
   middleware this time).
5. Add `rankCandidates` export to `meeting-route.service.ts` (§4.1) — do not
   modify `routeRecording`/`routeCandidate`/`keywordFor`.
6. Create `apps/api/src/services/plaud-chat.service.ts`:
   `onPlaudMeetingImported`, `createSideProjectCopy`, both named thresholds
   (§4.2-4.4, §5). Read the `claude-api` skill before writing the AI
   excerpting call; use `ADVO_AI_MODEL`.
7. Create `apps/api/src/services/chat.service.ts`: `postBotMessage`,
   `listMessages`, `answerOption` (409 on re-answer), `sendOwnerText`
   dispatcher covering `confident_fyi`→Change, `meeting_match`,
   `new_project_name`, `new_project_client`, `ask_followup`, plus
   `buildAskContextSnapshot` + the Ask AI call with fallback text "Ask is
   off right now." Every state-changing branch also writes one
   `activity_log` row (`source:'chat'`) per §2.4.
8. Create `apps/api/src/routes/chat.routes.ts` (3 routes, §7.5), mount in
   `apps/api/src/index.ts`.
9. Wire the hook: add the `onPlaudMeetingImported` call inside
   `plaud-poll.service.ts`'s `syncOpen()` `if (result.created)` block
   (§4.3), `.catch` + `recordError`/`log.warn`, never rethrown.
10. Cosmetic: rename `"Plaud"` → `"Transcriptions"` at
    `AdminMeetings.tsx:582` (label text only).
11. Build `apps/web/src/hooks/useChat.ts` (list/post/answer, localStorage
    last-seen per channel, polling intervals per §6.1).
12. Build `apps/web/src/components/admin/ChatMessageBubble.tsx` (3 render
    modes, §6.2).
13. Build `apps/web/src/components/admin/ChatWidget.tsx` (shell, tabs,
    desktop panel + mobile `Sheet` via `useIsMobile()`, unread badges,
    gates on `useRoles().isOwner`).
14. Mount `<ChatWidget />` once in `apps/web/src/pages/Admin.tsx`, outside
    `activeSection` branching; verify no visual overlap with
    `JobProgressWidget` (App.tsx) at both breakpoints — apply `max(16px,
    env(safe-area-inset-bottom))`-style padding per contract.
15. Add `describe("Chat", ...)` to `apps/web/src/test/api-wiring.test.ts`
    (§10) — auth-gate (401 unauthenticated, 403 non-owner), list/post/
    answer happy paths, 409 on double-answer, seeded via direct DB inserts.
16. Write a throwaway script (scratchpad, not committed) that calls
    `onPlaudMeetingImported` with a fabricated `meetingRow`/`route` to
    exercise the FYI, unsure, and side-copy paths without live Plaud/AI —
    run manually, delete after confirming behavior; capture output in the
    EXECUTE report, not as a committed test.
17. Run `npm run build`, `npm run lint`, `npm run test:local` (confirm
    `VITE_API_URL`/port-6427 override works per §2.6 before relying on it —
    adjust if `test-local.sh` hardcodes 6407).
18. Screenshots (desktop 1440 + mobile 390) into
    `~/Downloads/ADVO/ADVO/Screenshots/plaud-chat-2026-10-18/`: bubble with
    unread badge; Updates tab with an unanswered question; the same message
    after answering (locked state); end of the New-project flow; an Ask
    exchange (fallback text acceptable if no API key).

---

## 9. Cleanup (bundled into this plan per the orchestrator's instruction)

`AdminMeetings.tsx:582` — the literal `"Plaud"` link label (next to a Plaud
share URL) renamed to `"Transcriptions"`. Pure cosmetic string change,
checklist item 10.

---

## 10. Test matrix

**Unit-equivalent (service-level, via the throwaway script, item 16):**
confident match → FYI message created, no side copies below threshold;
unsure match → question message with ≤3 candidate options + New
project + Don't add; a candidate above `SIDE_PROJECT_SCORE_THRESHOLD` →
`createSideProjectCopy` inserts exactly one child `meeting` row with
`parentMeetingId` set and no `plaudFileId`; calling `onPlaudMeetingImported`
twice with `created:false` the second time → no second message (duplicate
safety).

**Integration (`api-wiring.test.ts`, new `describe("Chat", ...)`):**
- No token → 401 on all three routes.
- Non-owner (admin/team) token → 403 on all three routes.
- Owner token: `POST /api/chat/messages {channel:'updates', body:'hi'}` with
  no pending `text`-mode prompt → treated as a disconnected note (no crash,
  server's own defined behavior — document exact response in the test).
- Seed one `chat_message` row with `input_mode:'buttons'` via direct DB
  insert; `POST /messages/:id/answer` once → 200, `answered_option_id` set;
  same request again → 409.
- `GET /messages?channel=updates&after=<id>` returns only rows after that
  id.

**Manual (screenshots, item 18):** widget shell at both breakpoints, full
Updates flow end-to-end against a fabricated/manually-triggered import, Ask
exchange.

---

## 11. Rollback

- Migration 057 is additive-only (`CREATE TABLE` + `ADD COLUMN IF NOT
  EXISTS`) — rollback is `DROP TABLE chat_message; ALTER TABLE meeting DROP
  COLUMN parent_meeting_id;`, safe at any point since nothing else
  references either yet.
- The `plaud-poll.service.ts` hook call is a single `.catch`-guarded
  statement — commenting it out (or reverting that one hunk) fully restores
  today's import-only behavior with zero data loss, since the hook never
  mutates the `meeting` row it was handed (only chat state and, later, side
  copies).
- `ChatWidget` mount in `Admin.tsx` is a single JSX line — removable without
  touching any other admin surface.

---

## 12. Open questions (could not resolve from code — flagged for owner at review)

1. `AUTO_MATCH_SCORE_THRESHOLD = 6` and `SIDE_PROJECT_SCORE_THRESHOLD = 2`
   (§4.4) are reasoned defaults derived from `routeRecording`'s own scoring
   comments, not a hard requirement found in code or the contract. Confirm
   or override at plan review.
2. `meeting.routes.ts`'s `PATCH /:id` is `requireTeam`; this plan's chat
   flows reassign `meeting.projectId` via a direct service-layer
   `db().update`, not that route, specifically so the whole feature stays
   `requireOwner`-only end to end. Confirm this is acceptable (i.e. the
   owner does not need `team`-role-initiated chat answers later).
3. `plaud-poll.service.ts`'s fallback **consumer** transport (not running in
   prod) gets no routing step and is explicitly excluded from the chat hook
   (§4.3) — confirmed acceptable per scope, but flagging since it means the
   chat widget would see zero Updates traffic if prod ever fails over to
   that transport.
4. The stale plan's §3.6 `chat_message.context` type union and this plan's
   are functionally the same shape with `recordingId` renamed `meetingId`;
   no other semantic differences were found worth flagging.

---

## 13. Resume and execution handoff

- Selected plan file (pass exactly this path to `vc-execute-agent`):
  `process/features/plaud-chat/active/plaud-chat_PLAN_18-10-26.md`.
- Execute in the dedicated worktree, branch `feat/plaud-chat`, API on port
  **6427** against local `advo_dev`, migration 057 only.
- Before EXECUTE touches `meeting-route.service.ts` or
  `plaud-poll.service.ts`, `git diff`/`git log -1` those two files first —
  the teammate may have moved lines since this research pass (18-10-26,
  6:53pm); re-anchor the exact line numbers in §4.3 if they've shifted, the
  *logic* described (one call inside the existing `if (result.created)`
  block) is what must be preserved, not the literal line numbers quoted
  above.
- After EXECUTE, this feature merges into `main` per the contract's Wave-2
  merge step — do not merge standalone without the iOS-app and MCP-phase-1
  work also landing per the contract's sequencing, unless the user
  explicitly asks for an earlier merge.
