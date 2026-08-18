# Lane `resilience` — ADVO tier `final`

## 0. Confirm you are in the right lane before anything else

Print your working directory. It must be named `advo-final-resilience`.

- If it is named `advo-final-resilience` → this is your brief. Continue.
- If it is named `advo-final-<something-else>` → **stop**. Wrong brief. Read `.parcel-prompt.md` in your own directory.
- If it is named `advo` (no `-final-` suffix) → **stop immediately**. You are in the shared main repo, not a lane. Do not edit anything.

Branch: `final/resilience`. Base: `61ba8a0`. Your API runs on `6508`, your Vite on `6548`, your database is `advo_final_resilience`. Never touch another lane's port or database.

## 1. What you ship

The API survives its own background work. An operator can tell the box is healthy without SSH, the Plaud poller stops exhausting outbound sockets, and Ask Plaud retries a connection reset instead of silently degrading to note-parse.

**Surface that proves it:** `GET http://localhost:6508/api/health` returns the extended health payload, and `POST /api/meeting/:id/generate-task` returns `method: "ask"` on a healthy box instead of falling back.

## 2. Your items

Read `docs/HANDOFF.md` (top three entries — 2026-08-16) and `docs/ROADMAP.md` § "Infra & Ops" first. Those are the spec. Do not reinterpret them.

### A1 — Plaud poller exhausts outbound sockets (`ENOBUFS`)

The evidence, from `docs/HANDOFF.md`:

> Rsync failed: this Windows box is `ENOBUFS` / "No buffer space available" on outbound SSH.
> Ask hit `ECONNRESET` (box was `ENOBUFS` from the 60s folder poll).
> Poller listing `limit=99999` every 60s may be starving sockets (`ENOBUFS`).

The suspect is concrete and in your tree: `apps/api/src/services/plaud.service.ts:600` and `:625` both request

```
/file/simple/web?skip=0&limit=99999&is_trash=2&sort_by=start_time&is_desc=true
```

and `apps/api/src/services/plaud-poll.service.ts:51` fires that every `PLAUD_POLL_SECOND` (default 60).

**Root-cause it before you fix it** — use the `debug` skill's discipline: form a falsifiable hypothesis, prove it, then change code. Do not fix by guess. The plausible fixes, in rough order of confidence:

1. Page the listing (`limit` in the low hundreds) and stop at the first already-seen `file_id`, rather than pulling the whole account every minute.
2. Reuse one keep-alive HTTP agent across poll ticks instead of opening a fresh connection per request.
3. Back off on failure — an errored tick should widen the interval, not retry at the same cadence.
4. Skip the tick entirely when no `PLAUD_TOKEN` is configured, instead of failing an outbound request every 60s forever. **This one matters most in prod today**, where the token is not yet set.

Ship what you can prove. Say in your close-out which hypothesis you confirmed and how.

### A2 — Ask Plaud retry on reset

From `docs/HANDOFF.md`: *"Ask Plaud needs a healthy outbound TLS path; retry-on-reset not wired yet."*

`apps/api/src/services/plaud-ask.service.ts` currently falls straight through to note-parse on `ECONNRESET`. Add bounded retry with backoff (a small fixed cap — do not retry forever, and do not retry a 4xx). The existing note-parse fallback stays as the final resort; the `method` field must keep reporting honestly which path actually ran (`ask` vs `note`), because a fallback that reports `ask` is worse than no retry at all.

### A3 — uptime ping and error capture

`docs/ROADMAP.md` § "Infra & Ops" row "Monitoring / error tracking / backups": *"Nightly `pg_dump` is documented ... Error tracking + uptime ping still not wired."*

`apps/api/src/routes/health.routes.ts` today returns `{status, db, uptime, timestamp}`. Extend it into something an operator can actually act on — e.g. last-N captured errors (count and most recent, **never a stack with credentials in it**), poller state (last tick, last success, consecutive failure count), and the configured-vs-missing state of `PLAUD_TOKEN` / `ANTHROPIC_API_KEY` as **booleans only**.

**Never return a secret's value.** `GET /api/health` is reachable unauthenticated on `https://api.advo.ph/api/health` — treat everything it returns as public. If a field would be sensitive, either gate that field behind auth or leave it out.

Prefer zero new dependency. An in-process ring buffer plus the existing pino logger covers this; do not reach for Sentry without saying so first.

## 3. Done is a command, not a vibe

Write `bench/roadmap/final/resilience.mjs` — a source-reading, idempotent check in the exact style of `bench/roadmap/roadmap-remain/scoring.mjs` (no clock, no random, no network). It must go **red on the current tree** before you write any fix. At minimum it asserts:

- `no-unbounded-plaud-listing` — no `limit=99999` (or equivalent unbounded page size) remains in `apps/api/src/services/`.
- `poll-skips-without-token` — the poller does not issue an outbound request when no Plaud token is configured.
- `ask-retry-on-reset` — the Ask path retries a reset with backoff, bounded, and still reports its true `method`.
- `health-operational` — `/api/health` exposes poller state and error capture, and exposes **no secret value**.

Also add real behavior tests in `apps/web/src/test/plaud-resilience.test.ts`, in the style of `apps/web/src/test/contract-ai.test.ts` (which stubs `@anthropic-ai/sdk` and asserts the fallback path). Stub the network; do not hit Plaud.

**The bench is the instrument, not the deliverable.** If your whole diff sits under `bench/` and `test/`, you have shipped nothing.

Green means all of these exit 0:

```bash
node bench/roadmap/final/resilience.mjs
npm run build:api
npm test                                        # start your API first, see §4
node bench/roadmap/roadmap-remain/scoring.mjs   # must STAY green
```

Nothing green today may go red.

## 4. Running the gate

Two test files (`api-wiring.test.ts`, `e2e-flow.test.ts`) hit a live API. Your lane is provisioned — deps installed, build proven, `advo_final_resilience` cloned from the working DB with full fixtures. Run:

```bash
npm run dev:api                                 # in one shell — serves :6508
VITE_API_URL=http://localhost:6508 npm test     # in another
```

Baseline at `61ba8a0` is **15 files / 194 tests, all passing**. Fewer means you broke something, not the fixture.

Your lane's `.env` deliberately leaves `PLAUD_POLL_SECOND` at its default so you can actually observe the poller — the other two lanes have it at `0`. If your box starts throwing `ENOBUFS` while you work, that is your bug reproducing; capture it.

## 5. Files

**You own** (nobody else may touch these):

```
apps/api/src/services/plaud.service.ts
apps/api/src/services/plaud-poll.service.ts
apps/api/src/services/plaud-ask.service.ts
apps/api/src/services/plaud-import.service.ts
apps/api/src/routes/health.routes.ts
apps/api/src/routes/meeting.routes.ts
apps/api/src/index.ts
apps/web/src/test/plaud-resilience.test.ts
bench/roadmap/final/resilience.mjs
```

**Forbidden — another lane owns these. Do not open them to edit:**

```
apps/web/src/components/landing/*.tsx
apps/web/src/components/landing/landing-page.css
apps/web/src/components/ui/ScrollProgress.tsx
apps/web/src/pages/NotFound.tsx
apps/web/src/test/landing-drawer.test.ts
bench/roadmap/final/web.mjs
apps/api/src/services/proposal.service.ts
apps/api/src/routes/proposal.routes.ts
apps/web/src/test/proposal-ai.test.ts
bench/roadmap/final/proposal.mjs
```

**Shared — edit ONLY your own rows, never reformat or reorder:**

```
docs/ROADMAP.md  docs/HANDOFF.md  docs/FEATURES.md  README.md
package.json  package-lock.json
apps/api/src/utils/env.ts       ← registers PLAUD_POLL_SECOND only. PLAUD_TOKEN is NOT in the zod schema —
                                   this repo reads optional integration keys straight off `process.env`
                                   (see meeting.routes.ts:213). Follow that pattern; leave env.ts alone.
apps/web/src/test/api-wiring.test.ts  ← append your own describe block only
bench/roadmap/roadmap-remain/scoring.mjs   ← append NOTHING; that is the old tier's registry
```

## 6. Standing orders

- Work the three items with the `fanout` cadence: one item at a time, `gate` after each.
- `debug` discipline on A1 specifically: hypothesis → repro → root cause → regression test → fix. Two of the three items exist because a symptom got treated instead of a cause.
- `gate` before any completion claim: fresh `npm run build:api`, `npm test`, and your bench — read the **exit codes**.
- `sync-docs` on close: update your own rows in `docs/ROADMAP.md` § "Infra & Ops", append one entry to `docs/HANDOFF.md` ending in **Honest open-items**.
- `convention`: **singular everywhere.** `error` not `errors`, `tick: Tick[]` not `ticks`.

## 7. Non-negotiables

- **No secret in any response, log line, or test fixture.** `/api/health` is public.
- **No new dependency** without saying so in the close-out first.
- **No live Plaud call in a test.** Stub it, the way `contract-ai.test.ts` stubs the Anthropic SDK.
- **Honest `method` reporting.** Every fallback path keeps reporting which path actually ran.
- **Do not touch prod.** You cannot SSH to the VPS and must not try. Applying migrations, setting `PLAUD_TOKEN`, and running `deploy.sh` are explicitly excluded from every lane — they are on the human checklist.
- **Rejected — do not resurface:** re-adding the Vertex/Gemini `brand-analysis` service (deleted on purpose; `GET /api/brand-analysis` returning 404 is the correct behavior and `bench/roadmap/roadmap-remain/scoring.mjs` asserts it).

## 8. Close out

Commit in this repo's voice — `git log --oneline -15` first. Scope prefixes in use: `feat(site)`, `feat(meeting)`, `fix(ops)`, `docs:`, `test:`. Small, coherent commits.

Do **not** merge into `main` yourself. Report back: which `ENOBUFS` hypothesis you confirmed and how you proved it, what your bench asserts, the exit codes you read, and anything you left undone.
