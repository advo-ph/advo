# Free Time / Free Members Redesign + Block Type Cleanup

**Date**: 19-10-26
**Mode**: FAST (RESEARCH + INNOVATE + PLAN in one pass)
**Status**: EXECUTED 19-10-26 (two execute runs; the first stopped on a rate limit, the
second resumed from the working tree). Code complete, migration 060 applied to LOCAL
`advo_dev` only. Not committed, not deployed, production untouched. See "Approved
amendments" and "Execution log" at the end of this file — they override the sections
above where they differ.

## Harness note (research finding)

This repo's `CLAUDE.md` references `process/context/`, `process/development-protocols/`,
and `.claude/skills/`. None of these exist in this working tree (`process/` only has
`features/` and `general-plans/`; `.claude/` only has `worktrees/`). This plan was
written from direct source inspection instead of those routing docs. Using
`process/general-plans/active/` per the fallback rule, since `process/features/
admin-simplify/` is about projects/finance/deliverables (phase-01..11), not Availability,
and no `admin-availability` feature folder exists.

---

## Scope (final, after the mid-task update)

1. **Search mode** in the "Find free time" popup becomes 2 options: **Free Time** and
   **Free Members** (the old work/empty toggle is removed).
2. **Free Time** mode = today's UI, but: 12-hour time labels, and a new "majority free"
   tier (labelled with who's missing) ranked below "everyone free".
3. **Free Members** mode = pick a start/end datetime, selected members are grouped into
   Available / Will be late / May be late / Not available.
4. **Block types become 3**: `school`, `meeting` (new), `unavailable`. `work` and
   `break` are removed everywhere (web, API, DB, MCP, docs, tests).
5. Existing data: delete `work` rows; convert `break` rows to `unavailable`; convert an
   **explicit, user-approved list** of `unavailable` rows that look like ADVO meetings
   into `meeting`.

---

## Research findings

**Main file**: `apps/web/src/components/admin/AdminAvailability.tsx` (1067 lines) — the
only consumer of `useAdminAvailability` / `AvailabilityBlock` in the web app. No other
component touches block types.

**12-hour formatting**: no existing shared 12h formatter. The grid already has a local
`hourLabel(hour)` in `AdminAvailability.tsx` (`"6pm"`, `"12am"`). `apps/web/src/lib/
manila-time.ts` has `minutesToTime` (24h `"HH:MM"`) but nothing minute-precision 12h.
Plan: add one minute-precision 12h formatter to `manila-time.ts` (shared, testable) and
reuse it for both the grid hour labels and the new slot rendering.

**DB constraint**: `availability_block.block_type` is `VARCHAR(20)`, not a Postgres enum,
CHECKed by `chk_availability_block_type` in `apps/api/migrations/031_availability_block_
bounds.sql`: `CHECK (block_type IN ('school', 'break', 'work', 'unavailable'))`. Default
is `'work'`. This is the constraint the new migration rewrites.

**Local DB** (read-only queries against `advo_dev` on `localhost:5432`, the same DB the
locally running API on port 6417 is using per `apps/api/.env`
`DATABASE_URL=postgresql://advo:changeme@localhost:5432/advo_dev` — confirmed live via
`GET /api/health`, `nodeEnv: "development"`). **Production is a separate host and is not
touched by this plan**; the migration only runs locally until the user deploys.

Row counts today:
- `work`: **6** rows (Prince ×5, Keira ×1)
- `break`: **0** rows
- `unavailable`: **3** rows — `Prince Wagan` Mon 17:00–18:00 (no label), `Kenneth Dela
  Cruz` Wed 18:00–00:00 "Busy", `Kenneth Dela Cruz` Thu 00:00–00:00 "Busy"

**Unavailable → meeting candidates**: **none**. All 3 `unavailable` rows have no label or
a generic "Busy" label — nothing matches "ADVO", "meeting", "sync", "standup", "huddle",
or "call". The migration converts **zero rows** by explicit `block_id` list (empty list
today; re-run the same read-only query before EXECUTE in case rows changed, and add any
IDs the user confirms).

**Calendar events are not tied to specific team members**: `GET /api/calendar`'s
`CalEvent` shape (`apps/api/src/routes/calendar.routes.ts`) has no attendee/member field
on `source: "meeting"` rows — it's drawn from the `meeting` table (`title`, `startsAt`,
`endsAt`, `projectId`, `location`) with no join to `meeting_member` (058) or
`meeting_attendee` (041). So a dated calendar/meeting booking cannot be reliably
attributed to one of the selected people today. **Free Members mode will use only each
person's own `availability_block` rows** (school/meeting/unavailable, recurring +
one-off via `blockAppliesOn`) as their busy source — see Open Decision 2.

**Capacity view is unaffected**: `apps/web/src/lib/capacity.ts` and `apps/api/src/
utils/project-capacity.ts` compute capacity from **active project count per member**
(`projectCountByMember`, `capacityRemaining`), not from availability blocks. The
"capacity" text on the Availability page header (line ~679) is a static subtitle, not
logic. Removing `work`/`break` breaks nothing here. `AdminCalendar.tsx`'s school/
unavailable "blackout" layer (commit `aaaef61`) also only needs `school` and
`unavailable`, both of which survive.

**MCP / owner chat**: `apps/api/src/services/mcp-tools.service.ts`'s `list_availability`
tool and `apps/api/src/services/connector.service.ts`'s calendar-adapter comment are
type-agnostic (they return/describe raw rows, no `'work'`/`'break'` literal). No code
change needed there; one comment in `connector.service.ts` and one row in `docs/
SCHEMA.md` name the old 4 types in prose and should be updated for accuracy.

**Tests**: no dedicated `AdminAvailability` test file exists. Two integration tests hardcode
`blockType: "work"` as a throwaway valid value (`apps/web/src/test/
calendar-scheduling.test.ts` lines 264, 283) — swap to `"unavailable"`. `apps/web/src/
test/api-wiring.test.ts` already uses `"school"`, untouched. `capacity.test.ts` tests the
project-count helpers directly, unaffected.

**No `.claude/skills/` directory exists in this repo** (`vc-frontend-design`,
`vc-scenario`, `vc-chrome-devtools` are not installed here), so EXECUTE will do manual
responsive QA (resize to 1440px/390px in a browser against the local dev server) instead
of an automated skill-driven screenshot pass.

---

## Approach (brief)

**Free Time majority tier** — sweep-line per day, as the user proposed: for each day,
build each selected member's free ranges (base `GRID_START..1440` minus their
`school`/`meeting`/`unavailable` blocks for that day), then sweep all members' free-range
boundaries together into elementary segments, each tagged with its set of *busy* members
for that segment. Keep a segment if busy-count is 0 (everyone free) or busy-count <
half of selected (majority free, strictly more than half free — Open Decision 4). Merge
adjacent segments with the same busy-set, drop anything under `MIN_FREE_SLOT_MINUTES`,
then subtract dated calendar bookings from the "everyone free" tier only (majority tiers
keep whoever's busy-set already excludes the booking's effect per-member — see plan
note below). Render "everyone free" slots first, then "Majority except X, Y" slots,
each in 12h format.

**Free Members mode** — plain start/end `<input type="datetime-local">` (works at 390px;
defaults to next full hour today, 1 hour long). For each selected member, compute their
busy ranges that day from `availability_block` (recurring + one-off), then classify:
- **Available**: no busy range overlaps `[start, end]` and nothing ends in `(start-30min,
  start]`.
- **Will be late**: busy at `start` (a range covers it) or a range ends exactly at `start`.
- **May be late**: a range ends in `(start-30min, start)` (gap > 0 and ≤ 30 min).
- **Not available**: late by ≥ 25% of meeting duration (covers "busy in the middle/end" —
  Open Decision 1) or has an overlapping range that pushes them past that threshold.

This is one design, not three alternatives — the user already specified the rules in
the task; INNOVATE here is about *where* the logic lives (small pure helpers next to the
existing `merge`/`intersect`/`subtract` functions in `AdminAvailability.tsx`, following
the file's existing pattern of pure Range functions above the component, same as today)
rather than a new abstraction layer. Rejected: pushing this into a new `lib/
free-time.ts` module — rejected only because the file's existing convention keeps all of
this colocated and it is not yet reused elsewhere; flagged as a follow-up if a second
consumer appears.

---

## Open Decisions (max 4)

1. **Busy in the middle/end of the meeting, not at the start** — (a) **Not available**
   (treat as too disruptive to count as "available", same bucket as ≥25% late) vs. (b)
   a separate "Partially busy" bucket. **Pick: (a) Not available** — matches the user's
   own lean and keeps the UI to 4 buckets.
2. **Free Members busy source**, since calendar events aren't attributable to a person —
   (a) **use only `availability_block`** (school/meeting/unavailable) as busy, ignore
   dated calendar/meeting bookings entirely vs. (b) treat any dated calendar booking in
   the window as busy for every selected person (conservative, but wrongly flags people
   who have nothing to do with that booking). **Pick: (a)** — accuracy over false
   positives; wiring real per-person meeting attendance into this is a follow-up that
   needs an API change (join `meeting_member` into `GET /api/calendar` or a new
   endpoint), out of this plan's blast radius.
3. **New form default `block_type`** — (a) **`unavailable`** vs. (b) `meeting`. **Pick:
   (a) `unavailable`** — it's the more neutral "something is happening" default; defaulting
   every new block to `meeting` would mislabel school/personal blocks that get saved
   before the user picks a type.
4. **Majority definition** — (a) **strictly more than half** of selected people free (a
   50/50 split shows nothing unless everyone's free) vs. (b) half-or-more (ties count as
   majority). **Pick: (a)**, matching the user's own proposed wording exactly.

---

## Touchpoints

### Web
| File | Change |
|---|---|
| `apps/web/src/components/admin/AdminAvailability.tsx` | Remove `freeMode`/toggle UI; add 2-option Search mode (Free Time / Free Members); add majority-tier sweep-line helper + rendering; add Free Members form (start/end datetime, 4 grouped lists) + classification helpers; remove `work`/`break` from `blockTypeConfig`/`BLOCK_TYPES`; add `meeting` entry (icon `Users`, violet palette); change form default `block_type` to `"unavailable"`; swap unused icon imports (`Briefcase`, `Coffee`, `CircleDashed`, `ArrowLeftRight` out; `Users` in); use the new 12h formatter for slot labels. |
| `apps/web/src/hooks/useAdminAvailability.ts` | `BlockType = "school" \| "meeting" \| "unavailable"`. |
| `apps/web/src/lib/manila-time.ts` | Add one exported minute-precision 12h formatter (e.g. `minutesToClock12h(minutes: number): string`, `"18:00"` → `"6pm"`, `"19:50"` → `"7:50pm"`, `1440` → `"12am"`), reused by the grid's `hourLabel` pattern and the new slot rendering. |
| `apps/web/src/test/calendar-scheduling.test.ts` | Lines 264, 283: `blockType: "work"` → `"unavailable"`. |

### API
| File | Change |
|---|---|
| `apps/api/src/db/schema.ts` | `blockType` column comment `school\|meeting\|unavailable`; default `'work'` → `'unavailable'` (matches new form default and keeps DB/app defaults aligned). |
| `apps/api/src/routes/availability.routes.ts` | `blockType: z.enum(["school", "meeting", "unavailable"])`. |
| `apps/api/migrations/060_availability_block_meeting_type.sql` | New migration — see SQL below. |
| `docs/SCHEMA.md` | `availability_block` section: update the prose ("in school / in an ADVO meeting / unavailable") and the `block_type` CHECK row to the 3 new values + migration 060 reference. |
| `apps/api/src/services/connector.service.ts` | Update the one-line comment describing `availability_block`'s shape (prose only, no logic change). |

### Not touched (confirmed safe)
- `apps/web/src/lib/capacity.ts`, `apps/api/src/utils/project-capacity.ts` — project-count based, no block-type dependency.
- `apps/api/src/services/mcp-tools.service.ts` `list_availability` tool — type-agnostic passthrough.
- `apps/web/src/test/capacity.test.ts`, `apps/web/src/test/api-wiring.test.ts` — no `work`/`break` literals.

---

## Migration SQL (new file: `apps/api/migrations/060_availability_block_meeting_type.sql`)

```sql
BEGIN;

-- Convert approved unavailable→meeting rows FIRST, by explicit block_id.
-- Current read-only scan of advo_dev found ZERO rows matching ADVO-meeting-style
-- labels (all 3 unavailable rows are unlabeled or "Busy"). Re-run the candidate query
-- before applying and add any approved ids to this list before EXECUTE.
UPDATE availability_block
  SET block_type = 'meeting', updated_at = now()
  WHERE block_id IN (/* none approved as of 19-10-26 */);

-- break -> unavailable (Open Decision was pre-answered by the user: convert, don't delete).
UPDATE availability_block
  SET block_type = 'unavailable', updated_at = now()
  WHERE block_type = 'break';

-- work rows are deleted outright (no concept they map onto in the new 3-type model).
DELETE FROM availability_block WHERE block_type = 'work';

-- Swap the CHECK to the new 3 types.
ALTER TABLE availability_block DROP CONSTRAINT IF EXISTS chk_availability_block_type;
ALTER TABLE availability_block
  ADD CONSTRAINT chk_availability_block_type
  CHECK (block_type IN ('school', 'meeting', 'unavailable'));

ALTER TABLE availability_block ALTER COLUMN block_type SET DEFAULT 'unavailable';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('060_availability_block_meeting_type.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

Order matters: the conversions/deletes run **before** the CHECK swap, so no in-flight
`work`/`break` row ever violates the new constraint.

---

## Blast Radius

- **Frontend**: 1 component rewrite (sizeable — form, 2 new modes, sweep-line helper),
  1 hook type, 1 lib addition, 1 test file edit. No other component imports
  `AvailabilityBlock`/`BlockType`.
- **Backend**: 1 zod enum, 1 schema comment/default, 1 new migration. No route logic
  changes beyond the enum.
- **Data**: 6 `work` rows deleted, 0 `break` rows affected (none exist), 0 `unavailable`
  rows converted (none qualify). Low risk — small table, local DB only.
- **Out of scope / explicitly not done**: wiring real per-person meeting attendance
  (via `meeting_member`) into Free Members' busy calculation — flagged as Open Decision 2,
  needs a separate API change.

---

## Verification Evidence (to produce during EXECUTE)

1. `npm --workspace apps/web run typecheck` — clean.
2. `npm --workspace apps/web run lint` — clean on touched files.
3. `npm --workspace apps/web run test -- calendar-scheduling.test.ts api-wiring.test.ts capacity.test.ts` (or the nearest affected subset) — passing. (Both integration tests short-circuit if the local API isn't up; note actual pass/skip state.)
4. `npm --workspace apps/api run test` (vitest) if any API-side tests touch `availability.routes.ts` — passing.
5. Manual DB check after migration: `SELECT block_type, count(*) FROM availability_block GROUP BY block_type;` → only `school`/`meeting`/`unavailable` rows, 0 `work`, 0 `break`.
6. Screenshots (manual, dev server): Free Time popup and Free Members popup, each at 1440px and 390px viewport widths, captured from the running `apps/web` dev server.

---

## Resume and Execution Handoff

- **Selected plan**: `process/general-plans/active/free-time-redesign_PLAN_19-10-26.md` (this file).
- No code or DB has been touched yet — this run was research/plan only, per the user's instruction.
- On "ENTER EXECUTE MODE": implement touchpoints top-to-bottom (web types → web component →
  API enum/schema → migration file), apply the migration against the **local** `advo_dev`
  database only, run verification steps, then report back with before/after row counts
  and screenshots.
- If any new `unavailable` rows were added to `advo_dev` between this plan and EXECUTE,
  re-run the candidate query in the Research section and get explicit user approval
  before adding any `block_id` to the migration's conversion list.

---

## Approved amendments (19-10-26, given with "ENTER EXECUTE MODE" — override the plan above)

1. **Block types** are exactly `school`, `meeting`, `unavailable`; `work` and `break` removed
   everywhere. Meeting = flat violet + lucide `Users`. Form default `unavailable`. Majority =
   strictly more than half of the selected people.
2. **Free Members groups.** Meeting [S, E], D = E − S. Busy = the person's school / meeting /
   unavailable blocks (recurring + dated via `blockAppliesOn`, real clock times, not clipped
   to 7am) on every day the window touches plus the 30 min before S. missed = merged busy
   minutes inside [S, E].
   - **Not available**: missed ≥ D/4.
   - **Will be late**: busy at S (block starts ≤ S, ends > S) or a block ends exactly at S.
   - **Leaves early**: busy inside the meeting but not at S. Late + leaves early → Will be late.
   - **May be late**: nothing inside [S, E], a block ends in [S − 30, S).
   - **Available**: none of the above.
   Group order Available, May be late, Will be late, Leaves early, Not available; empty groups
   hidden; each row avatar + name + short muted 12h reason ("School until 6:30pm", "Meeting
   7–7:30pm"). Calendar events ignored here (not per-person). Inputs: start date + time, end
   date + time; default start = next full hour (Manila), end = start + 1h; end ≤ start shows an
   inline message. Must fit 390px. *(Supersedes Open Decision 1: mid-meeting busy under D/4 is
   now its own "Leaves early" group, not "Not available".)*
3. **Free Time**: everyone-free slots plus majority slots labelled "Majority except Ardy,
   Schiffier" (first names); 12h times everywhere ("6pm–12am"); base 7am–midnight minus busy
   blocks; dated calendar bookings still subtracted from shared time; everyone slots first and
   louder, majority quieter.
4. **Search mode**: 2-segment control "Free Time" / "Free Members", default Free Time, reset to
   Free Time on every open; old `freeMode` work/empty toggle removed. Test ids:
   `freetime-mode-time`, `freetime-mode-members`, `freemembers-start-date`,
   `freemembers-start-time`, `freemembers-end-date`, `freemembers-end-time`,
   `freemembers-group-<available|may-be-late|will-be-late|leaves-early|not-available>`.
5. **Migration 060** (one transaction, in this order): delete `work`; `break` → `unavailable`;
   `unavailable` → `meeting` WHERE `label ILIKE '%meeting%'` (a rule, not an id list — prod has
   exactly 3 such rows, all approved; local has 0); CHECK → ('school','meeting','unavailable');
   default `unavailable`. *(Supersedes the id-list SQL in "Migration SQL" above.)* Apply to
   local `advo_dev` only; do not touch production, deploy, or commit.

## Execution log (19-10-26)

### Checklist

- [x] `useAdminAvailability.ts` — `BlockType = "school" | "meeting" | "unavailable"`.
- [x] `manila-time.ts` — `minutesToClock12h` (1440 → "12am", 720 → "12pm", 1190 → "7:50pm"),
      wraps negative / multi-day minutes; grid `hourLabel` now uses it.
- [x] `AdminAvailability.tsx` — `work`/`break` config and icons out, `meeting` (violet, `Users`)
      in; form default `unavailable`; `freeMode` toggle removed; 2-segment Search mode (reset on
      open); Free Time everyone + majority tiers in 12h; Free Members form + 5 groups.
- [x] `calendar-scheduling.test.ts` lines 264, 283 — `"work"` → `"unavailable"`.
- [x] `schema.ts` — default `unavailable`, comment `school|meeting|unavailable`.
- [x] `availability.routes.ts` — `z.enum(["school", "meeting", "unavailable"])`.
- [x] `060_availability_block_meeting_type.sql` — per amendment 5, applied locally.
- [x] `docs/SCHEMA.md` — `availability_block` prose + `block_type` row; migration log row 060.
- [n/a] `connector.service.ts` — research was wrong: no comment there names the old types
      (line 28 says only "availability_block is typed in by hand"). Nothing to change.

### Deviations (all minor; recorded rather than silent)

1. **Helpers live in a new `apps/web/src/lib/free-time.ts`**, not colocated in the component.
   The plan rejected a lib module only for lack of a second consumer; amendment "export helpers
   as needed, matching repo convention" plus the required unit tests make the tests that
   consumer. Repo convention is pure helpers in `src/lib/*.ts` tested from `src/test/`, and
   exporting functions from a `.tsx` component trips `react-refresh/only-export-components`.
   `merge`/`subtract` moved there as `mergeRanges`/`subtractRanges` (now copy instead of
   mutating input ranges); the unused `intersect` was dropped with the old intersection loop.
2. **Bookings are subtracted from BOTH tiers** (coordinator decision, 19-10-26, after the
   first report). The first pass followed the plan "Approach" text (everyone tier only), which
   let a majority slot overlap a booked meeting. Decision: a booked meeting blocks the slot
   for all, so `findDaySlots` now subtracts merged bookings from each majority segment too
   (each piece keeps its `missing` set, then the 30-minute floor applies). Supersedes the
   "everyone free tier only" sentence in "Approach". Test: "dated bookings come out of
   majority slots too, keeping who is missing".
3. **Boundary guard in `useAdminAvailability.ts` `mapBlock`**: an unknown `block_type` (a
   pre-060 `work`/`break` row from an unmigrated database) maps to `unavailable` instead of
   reaching `blockTypeConfig[type]` as `undefined`, which would throw and blank the page.
4. **Free Members input guard**: a cleared/invalid field shows "Pick a start and an end."; a
   window over 7 days shows "Keep the meeting under a week." (bounds the per-day loop).
5. **Extra test ids** `freetime-slot-everyone` / `freetime-slot-majority` on the Free Time chips
   (used by the headless QA run). Additive only.
6. Migration 060 header comment rewritten to state the approved statement order.

### Verification evidence

- Web typecheck (`npm run typecheck`, apps/web): exit 0.
- Web lint: touched files clean; full `npm run lint` 0 errors / 22 warnings, all in untouched
  files (pre-existing `react-refresh/only-export-components`).
- API typecheck (`npx tsc --noEmit`, apps/api): exit 0, no output.
- `src/test/free-time.test.ts` (new): 34/34 pass — includes ends exactly at S → Will be late;
  ends 30 min before → May be late; 31 min → Available; late by exactly D/4 → Not available;
  short mid-meeting → Leaves early; late + leaves early → Will be late; majority labelling;
  12h formatter cases.
- `calendar-scheduling.test.ts` 23/23 pass with `VITE_API_URL=http://localhost:6417` (live
  cases actually ran; default port 6407 silently no-ops them). `capacity.test.ts` 7/7.
  API vitest 32/32 (no availability tests exist). `api-wiring.test.ts` left in default
  skip mode (it mutates the shared DB broadly).
- Live API (tsx watch, reloaded after the zod edit): `blockType: "meeting"` passes the enum,
  `"work"` → 400 "Invalid enum value. Expected 'school' | 'meeting' | 'unavailable'".
- Migration 060 on local `advo_dev@::1:5432`: before school 114 / unavailable 3 / work 6;
  `DELETE 6`, `UPDATE 0` (break), `UPDATE 0` (meeting); after school 114 / unavailable 3.
  CHECK = ('school','meeting','unavailable'), default `'unavailable'`, ledger row written.
  Rolled-back probe: `meeting` insert OK, default insert → `unavailable`, `work` insert →
  check violation.
- Headless Chrome (playwright-core) against vite :6418 at 1440×900 and 390×844: Free Time
  default pressed, 7 everyone + 54 majority chips over 7 days, 12h labels; Free Members
  defaults to next full hour, groups render with reasons, end ≤ start shows the inline
  message, no horizontal overflow in the sheet at 390px, mode resets to Free Time on reopen.
  Only console error: unrelated 404 on `/api/settings/nav_hidden`.

### Still open

- Production: apply 060 **before** deploying the web/API build (the API enum already rejects
  `work`; the web guard keeps the page up if the order slips). Prod expects 97 `work` deleted
  and 3 `unavailable` → `meeting`.
- Local ledger is missing `059_webhook_auth_header.sql` (pre-existing, outside this plan).
- Historical prose still naming `work`/`break`: `docs/ROADMAP.md` line 84, `docs/HANDOFF.md`
  line 25 (Kenneth's ILW/Break dates were entered as `work`; migration 060 deletes those rows
  in prod). Left for UPDATE PROCESS.
- The weekly grid's block tooltips and chips still show 24h "HH:MM" (only hour labels moved
  to 12h); out of this plan's touchpoints.
