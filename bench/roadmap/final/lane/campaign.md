# Lane `campaign` — ADVO tier `final`

## 0. Confirm you are in the right lane before anything else

Print your working directory. It must be named `advo-final-campaign`.

- If it is named `advo-final-campaign` → this is your brief. Continue.
- If it is named `advo-final-<something-else>` → **stop**. Wrong brief. Read `.parcel-prompt.md` in your own directory.
- If it is named `advo` (no `-final-` suffix) → **stop immediately**. You are in the shared main repo, not a lane. Do not edit anything.

Branch: `final/campaign`. Base: `61ba8a0`. Your API runs on `6510`, your Vite on `6550`, your database is `advo_final_campaign`. Never touch another lane's port or database.

**You merge LAST.** You are the only lane adding a line to the shared route registry, so you rebase onto everyone else's work before landing. Plan for it.

## 1. What you ship

An operator opens `/admin` → Campaigns, picks a lead segment, attaches a subject and body, **previews the exact recipient count without sending**, and runs a throttled mass send from a sending identity that is separate from the one carrying client magic-links. Every unsubscribe, hard bounce, and spam complaint is permanently suppressed and can never be sent to again.

**Surface that proves it:** `/admin` → Campaigns (build → dry-run → send), and a public one-click `GET /api/campaign/unsubscribe/:token` that works with no login.

## 2. Your item

Read `docs/ROADMAP.md` § "P1 — Lead generation & proposal automation", the row **"Email campaign sender (mass send)"** and the **"Acceptance — email campaign sender (v1)"** table directly under it. **That table is the spec. Do not reinterpret it, and do not expand past it.**

Scope is **batch send + suppression**. Sequences, reply detection, A/B subject testing, click tracking, and inbox rotation are explicitly out of v1 — the roadmap says so. Do not build them.

### What exists today

- `apps/api/src/services/email.service.ts` — nodemailer, one `getTransport()` (Resend SMTP when `RESEND_API_KEY`, else generic SMTP, else **log-only**), a private `send(to, subject, html)`, and a `wrap()` HTML shell. Errors are caught and logged, never thrown.
- `lead` table (`apps/api/src/db/schema.ts:404`) — `leadId`, `name`, `email`, `company`, `projectType`, `budget`, `description`, `status`, `assignedTo`, `notes`, `submittedAt`. **No consent, unsubscribe, or bounce column exists.**
- `proposal` table (`:596`) — has `bodyHtml` and a `sent/opened/replied/signed` status you can send against.
- `/admin` → Leads already has the **"Outdated only"** targeting filter. Reuse that segment logic; do not write a second one.
- Migrations run to `013`. Yours is **`014_campaign.sql`**.
- Admin pages mount via a section switch in `apps/web/src/pages/Admin.tsx:184` with nav entries in `AdminSidebar.tsx`. Follow the `AdminProposals` / `AdminLibrary` pattern exactly.

### The four things that make this real rather than a for-loop

**1. A separate sending identity — this is the whole reason the lane exists.**

`email.service.ts` today has ONE transport, used by magic links, lead notifications, and client mail. If cold outreach to a scraped list poisons that reputation, **clients stop being able to log in.** Add a *second, independently configured* outreach transport with its own credentials and its own `from` (an outreach subdomain, e.g. `outreach.advo.ph`). Read its config off `process.env` — this repo's pattern for optional integration keys, see `contract-review.service.ts:233` — and **do not touch `apps/api/src/utils/env.ts`**, which another protocol governs.

The transactional path must keep working byte-identically when no outreach transport is configured. A campaign send with no outreach transport **fails loudly**; it must never quietly fall back to the transactional one, and must never log-and-succeed the way `send()` does today.

**2. Suppression is a hard gate, not a filter.**

An unsubscribed / hard-bounced / complained address is suppressed **forever**, across all campaigns. Enforce it in the send path itself, not only in the UI query — a suppressed address must be unsendable even if a caller hands you its lead id directly. Repeated soft bounce escalates to suppression.

The unsubscribe link must work **with no login, in one click**, from a token that is not guessable and does not encode the raw email address.

**3. Throttle, and survive a restart.**

A configurable per-hour cap. **No unbounded `Promise.all` over 5000 addresses** — that is both a rate-limit ban and a repeat of the `ENOBUFS` socket exhaustion the `resilience` lane is fixing in the Plaud poller this same week. Read `docs/HANDOFF.md` (2026-08-16 entries) for what that failure actually looked like on this box, and do not recreate it.

Recipient rows are materialized at send time and carry their own status, so an API restart resumes instead of re-sending. **Re-sending a campaign must never double-send to an already-sent recipient.**

**4. Honest dry-run.**

Preview resolves the segment and returns the real count, after suppression, without sending anything. The count you show is the count that will send.

## 3. Done is a command, not a vibe

Write `bench/roadmap/final/campaign.mjs` — a source-reading, idempotent check in the exact style of `bench/roadmap/roadmap-remain/scoring.mjs` (no clock, no random, no network). It must go **red on the current tree** before you write any fix. At minimum:

- `outreach-transport-separate` — the outreach transport is configured independently of the transactional one, and the transactional path is unchanged when it is absent.
- `no-silent-outreach-fallback` — a campaign send with no outreach transport errors; it does not log-and-succeed and does not borrow the transactional transport.
- `suppression-enforced-in-send` — the send path itself checks suppression, not just the UI query.
- `unsubscribe-public-one-click` — the unsubscribe route is unauthenticated, token-based, and the token does not contain the raw address.
- `send-throttled` — a rate cap exists and there is no unbounded fan-out over the recipient list.
- `no-double-send` — an already-sent recipient row is not re-sent on resume.
- `dry-run-honest` — preview returns a post-suppression count and sends nothing.

Add `apps/web/src/test/campaign.test.ts` in the style of `apps/web/src/test/contract-ai.test.ts`. **Stub the transport. Never send a real email from a test** — not to a colleague, not to yourself, not to `example.com`.

**The bench is the instrument, not the deliverable.** If your whole diff sits under `bench/` and `test/`, you have shipped nothing.

Green means all of these exit 0:

```bash
node bench/roadmap/final/campaign.mjs
npm run build
npm test                                        # start your API first, see §4
node bench/roadmap/roadmap-remain/scoring.mjs   # must STAY green
```

Nothing green today may go red.

## 4. Running the gate

Two test files (`api-wiring.test.ts`, `e2e-flow.test.ts`) hit a live API. Your lane is provisioned — deps installed, build proven, `advo_final_campaign` cloned from the working DB with real lead rows. Run:

```bash
npm run dev:api                                 # in one shell — serves :6510
VITE_API_URL=http://localhost:6510 npm test     # in another
```

Baseline at `61ba8a0` is **15 files / 194 tests, all passing**. Fewer means you broke something, not the fixture.

Apply your migration to **your own** database only:

```bash
npm --workspace apps/api run db:push
```

You have **no outreach transport configured**, deliberately. Prove every path with a stubbed transport.

## 5. Files

**You own** (nobody else may touch these):

```
apps/api/src/services/campaign.service.ts        (new)
apps/api/src/services/email.service.ts
apps/api/src/routes/campaign.routes.ts           (new)
apps/api/migrations/014_campaign.sql             (new)
apps/api/src/db/schema.ts
apps/web/src/components/admin/AdminCampaign.tsx  (new)
apps/web/src/components/admin/AdminSidebar.tsx
apps/web/src/pages/Admin.tsx
apps/web/src/test/campaign.test.ts               (new)
bench/roadmap/final/campaign.mjs                 (new)
```

**Forbidden — another lane owns these. Do not open them to edit:**

```
apps/web/src/components/landing/*.tsx            apps/api/src/services/plaud.service.ts
apps/web/src/components/landing/landing-page.css apps/api/src/services/plaud-poll.service.ts
apps/web/src/components/ui/ScrollProgress.tsx    apps/api/src/services/plaud-ask.service.ts
apps/web/src/pages/NotFound.tsx                  apps/api/src/services/plaud-import.service.ts
apps/web/src/test/landing-drawer.test.ts         apps/api/src/routes/health.routes.ts
bench/roadmap/final/web.mjs                      apps/api/src/routes/meeting.routes.ts
apps/api/src/services/proposal.service.ts        apps/web/src/test/plaud-resilience.test.ts
apps/api/src/routes/proposal.routes.ts           bench/roadmap/final/resilience.mjs
apps/web/src/test/proposal-ai.test.ts            bench/roadmap/final/proposal.mjs
```

The `proposal` lane is adding AI generation to `proposal.service.ts` **right now**. If you want to send a generated proposal, call the existing exported `generateProposal` / read the `proposal.bodyHtml` column — **do not edit that file** and do not depend on the AI path existing yet.

**Shared — strict protocol:**

```
apps/api/src/index.ts   ← ONE import line + ONE app.route("/api/campaign", campaignRoutes) line.
                           NOTHING else. The resilience lane owns the poller and error-capture
                           blocks in this file. You merge after them, so rebase onto their version.
apps/api/src/utils/env.ts  ← do NOT touch. Read your outreach config off process.env instead.
apps/web/src/test/api-wiring.test.ts  ← append your own describe block only
docs/ROADMAP.md  docs/HANDOFF.md  docs/FEATURES.md  README.md  docs/CONTRACTS.md
package.json  package-lock.json
bench/roadmap/roadmap-remain/scoring.mjs   ← append NOTHING; that is the old tier's registry
```

## 6. Standing orders

- `fanout` cadence: build the schema + suppression core first, then send, then the admin surface. `gate` after each.
- `gate` before any completion claim: fresh `npm run build`, `npm test`, `npm run lint`, and your bench — read the **exit codes**.
- `sync-docs` on close: flip your own row in `docs/ROADMAP.md` P1, append one entry to `docs/HANDOFF.md` ending in **Honest open-items**, and add the outreach env vars to `apps/api/.env.example` and `docs/SETUP.md`.
- `convention`: **singular everywhere.** `recipient: Recipient[]` not `recipients`, `campaign` not `campaigns`, `recipient_count` for the count. New columns follow `docs/SCHEMA.md` — `{entity}_id` PK, `is_X` booleans, `_count` suffix, snake_case, audit columns.

## 7. Non-negotiables

- **Never send a real email from a test or a dry-run.** Stub the transport.
- **No unbounded fan-out.** Throttle, or you reproduce the `ENOBUFS` failure that is currently blocking this repo's deploy.
- **No silent success.** A send that could not send must error. The existing `send()` swallows errors to a log — do not copy that behavior into the campaign path.
- **Suppression cannot be bypassed** from any code path, including a direct lead id.
- **No new dependency** without saying so in the close-out first. `nodemailer` is already in the tree.
- **Do not touch prod, and do not send to the real lead list.** Not as a smoke test, not "just five". Sending is a human decision that happens after the lawyer item in P0 clears — see below.
- **This ships the sender, not the permission to send.** The scraped clinic list is personal data under the PH Data Privacy Act (RA 10173), and the roadmap routes that question to the same lawyer engagement tracked in P0. In your close-out, append the consent-basis / retention / unsubscribe questions to the punch list in `docs/CONTRACTS.md` § "Open questions for the legal advisor". Do not write anything into the UI that implies the list is cleared to send.

## 8. Close out

Commit in this repo's voice — `git log --oneline -15` first. Scope prefixes in use: `feat(site)`, `feat(meeting)`, `fix(ops)`, `docs:`, `test:`. Yours is most likely `feat(campaign)`. Small, coherent commits.

Do **not** merge into `main` yourself. Report back: what shipped, what your bench asserts, the exit codes you read, the exact outreach env vars an operator must set on the VPS, and anything you left undone.
