# Meetings Scheduling + Join — Implementation Plan
**Date:** 03-09-26
**Complexity:** COMPLEX (schema migration + 4 API endpoints + 2 frontend components + calendar sync)

---

## Overview

Extend the existing meetings tab so that team members can:

1. Schedule a **future** meeting directly from the meetings tab (same dialog, same form as the calendar "add event" flow).
2. See all meetings — scheduled and recorded — in one list, sorted upcoming-first then past.
3. Press **Join / Leave** on any meeting to add or remove themselves as an attendee.
4. See the list of members who have joined a meeting.
5. See scheduled meetings appear on the calendar as a derived, read-only category.
6. Have all "Plaud"-branded UI strings relabelled **"Transcriptions"** (labels only, no internal renames).

Single source of truth: the `meeting` table. The calendar renders meetings as derived events using the exact same pattern as deliverables, invoices, projects, social posts, and contracts.

---

## Schema Decision (authoritative — do not re-litigate)

### The tension

Today `meeting.transcript` is `NOT NULL`, `meeting.project_id` is `NOT NULL` (FK + NOT NULL), and `meeting.recorded_at` is `NOT NULL`. A scheduled future meeting has no transcript yet and may have no project.

### Decision: keep `recorded_at`, add `starts_at` / `ends_at`

**Rationale:** `recorded_at` carries semantic meaning ("when was this recorded") that the Plaud import path sets explicitly from the Plaud API response (`recordedAtOf(detail)` in `plaud.service.ts` line 559). Repurposing it as "scheduled start" would corrupt that meaning for existing rows and break the Plaud import's precise timestamp. Instead:

- `starts_at` (nullable `timestamptz`) = when the meeting is scheduled to begin. For past/Plaud meetings this is NULL. For new scheduled meetings, the UI populates it. The calendar uses `starts_at` as the event `start`.
- `ends_at` (nullable `timestamptz`) = optional end time, also nullable.
- `recorded_at` stays as-is for Plaud-imported rows. For manually scheduled meetings, it defaults to `starts_at` at insert time (so the list sort `ORDER BY recorded_at DESC` still works correctly — see Step 3 below). When no `starts_at` is given on a manual create (rare: transcript-only paste), `recorded_at` keeps its current meaning.
- `transcript` becomes `NOT NULL DEFAULT ''` — keeps the column non-nullable (no migration risk on existing rows; all existing rows already have real text) but allows inserts without a transcript. The Plaud import guard (`if (!payload.transcript.trim())`) is independent and unchanged.
- `project_id` becomes **nullable** — this is the riskiest change. See Blast Radius below for every affected read path and how each is guarded.
- `location` varchar(255) nullable — added for scheduled meetings.
- `description` text nullable — agenda/notes field for scheduled meetings.

### Sort strategy for the list

The meetings tab `ORDER BY recorded_at DESC` already puts newest first. After migration, we add a secondary computed sort to show upcoming meetings at the top: `ORDER BY COALESCE(starts_at, recorded_at) ASC NULLS LAST` for the "upcoming" bucket, then `ORDER BY recorded_at DESC` for the "past" bucket. In practice: the API returns meetings ordered by `starts_at ASC NULLS LAST, recorded_at DESC` — the frontend renders upcoming (starts_at in future) first, then past below. This keeps a single flat list.

---

## Blast Radius

**Files that read `meeting.transcript` as guaranteed non-null and must be guarded:**

| File | Line(s) | Current assumption | Fix needed |
|---|---|---|---|
| `apps/api/src/routes/meeting.routes.ts` | 354 | `(row.transcript ?? "").trim()` — already safe | None |
| `apps/api/src/routes/meeting.routes.ts` | 440 | `(row.transcript ?? "").trim()` — already safe | None |
| `apps/api/src/services/plaud-import.service.ts` | 72 | `payload.transcript.trim()` — payload from Plaud API, not DB | None — this guards the import, not a DB read |
| `apps/api/src/services/meeting-task.service.ts` | 667 | `input.transcript.trim()` — called with string arg | None — caller already passes string |
| `apps/web/src/components/admin/AdminMeetings.tsx` | 553 | `!m.transcript?.trim()` — already uses optional chain | None |
| `apps/web/src/components/admin/AdminMeetings.tsx` | 581 | `{m.transcript}` inside `<pre>` — will render empty string | None |
| `apps/web/src/hooks/useMeeting.ts` | `Meeting` interface | `transcript: string` — will break TS if default '' removed | Change to `transcript: string` (still works; default '' means always a string) |

The `transcript` change (NOT NULL DEFAULT '') is safe: all existing rows have real text; Drizzle schema just needs `.default("")`; the TS type stays `string`.

**Files that read `meeting.project_id` as guaranteed non-null and must be guarded:**

| File | Line(s) | Current assumption | Fix needed |
|---|---|---|---|
| `apps/api/src/routes/meeting.routes.ts` | 188 | `INNER JOIN project ON meeting.project_id = project.project_id` (client path) | Inner join naturally excludes NULL project_id rows — client never sees projectless meetings. OK. |
| `apps/api/src/routes/meeting.routes.ts` | 260–264 | Project existence check on POST — only runs when `data.projectId` is provided | Guard: skip project lookup when `projectId` is null/absent |
| `apps/api/src/routes/meeting.routes.ts` | 335 | `projectId: meeting.projectId` — select field | OK, now typed `number \| null` |
| `apps/api/src/routes/meeting.routes.ts` | 362 | `loadGrounding(row.projectId)` in `propose-task` | Guard: `if (!row.projectId) throw 400 "No project assigned"` |
| `apps/api/src/routes/meeting.routes.ts` | 393 | `loadGrounding(row.projectId)` in `generate-task` | Same guard |
| `apps/api/src/routes/meeting.routes.ts` | 463 | `t.projectId ?? row.projectId` — uses row.projectId as fallback | Guard: `row.projectId ?? null` |
| `apps/api/src/services/plaud-import.service.ts` | 21, 44, 79 | `projectId: number` required — Plaud import always has a projectId | No change — import path already requires projectId via input |
| `apps/web/src/components/admin/AdminMeetings.tsx` | 154 | `projectTitle(m.projectId)` | Guard: `m.projectId ? projectTitle(m.projectId) : "No project"` |
| `apps/web/src/components/admin/AdminMeetings.tsx` | 168 | `projectId: String(m.projectId)` in openEdit | Guard: `projectId: m.projectId ? String(m.projectId) : ""` |
| `apps/web/src/hooks/useMeeting.ts` | `Meeting.projectId` | `projectId: number` | Change to `projectId: number \| null` |
| `apps/web/src/hooks/useMeeting.ts` | `MeetingInput.projectId` | `projectId: number` required | Change to `projectId?: number \| null` |
| `apps/web/src/components/admin/AdminMeetings.tsx` | 139 | Upload recording creates meeting with `projectId: Number(uploadProjectId)` | Upload still requires project selection — no change needed |

**Files that read `meeting.recorded_at` for ordering/display:**

| File | Line(s) | Impact | Fix |
|---|---|---|---|
| `apps/api/src/routes/meeting.routes.ts` | 191, 201, 205 | `ORDER BY recorded_at DESC` | Change to `ORDER BY COALESCE(starts_at, recorded_at) ASC NULLS LAST, recorded_at DESC` — upcoming first, then recent past |
| `apps/web/src/components/admin/AdminMeetings.tsx` | 513–514 | `fmtWhen(m.recordedAt)` — displays the recorded timestamp | Add conditional: if `m.startsAt` exists and is in future, show that as "Scheduled". Otherwise show `recordedAt` as "Recorded". |

**Total blast-radius file count: 5 backend files, 3 frontend files = 8 files** (not counting the 2 new files: migration SQL and schema entry for meeting_attendee).

---

## Touchpoints — Every File to Create or Modify

### New Files
1. `apps/api/migrations/034_meeting_scheduling_and_attendees.sql` — migration
2. (No new hooks file — extend existing `useMeeting.ts`)

### Modified Files

**Backend**
3. `apps/api/src/db/schema.ts` — add columns to `meeting` table definition; add `meetingAttendee` table
4. `apps/api/src/routes/meeting.routes.ts` — relax validators; add `startsAt`/`endsAt`/`location`/`description` to create/update schemas; fix `projectId` guards in POST/PATCH; add project-null guards in propose-task/generate-task; add `POST /:id/join` and `DELETE /:id/join`; change ORDER BY; include attendees on GET list response
5. `apps/api/src/routes/calendar.routes.ts` — add `meeting` to Promise.all parallel fetch; emit derived events with `source: "meeting"`, `category: "scheduled_meeting"`

**Frontend**
6. `apps/web/src/hooks/useMeeting.ts` — update `Meeting` and `MeetingInput` interfaces; add `startsAt`/`endsAt`/`location`/`description`/`attendees`; add `joinMeeting` and `leaveMeeting` mutations
7. `apps/web/src/hooks/useCalendar.ts` — add `"meeting"` to `CalSource` union
8. `apps/web/src/components/admin/AdminMeetings.tsx` — full form and list changes (see UI spec below)
9. `apps/web/src/components/admin/MeetingTaskPreview.tsx` — rename "Plaud note" → "transcription note", "Ask Plaud" → "Ask transcription service"
10. `apps/web/src/components/admin/AdminCalendar.tsx` — add `scheduled_meeting` to `CATEGORY` map; add `"meeting"` to `SOURCE_NOUN`

---

## Public Contracts

### New SQL table: `meeting_attendee`
```
meeting_id  bigint NOT NULL FK → meeting(meeting_id) ON DELETE CASCADE
user_id     integer NOT NULL FK → "user"(user_id) ON DELETE CASCADE
joined_at   timestamptz NOT NULL DEFAULT NOW()
PRIMARY KEY (meeting_id, user_id)   -- or unique composite index
```
Composite PK enforces uniqueness (one join per user per meeting). No separate `attendeeId` PK needed.

### New API endpoints

**POST `/api/meeting/:id/join`**
- Auth: `requireAuth` (any authenticated user — team, admin, or client can join)
- Inserts `(meetingId, user.userId, now())` into `meeting_attendee` with `ON CONFLICT DO NOTHING`
- Returns `{ data: { meetingId, userId, joinedAt }, error: null }` 201 on insert, 200 on conflict (already joined — idempotent)
- Note: `requireAuth` not `requireTeam` because the self-serve model should allow any logged-in user who can see the meeting to join. Clients should not see this UI (it's in the admin console), but the API should not be more restrictive than necessary.

**DELETE `/api/meeting/:id/join`**
- Auth: `requireAuth`
- Deletes `(meetingId, user.userId)` from `meeting_attendee`
- Returns 200 `{ data: { message: "Left meeting" }, error: null }` — 404 is fine if row was already gone (idempotent leave)

**GET `/api/meeting/` — response shape change**
Attendees are included inline on the list to avoid N+1. Use a subquery or a separate batched query (batched preferred — simpler with Drizzle):
1. Fetch all meetings (existing query)
2. Fetch all attendees for those meetingIds in one query: `WHERE meeting_id IN (...)`
3. Group attendees by meetingId, attach to each meeting row

Each meeting row gains:
```typescript
attendees: Array<{ userId: number; name: string; avatarUrl: string | null; joinedAt: string }>
```
The join: `meeting_attendee` → `user` → `team_member` (via `teamMember.userId = user.userId`) to get `name` and `avatarUrl`. The `user` table has no name field — name comes from `team_member`. If a user has no `team_member` row (e.g. a client user), fall back to `user.email`.

### Calendar event shape for meetings
```typescript
{
  id: `meeting-${meeting.meeting_id}`,
  source: "meeting",
  category: "scheduled_meeting",
  title: meeting.title,
  start: meeting.starts_at.toISOString(),   // only emitted if starts_at is not null
  end: meeting.ends_at?.toISOString() ?? null,
  allDay: false,
  projectId: meeting.project_id ?? null,
  projectTitle: null,  // not joining project table in calendar query — keep it cheap
  editable: false,
  location: meeting.location ?? null,
  description: meeting.description ?? null,
}
```
The calendar detail panel will show attendee count via `description` field if cheap, or just label it "View in Meetings". The `SOURCE_NOUN["meeting"]` value is `"the meetings tab"` so the detail footer reads "Pulled automatically from the meetings tab — manage it on its own page."

### Updated Zod schemas in `meeting.routes.ts`

`createSchema`:
```
projectId: z.number().int().optional().nullable()   // was required
title: z.string().min(1).max(255)                   // unchanged
recordedAt: z.string().datetime().optional()         // was required — keep for backward compat
startsAt: z.string().datetime().optional().nullable()
endsAt: z.string().datetime().optional().nullable()
transcript: z.string().max(500_000).optional().default("")  // was .min(1), now optional
summary: z.string().max(200_000).nullable().optional()
location: z.string().max(255).nullable().optional()
description: z.string().max(10_000).nullable().optional()
plaudShareKey: z.string().max(500).nullable().optional()
plaudFileId: z.string().max(64).nullable().optional()
isVisibleClient: z.boolean().optional()
```

Validation rule: if neither `recordedAt` nor `startsAt` is provided, throw 400 "Provide a date or scheduled time". If `startsAt` and `endsAt` are both present and `endsAt <= startsAt`, throw 400 "End must be after start". Use same `isOutOfOrder` pattern from `calendar.routes.ts`.

`updateSchema` stays `createSchema.partial()` — already correct pattern.

---

## UI Specification

### AdminMeetings.tsx — list display

**Header stat strip** (4 stats, unchanged count):
- "Meetings" → total count (unchanged)
- "Upcoming" → meetings where `startsAt` is in the future (was "Published")
- "Published" → `isVisibleClient` count
- "With transcription" → `plaudShareKey != null` count (was "With Plaud link")

**List sort**: API returns meetings in a unified order — upcoming meetings at top (sorted by `startsAt ASC` where `startsAt > now`), then past meetings (sorted by `COALESCE(starts_at, recorded_at) DESC`). The frontend renders one list with a subtle visual divider between upcoming and past if both groups are non-empty.

**List columns** (THead):
- Title (flex-1)
- Project (w-40, hidden md — same as today)
- When (w-40) — displays `startsAt` formatted as "Scheduled: Sep 5, 10:00 AM" for future, `recordedAt` formatted as "Recorded: Aug 20" for past
- Status badge (w-24) — "Upcoming" (green) / "Recorded" (muted)
- Expand chevron (w-16)

**Expanded row** — same as today, with two additions:
1. **Join / Leave button**: if `attendees` includes the current user's userId → "Leave" button; otherwise "Join" button. Both are `size="sm" variant="outline"`.
2. **Attendee list**: below the join button, a small row of `Avatar` components (reuse shadcn `Avatar`, same pattern as `AdminTeam.tsx`). Show up to 5 avatars + "+N more" text. Display member name on hover (title attribute).
3. For meetings with `transcript` that is non-empty, show the existing transcript block. For meetings with empty transcript (scheduled, not yet recorded), show a muted "No transcript yet" placeholder instead.

**Create/Edit dialog** — form changes:

FormState adds: `startsAt: string`, `endsAt: string`, `location: string`, `description: string`.
`projectId` becomes optional (no asterisk, placeholder "Project (optional)").
Transcript becomes optional (label changes from "Transcript or meeting notes" to "Transcript / notes (optional)", no `min-1` guard).
`recordedAt` is renamed in the form label to "Recorded at (optional)".

New fields in the dialog (inserted between "Project" and "Transcript"):
```
Date — datetime-local input (maps to startsAt for scheduled; also sets recordedAt if no recordedAt given)
End time — datetime-local input, optional (maps to endsAt)
Location — text input, optional (maps to location)
```

Dialog title: `form.id ? "Edit meeting" : "Schedule or record a meeting"`.

Save guard: title must be non-empty AND at least one of `startsAt` or `recordedAt` must be set. Transcript is no longer required.

**Plaud-branded strings to rename** (AdminMeetings.tsx only, labels only):

| Location | Old text | New text |
|---|---|---|
| Line 255 | `"watching Plaud ADVO"` | `"watching Transcriptions"` |
| Line 274 | `Sync Plaud` (button) | `Sync transcriptions` |
| Line 279 | `Import from Plaud` (DialogTrigger button) | `Import from Transcriptions` |
| Line 284 | `Import from Plaud` (DialogTitle) | `Import from Transcriptions` |
| Line 306 | `placeholder="Plaud file id or share URL"` | `placeholder="File id or share URL"` |
| Line 326 | `Loading Plaud…` | `Loading…` |
| Line 471 | `label="With Plaud link"` | `label="With transcription"` |
| Line 488 | `"...import from Plaud to get started."` | `"...import from Transcriptions to get started."` |
| Line 572 | `Plaud <ExternalLink>` anchor text | `Transcription <ExternalLink>` |
| Line 660 | `placeholder="Paste Plaud transcript or type minutes…"` | `placeholder="Paste transcript or type minutes…"` |

**MeetingTaskPreview.tsx — Plaud-branded strings to rename:**

| Location | Old text | New text |
|---|---|---|
| Line 16 | `"Plaud note"` | `"transcription note"` |
| Line 18 | `"Ask Plaud"` | `"ask transcription"` |

**useMeeting.ts — Plaud-branded strings to rename (toast messages):**

| Location | Old text | New text |
|---|---|---|
| Line 172 | `"Imported from Plaud"` | `"Imported from transcription service"` |
| Line 172 | `"Updated from Plaud"` | `"Updated from transcription service"` |
| Line 218 | `"Plaud note"` | `"transcription note"` |
| Line 220 | `"Ask Plaud"` | `"ask transcription"` |
| Line 290 | `"Plaud folder is up to date"` | `"Transcriptions folder is up to date"` |
| Line 295 | `title: "Plaud sync failed"` | `title: "Transcription sync failed"` |

### AdminCalendar.tsx — changes

**CATEGORY map** — add one entry:
```typescript
scheduled_meeting: { label: "Meeting", dot: "bg-violet-500" },
```
Colour: `bg-violet-500` — distinct from the manual `meeting` category (`bg-blue-500`), avoids collision with all existing categories confirmed above.

**SOURCE_NOUN** — add one entry:
```typescript
meeting: "the meetings tab",
```

**CalSource union** in `useCalendar.ts` — add `"meeting"` to the union type.

---

## Implementation Checklist

### Phase A — Database

**Step 1. Write migration SQL**
File: `apps/api/migrations/034_meeting_scheduling_and_attendees.sql`

```sql
BEGIN;

INSERT INTO schema_migration (filename) VALUES ('034_meeting_scheduling_and_attendees.sql')
  ON CONFLICT (filename) DO NOTHING;

-- Extend meeting table for scheduled meetings
ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS starts_at   timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at     timestamptz,
  ADD COLUMN IF NOT EXISTS location    varchar(255),
  ADD COLUMN IF NOT EXISTS description text;

-- Make transcript optional (keep NOT NULL, add empty-string default)
ALTER TABLE meeting
  ALTER COLUMN transcript SET DEFAULT '';

-- Make project_id nullable (existing rows all have a project; backfill not needed)
ALTER TABLE meeting
  ALTER COLUMN project_id DROP NOT NULL;

-- Index on starts_at for calendar range queries
CREATE INDEX IF NOT EXISTS idx_meeting_starts_at ON meeting (starts_at)
  WHERE starts_at IS NOT NULL;

-- Attendee join table
CREATE TABLE IF NOT EXISTS meeting_attendee (
  meeting_id  bigint  NOT NULL REFERENCES meeting(meeting_id) ON DELETE CASCADE,
  user_id     integer NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
  joined_at   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendee_user ON meeting_attendee (user_id);

COMMENT ON TABLE meeting_attendee IS
  'Self-serve attendance: any authenticated user may join or leave a meeting. Composite PK prevents duplicate joins.';
COMMENT ON COLUMN meeting.starts_at IS
  'Scheduled start time for future meetings. NULL on Plaud-imported / paste-in past records. Used as calendar event start.';
COMMENT ON COLUMN meeting.ends_at IS
  'Optional end time for scheduled meetings. NULL when open-ended.';
COMMENT ON COLUMN meeting.transcript IS
  'Full meeting transcript. Empty string (not NULL) for scheduled meetings with no transcript yet.';

COMMIT;
```

Verification: `psql $DATABASE_URL -c "\d meeting"` shows `starts_at`, `ends_at`, `location`, `description` columns and `project_id` without NOT NULL. `\d meeting_attendee` shows composite PK.

---

**Step 2. Update Drizzle schema**
File: `apps/api/src/db/schema.ts`

In the `meeting` table definition:
- `transcript`: change to `.notNull().default("")`
- `projectId`: remove `.notNull()` (make it `integer("project_id").references(...)` only)
- Add after `plaudShareKey`:
  ```
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: varchar("location", { length: 255 }),
  description: text("description"),
  ```
- Add to the indexes array: `index("idx_meeting_starts_at").on(t.startsAt)`

Add new table after `meeting`:
```typescript
export const meetingAttendee = pgTable(
  "meeting_attendee",
  {
    meetingId: bigint("meeting_id", { mode: "number" }).notNull()
      .references(() => meeting.meetingId, { onDelete: "cascade" }),
    userId: integer("user_id").notNull()
      .references(() => user.userId, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.userId] }),
    index("idx_meeting_attendee_user").on(t.userId),
  ]
);
```

Export `meetingAttendee` alongside existing exports.

Verification: `cd apps/api && npx tsc --noEmit` passes with 0 errors.

---

### Phase B — Backend API

**Step 3. Update meeting.routes.ts — create/update schema and validators**

3a. Add `startsAt`, `endsAt`, `location`, `description` to `createSchema`. Make `projectId` optional. Make `transcript` optional (default `""`). Make `recordedAt` optional. Add `.superRefine` for start/end ordering and "must have at least one date" rule.

3b. Import `meetingAttendee` from schema.

3c. Import `sql` from drizzle-orm (or `gte`, `lt` — check what is already imported) for the future/past sort.

3d. Fix POST `/` handler:
- Project lookup: only run if `data.projectId` is provided and non-null.
- Set `recordedAt = data.recordedAt ? new Date(data.recordedAt) : (data.startsAt ? new Date(data.startsAt) : new Date())` — ensures sort column is always set.
- Insert `startsAt`, `endsAt`, `location`, `description`.

3e. Fix PATCH `/:id` handler:
- Apply same pattern for `startsAt`, `endsAt`, `location`, `description`, `recordedAt`.
- Project lookup guard: only run when `data.projectId` is defined and not null.

3f. Fix `propose-task` (line 362) and `generate-task` (line 393):
- After `loadMeetingForTask`, add: `if (!row.projectId) throw new HTTPException(400, { message: "Assign a project before generating tasks." });`

3g. Fix `generate-task` line 463: `t.projectId ?? row.projectId` — add null handling.

3h. Change ORDER BY in all three GET paths from `desc(meeting.recordedAt)` to use Drizzle's `sql` expression or `asc(meeting.startsAt)` — pragmatic approach: sort by `COALESCE(starts_at, recorded_at) DESC NULLS LAST` in SQL raw expression if Drizzle does not support COALESCE in orderBy natively. Simpler: fetch and sort in JS since this is a small table: remove the `.orderBy()` and sort in JS: upcoming (startsAt in future) first ascending, then past descending. If the table grows large, add a DB index later. **Decision: sort in JS** to avoid a `sql` template tag import and keep Drizzle type-safe. After query, in the team/admin path sort with: `rows.sort((a, b) => { ... })` — see Step 3h note below.

Sort function logic:
```
const now = Date.now();
const keyOf = (r) => r.startsAt ? new Date(r.startsAt).getTime() : new Date(r.recordedAt).getTime();
const isUpcoming = (r) => r.startsAt && new Date(r.startsAt).getTime() > now;
rows.sort((a, b) => {
  const aUp = isUpcoming(a), bUp = isUpcoming(b);
  if (aUp && !bUp) return -1;
  if (!aUp && bUp) return 1;
  if (aUp && bUp) return keyOf(a) - keyOf(b);   // upcoming: soonest first
  return keyOf(b) - keyOf(a);                    // past: newest first
});
```

3i. Attendees inline on GET response: after fetching `rows`, fetch all attendees for those meetingIds in one batched query. Join to `teamMember` via `user.userId`. Group by meetingId. Attach `attendees` array to each row.

Exact query:
```typescript
const ids = rows.map(r => r.meetingId);
let attendeeMap: Map<number, AttendeeRow[]> = new Map();
if (ids.length > 0) {
  const atts = await d
    .select({
      meetingId: meetingAttendee.meetingId,
      userId: meetingAttendee.userId,
      joinedAt: meetingAttendee.joinedAt,
      name: teamMember.name,
      avatarUrl: teamMember.avatarUrl,
      email: user.email,
    })
    .from(meetingAttendee)
    .innerJoin(user, eq(meetingAttendee.userId, user.userId))
    .leftJoin(teamMember, eq(teamMember.userId, user.userId))
    .where(inArray(meetingAttendee.meetingId, ids));
  for (const a of atts) {
    if (!attendeeMap.has(a.meetingId)) attendeeMap.set(a.meetingId, []);
    attendeeMap.get(a.meetingId)!.push({
      userId: a.userId,
      name: a.name ?? a.email ?? `User #${a.userId}`,
      avatarUrl: a.avatarUrl ?? null,
      joinedAt: a.joinedAt.toISOString(),
    });
  }
}
const response = rows.map(r => ({
  ...r,
  attendees: attendeeMap.get(r.meetingId) ?? [],
}));
```

Import `inArray` from `drizzle-orm`. Import `user` and `teamMember` from schema (both already imported in the file — confirm line 7 shows `teamMember`; it does).

Verification: `npx tsc --noEmit` from `apps/api`. Then `curl http://localhost:4000/api/meeting -H "Authorization: Bearer <token>"` returns array with `attendees: []` on each meeting.

---

**Step 4. Add join/leave endpoints**

After the DELETE `/:id` handler (line ~325), add:

```typescript
// POST /api/meeting/:id/join — self-serve join
meetingRoutes.post("/:id/join", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });
  const user = c.get("user");

  // Confirm meeting exists
  const [row] = await db().select({ meetingId: meeting.meetingId })
    .from(meeting).where(eq(meeting.meetingId, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: "Meeting not found" });

  await db().insert(meetingAttendee).values({
    meetingId: id,
    userId: user.userId,
  }).onConflictDoNothing();

  return c.json({ data: { meetingId: id, userId: user.userId }, error: null }, 201);
});

// DELETE /api/meeting/:id/join — self-serve leave
meetingRoutes.delete("/:id/join", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });
  const user = c.get("user");

  await db().delete(meetingAttendee)
    .where(and(
      eq(meetingAttendee.meetingId, id),
      eq(meetingAttendee.userId, user.userId),
    ));

  return c.json({ data: { message: "Left meeting" }, error: null });
});
```

Note: join/leave routes must be registered BEFORE `/:id` catch-all handlers, or after them with a specific path. Since `/:id/join` is more specific than `/:id`, Hono matches it correctly if registered before `/:id`. Confirm Hono path-matching order: Hono matches routes in registration order, so register `/:id/join` POST and DELETE BEFORE the generic `/:id` PATCH and DELETE. **Reorder if needed.**

Verification: `curl -X POST http://localhost:4000/api/meeting/1/join -H "Authorization: Bearer <token>"` returns 201. Second call returns 201 (idempotent). `curl -X DELETE .../join` returns 200.

---

**Step 5. Update calendar.routes.ts — add meeting derived events**

5a. Import `meeting`, `meetingAttendee` from schema. Import `isNotNull` from drizzle-orm (may already be there).

5b. Add `meeting` to the `CalEvent.source` type comment (TypeScript type is in `useCalendar.ts` on the frontend; backend `CalEvent` interface line 41 is the authoritative shape).

5c. Add backend `CalEvent` interface `source` value: `"meeting"` — add to the union on line 43.

5d. In the `Promise.all` on line 84, add a 7th parallel query:
```typescript
d.select({
  id: meeting.meetingId,
  title: meeting.title,
  startsAt: meeting.startsAt,
  endsAt: meeting.endsAt,
  projectId: meeting.projectId,
  location: meeting.location,
  attendeeCount: sql<number>`(SELECT COUNT(*) FROM meeting_attendee WHERE meeting_id = ${meeting.meetingId})`,
})
.from(meeting)
.where(
  and(
    isNotNull(meeting.startsAt),
    lte(meeting.startsAt, end),
    or(isNull(meeting.endsAt), gte(meeting.endsAt, start)),
    or(gte(meeting.startsAt, start), gte(meeting.endsAt, start)),
  )
),
```

Actually, the attendee count subquery in the SELECT complicates drizzle type inference. Simplify: omit attendee count from calendar — just show meeting title. If the user wants to see attendees they click through to meetings tab.

Simplified query:
```typescript
d.select({
  id: meeting.meetingId,
  title: meeting.title,
  startsAt: meeting.startsAt,
  endsAt: meeting.endsAt,
  projectId: meeting.projectId,
  location: meeting.location,
})
.from(meeting)
.where(
  and(
    isNotNull(meeting.startsAt),
    lte(meeting.startsAt, end),
    or(isNull(meeting.endsAt), gte(meeting.endsAt, start)),
  )
),
```

5e. Add loop to emit meeting events after the contract loop:
```typescript
for (const mt of meetings) {
  if (!mt.startsAt) continue;
  events.push({
    id: `meeting-${mt.id}`,
    source: "meeting",
    category: "scheduled_meeting",
    title: mt.title,
    start: mt.startsAt.toISOString(),
    end: mt.endsAt ? mt.endsAt.toISOString() : null,
    allDay: false,
    projectId: mt.projectId ?? null,
    projectTitle: null,
    editable: false,
    location: mt.location ?? null,
    description: null,
  });
}
```

5f. Destructure `meetings` from the `Promise.all` result alongside `contractRows`.

Verification: `curl "http://localhost:4000/api/calendar?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z" -H "Authorization: Bearer <token>"` — response includes entries with `source: "meeting"` and `category: "scheduled_meeting"` for any meetings with `startsAt` in range.

---

### Phase C — Frontend Hooks

**Step 6. Update `apps/web/src/hooks/useMeeting.ts`**

6a. Extend `Meeting` interface:
```typescript
projectId: number | null;        // was: number
startsAt: string | null;
endsAt: string | null;
transcript: string;              // stays string (default '' from DB)
location: string | null;
description: string | null;
attendees: Array<{
  userId: number;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
}>;
```

6b. Extend `MeetingInput` interface:
```typescript
projectId?: number | null;       // now optional
startsAt?: string | null;
endsAt?: string | null;
location?: string | null;
description?: string | null;
```

6c. Rename toast strings per Plaud → Transcriptions table above (lines 172, 172, 218, 220, 290, 295).

6d. Add join/leave mutations after `generateTaskMutation`:
```typescript
const joinMutation = useMutation({
  mutationFn: async (id: number) => {
    const r = await post(`/api/meeting/${id}/join`, {});
    if (r.error) throw new Error(r.error);
  },
  onSuccess: () => { invalidate(); toast({ title: "Joined meeting" }); },
  onError: onErr,
});

const leaveMutation = useMutation({
  mutationFn: async (id: number) => {
    const r = await del(`/api/meeting/${id}/join`);
    if (r.error) throw new Error(r.error);
  },
  onSuccess: () => { invalidate(); toast({ title: "Left meeting" }); },
  onError: onErr,
});
```

6e. Add to return object:
```typescript
joinMeeting: joinMutation.mutateAsync,
leaveMeeting: leaveMutation.mutateAsync,
isJoining: joinMutation.isPending || leaveMutation.isPending,
```

6f. Update `useCalendar.ts` — add `"meeting"` to `CalSource` union:
```typescript
export type CalSource =
  | "manual"
  | "deliverable"
  | "invoice"
  | "project"
  | "social"
  | "contract"
  | "compliance"
  | "meeting";  // ← add
```

Verification: `cd apps/web && npx tsc --noEmit` — 0 errors.

---

### Phase D — Frontend Components

**Step 7. Update `AdminMeetings.tsx`**

7a. **FormState** — add fields:
```typescript
interface FormState {
  id: number | null;
  projectId: string;       // stays string (empty = no project)
  title: string;
  recordedAt: string;      // datetime-local — for past/transcript
  startsAt: string;        // datetime-local — for scheduled
  endsAt: string;          // datetime-local
  location: string;
  transcript: string;
}
```

`emptyForm()`:
```typescript
const emptyForm = (): FormState => ({
  id: null, projectId: "", title: "", recordedAt: "", startsAt: "", endsAt: "", location: "", transcript: "",
});
```

7b. **openEdit** — map `m.startsAt` and `m.endsAt` to `toLocalInput` in addition to `recordedAt`.

7c. **handleSave** — relax guard: require `form.title.trim()` and at least one of `form.startsAt` or `form.recordedAt`. Remove transcript requirement. Build `MeetingInput` with optional fields.

7d. **handleDelete** — no change.

7e. **Import** `useAuth` to get current user's `userId` for join/leave button state. Add `isJoining` destructuring from `useMeeting`. Add `joinMeeting`, `leaveMeeting`.

7f. **PageHeader meta** — update: change `meeting.length + " meeting note" + (plural)` to `meeting.length + " meeting" + (plural)`. Update Plaud-watching string per rename table above.

7g. **Header action buttons** — rename per table above ("Sync Plaud" → "Sync transcriptions", "Import from Plaud" → "Import from Transcriptions"). Dialog title rename. Input placeholder rename.

7h. **StatStrip** — 4 stats:
- "Meetings" (total)
- "Upcoming" (`meeting.filter(m => m.startsAt && new Date(m.startsAt) > new Date()).length`)
- "Published" (`isVisibleClient` count)
- "With transcription" (`plaudShareKey` count — was "With Plaud link")

7i. **THead** — add "Status" column (w-24) between "Recorded" and chevron. Keep existing columns.

7j. **TRow per meeting** — add status badge: if `m.startsAt && new Date(m.startsAt) > Date.now()` → `<span class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Upcoming</span>`, else `<span class="text-xs text-muted-foreground">Recorded</span>`. The "When" column: if upcoming show `startsAt`, else show `recordedAt`, both via `fmtWhen`.

7k. **Visual divider** — in the list, if both upcoming and past groups exist, insert a `<div className="px-4 py-1 text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border">Past meetings</div>` between the last upcoming and first past meeting. This requires sorting the `meeting` array on the frontend to identify the boundary.

Add a computed `{ upcoming, past }` split:
```typescript
const { upcoming, past } = useMemo(() => {
  const now = Date.now();
  const u: Meeting[] = [], p: Meeting[] = [];
  for (const m of meeting) {
    if (m.startsAt && new Date(m.startsAt).getTime() > now) u.push(m);
    else p.push(m);
  }
  u.sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime());
  return { upcoming: u, past: p };
}, [meeting]);
```

Render `[...upcoming, ...past]` with divider between groups.

7l. **Expanded row — Join/Leave button** — below the action buttons row:
```tsx
<div className="flex items-center gap-2">
  <Button
    size="sm"
    variant="outline"
    className="h-8"
    disabled={isJoining}
    onClick={() => {
      const alreadyJoined = m.attendees.some(a => a.userId === user?.userId);
      void (alreadyJoined ? leaveMeeting(m.meetingId) : joinMeeting(m.meetingId));
    }}
  >
    {m.attendees.some(a => a.userId === user?.userId) ? "Leave" : "Join"}
  </Button>
  {m.attendees.length > 0 && (
    <div className="flex items-center gap-1">
      {m.attendees.slice(0, 5).map(a => (
        <Avatar key={a.userId} className="h-6 w-6" title={a.name}>
          <AvatarImage src={a.avatarUrl ?? undefined} alt={a.name} />
          <AvatarFallback className="text-[10px]">{a.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      ))}
      {m.attendees.length > 5 && (
        <span className="text-xs text-muted-foreground">+{m.attendees.length - 5}</span>
      )}
    </div>
  )}
</div>
```

Import `Avatar`, `AvatarImage`, `AvatarFallback` from `@/components/ui/avatar`.

7m. **Transcript block** — wrap in conditional: if `m.transcript.trim()` render the existing `<pre>`. Else render `<p className="text-sm text-muted-foreground italic">No transcript yet.</p>`.

7n. **Plaud external link anchor** — rename text "Plaud" → "Transcription" (line 572).

7o. **Dialog** — add `startsAt`, `endsAt`, `location` inputs. Make projectId Select optional (no required asterisk). Make transcript Textarea optional. Rename labels per above. Change Save button disabled guard. Rename dialog title.

7p. **Save button disabled guard** update:
```typescript
disabled={
  isSaving ||
  !form.title.trim() ||
  (!form.startsAt && !form.recordedAt)
}
```

7q. **Import `useAuth`** at top. Destructure `user` from `useAuth()` for join/leave button state.

Dark mode / light mode note: Avatar fallbacks use `text-[10px]` with `bg-secondary` default from shadcn — legible in both modes. The status badge `text-emerald-600 dark:text-emerald-400` explicitly handles both modes.

Mobile note: the new Join/Leave button and avatar strip sit in the expanded row, which is full-width. Avatar size `h-6 w-6` is touch-comfortable. The dialog inputs are all `h-9` consistent with existing fields.

---

**Step 8. Update `MeetingTaskPreview.tsx`**

Change `viaLabel` function:
- `"note"` case: `"Plaud note"` → `"transcription note"`
- `"ask"` case: `"Ask Plaud"` → `"ask transcription service"`

(Two lines changed, same file.)

---

**Step 9. Update `AdminCalendar.tsx`**

9a. Add to `CATEGORY` map (after `compliance_deadline`):
```typescript
scheduled_meeting: { label: "Meeting (scheduled)", dot: "bg-violet-500" },
```

9b. Add to `SOURCE_NOUN` map:
```typescript
meeting: "the meetings tab",
```

9c. The detail panel for `source: "meeting"` events is read-only (editable: false). The existing "Pulled automatically from..." message uses `SOURCE_NOUN[detail.source]` which now returns "the meetings tab". The link does not need to be interactive for V1 — the text is sufficient. (Deep-link is a later enhancement if needed.)

---

**Step 10. Update `useCalendar.ts`**

Add `"meeting"` to `CalSource` union (Step 6f above — done in Phase C).

---

### Phase E — Integration Verification

**Step 11. TypeScript typecheck — full monorepo**
```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors. Fix any remaining type errors before proceeding.

**Step 12. Manual smoke test — scheduled meeting creation**
1. Open meetings tab. Click "Schedule or record a meeting".
2. Enter title "Q4 Kickoff", set Start to tomorrow 10:00 AM, End 11:00 AM, Location "Zoom", no project, no transcript.
3. Save. Meeting appears at top of list with "Upcoming" badge and tomorrow's date.
4. Open calendar, navigate to tomorrow's date. Meeting chip appears with violet dot and "Meeting (scheduled)" legend entry.
5. Click meeting chip in calendar. Detail panel shows title, source = "the meetings tab".

**Step 13. Manual smoke test — join / leave**
1. On the meetings tab, expand the Q4 Kickoff meeting.
2. Click "Join". Avatar appears. Button changes to "Leave".
3. Click "Leave". Avatar disappears. Button resets to "Join".
4. Log in as a second user (if available). Both users join. Both avatars appear.

**Step 14. Manual smoke test — Plaud import still works**
1. Open "Import from Transcriptions" dialog. Confirm no 500 errors.
2. Import a real or test Plaud file. Meeting appears in list with transcript, Plaud share link still shows as "Transcription <ExternalLink>".
3. Confirm "Sync transcriptions" button still works.
4. Confirm propose-task / generate-task on a meeting with transcript still works.
5. Confirm propose-task on a meeting WITHOUT transcript shows 400 "Meeting has no transcript or note to generate tasks from".

**Step 15. Manual smoke test — existing recorded meeting editing**
1. Click edit on a pre-existing meeting (has transcript, has project, has recordedAt).
2. Verify form pre-fills correctly (recordedAt in the "Recorded at" field, startsAt empty).
3. Save with no changes. Confirm no regression.

**Step 16. Regression — propose-task on projectless meeting**
1. Create a meeting with no project assigned.
2. Expand it, click "Generate tasks".
3. Confirm 400 toast: "Assign a project before generating tasks."

**Step 17. Check dark mode**
Open the meetings tab in dark mode. Confirm:
- "Upcoming" badge: `text-emerald-400` is visible on dark background.
- Avatar fallbacks are legible.
- "No transcript yet" placeholder is `text-muted-foreground` (legible in both modes).
- Violet dot for scheduled_meeting category in calendar legend is distinct and visible.

**Step 18. Check mobile**
On a 390px viewport:
- Meetings list columns: Title (flex-1) and When (w-40) visible; Project hidden (hidden md:block). Status badge (w-24) visible.
- Expanded row: Join button and avatar strip wrap if needed (flex-wrap).
- Dialog: all inputs stack vertically, no horizontal overflow.

---

## Failure Modes and Mitigations

| Failure | Mitigation |
|---|---|
| `ALTER COLUMN project_id DROP NOT NULL` fails (e.g. constraint check on existing data) | All existing rows have non-null project_id — no constraint violation possible. Confirm with `SELECT COUNT(*) FROM meeting WHERE project_id IS NULL` before running migration. |
| Attendee JOIN to teamMember returns NULL for client users | The attendee query uses `LEFT JOIN teamMember` and falls back to `user.email` for the name. Client users will show their email as display name. |
| `inArray` with empty array `ids` crashes Drizzle | Guard: `if (ids.length === 0) skip attendee query`. Already in Step 3i. |
| Plaud import inserts with `transcript` as `""` when Plaud returns empty string | The import guard (`if (!payload.transcript.trim())`) already throws 422 before insert — unchanged. |
| Calendar query `and(isNotNull(meeting.startsAt), ...)` — Drizzle handles nullable column correctly | Confirmed: Drizzle's `isNotNull` emits `WHERE starts_at IS NOT NULL` — safe. |
| Route ordering: `/:id/join` vs `/:id` catch | Hono matches by registration order. Register `/:id/join` POST and DELETE BEFORE `/:id` PATCH and DELETE. If already after, move them. Verify with a test call. |
| Soft sort in JS for large meeting tables | The table is expected to have O(100-500) rows for this agency. JS sort is fine. Add a DB-side sort migration later if needed. |
| White-on-white bug (prior history) | All new badge text uses explicit `dark:` variant. Avatar fallback inherits shadcn defaults which are already tested. Violet dot uses `bg-violet-500` which is clearly visible in light mode. |

---

## Rollback

The migration is backward-compatible in both directions:

- **Forward**: new columns are nullable/have defaults. Old code reading `meeting` rows still works (it ignores unknown columns).
- **Rollback**: `ALTER TABLE meeting ALTER COLUMN transcript DROP DEFAULT; ALTER TABLE meeting ALTER COLUMN project_id SET NOT NULL; DROP TABLE meeting_attendee; ALTER TABLE meeting DROP COLUMN starts_at; DROP COLUMN ends_at; DROP COLUMN location; DROP COLUMN description;` — safe to run before any data is written to the new columns.
- No existing data is modified or deleted by the migration.

---

## Open Questions

**Q1: Should client users be able to join meetings?**
The endpoints use `requireAuth` (not `requireTeam`) so clients can call join/leave. The Join/Leave UI is in the admin console which clients cannot access — so in practice they cannot join. But if a client-facing view is added later, join would work. The current choice is deliberately permissive at the API level. If you want to restrict to team only, change both join/leave endpoints to `requireTeam`.

**Q2: Should attendee count appear on calendar chips?**
Not in V1 — would require a correlated subquery per chip and complicates the Drizzle SELECT. Deferred.

**Q3: Should clicking a meeting in the calendar navigate to the meetings tab?**
The plan implements a read-only detail panel with a footer note "manage it on its own page". A router link to `/admin/meetings` from the calendar detail is a one-line change and can be added as a follow-up without a plan change.

**Q4: The `recordedAt` field remains in the form as "Recorded at (optional)". Should it be hidden for scheduled meetings?**
The form shows both `startsAt` ("Date") and `recordedAt` ("Recorded at") as independent inputs. For simplicity, show both. A future UX pass can hide `recordedAt` when `startsAt` is set and the meeting is in the future.

---

## Resume and Execution Handoff

**Plan file:** `/Users/princewagan/advo-1/process/general-plans/active/meetings-scheduling-join_PLAN_03-09-26.md`

**Entry point for EXECUTE:** Start at Step 1 (migration SQL). Do not skip Phase A before touching backend code — the schema change must be applied to the database before the API starts using the new columns.

**Phase gates:**
- After Step 2: `npx tsc --noEmit` from `apps/api` must pass.
- After Step 5: `npx tsc --noEmit` from `apps/api` must pass.
- After Step 6: `npx tsc --noEmit` from `apps/web` must pass.
- After Step 9: `npx tsc --noEmit` from `apps/web` must pass.
- After Step 11: both pass with 0 errors before any manual testing begins.

**Do not modify:**
- `apps/api/src/services/plaud-import.service.ts` — unchanged by this plan
- `apps/api/src/services/plaud.service.ts` — unchanged
- `apps/api/src/services/plaud-poll.service.ts` — unchanged
- `apps/api/src/services/meeting-task.service.ts` — unchanged
- `apps/api/src/services/transcription.service.ts` — unchanged
- Any API route names, DB column names with `plaud` prefix, env vars

**Files touched (summary):**
1. `apps/api/migrations/034_meeting_scheduling_and_attendees.sql` (new)
2. `apps/api/src/db/schema.ts`
3. `apps/api/src/routes/meeting.routes.ts`
4. `apps/api/src/routes/calendar.routes.ts`
5. `apps/web/src/hooks/useMeeting.ts`
6. `apps/web/src/hooks/useCalendar.ts`
7. `apps/web/src/components/admin/AdminMeetings.tsx`
8. `apps/web/src/components/admin/MeetingTaskPreview.tsx`
9. `apps/web/src/components/admin/AdminCalendar.tsx`

Total: 9 files (1 new, 8 modified).

**Verification commands:**
```bash
# Apply migration (run from project root or apps/api)
psql $DATABASE_URL -f apps/api/migrations/034_meeting_scheduling_and_attendees.sql

# TypeScript check
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# Run API dev server and confirm no startup crash
cd apps/api && npm run dev

# Run web dev server and open meetings tab
cd apps/web && npm run dev
```
