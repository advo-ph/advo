# Lane `proposal` — ADVO tier `final`

## 0. Confirm you are in the right lane before anything else

Print your working directory. It must be named `advo-final-proposal`.

- If it is named `advo-final-proposal` → this is your brief. Continue.
- If it is named `advo-final-<something-else>` → **stop**. Wrong brief. Read `.parcel-prompt.md` in your own directory.
- If it is named `advo` (no `-final-` suffix) → **stop immediately**. You are in the shared main repo, not a lane. Do not edit anything.

Branch: `final/proposal`. Base: `61ba8a0`. Your API runs on `6509`, your Vite on `6549`, your database is `advo_final_proposal`. Never touch another lane's port or database.

## 1. What you ship

Generating a proposal for a lead produces body copy **written from that lead's own scraped signals** — its digital / design / performance score, industry, and budget — instead of the same template with the name swapped. When no Anthropic key is configured, the existing template fill still runs, unchanged.

**Surface that proves it:** `/admin` → Proposals → Generate on a real lead row, and `POST /api/proposal` returning `method: "ai"` when `ANTHROPIC_API_KEY` is set, `method: "template"` when it is not.

## 2. Your item

Read `docs/ROADMAP.md` § "P0 — Revenue & contracts" row **"Proposal-to-contract pipeline"** and § "P1 — Lead generation & proposal automation" row **"Clinic-scraper → proposal-PDF pipeline"** first. Those rows are the spec. Both say the same thing: template fill shipped, **AI generation still deferred**. You are closing that deferral.

### P1 — AI proposal generation

Today `generateProposal(leadId, valueCents)` at `apps/api/src/services/proposal.service.ts:176` looks up the lead, parses a budget, and calls `fillProposalTemplate(...)`. The printable HTML path is `apps/api/src/routes/proposal.routes.ts:58`.

Add an AI path in front of the template fill, following the pattern this repo has already settled on **three times** — read all three before writing anything, and match them rather than inventing a fourth shape:

- `apps/api/src/services/contract-review.service.ts` — the reference implementation, and the one with a test.
- `apps/api/src/services/meeting-task.service.ts`
- `apps/api/src/services/timeline-suggestion.service.ts`

The established contract in this repo is: Claude when `ANTHROPIC_API_KEY` is set, deterministic fallback otherwise, and a `method` field on the response that reports **which path actually ran**. Keep it.

Ground the generation in the lead's real data. The importer (`scripts/import-clinic-lead.ts`, `data/clinic-lead/sample.json`) already carries digital / design / performance scores and design feedback per lead — that is the material the roadmap means by *"feed → AI-design proposal → send"*. A generated proposal that ignores those scores is a template fill with extra latency and is not this item.

The clauses from `docs/CONTRACTS.md` — downpayment floor (40% or ₱30k), revision limits (2 rounds per phase), change orders — must still appear in the generated output. **The model does not get to rewrite, soften, or reword a contract clause.** Insert them verbatim from the existing template path. If you cannot guarantee that structurally, generate only the narrative sections and template-fill the clauses.

## 3. Done is a command, not a vibe

Write `bench/roadmap/final/proposal.mjs` — a source-reading, idempotent check in the exact style of `bench/roadmap/roadmap-remain/scoring.mjs` (no clock, no random, no network). It must go **red on the current tree** before you write any fix. At minimum it asserts:

- `proposal-ai-path` — `generateProposal` has an AI path guarded on `ANTHROPIC_API_KEY`, with the template fill as fallback.
- `proposal-method-honest` — the response reports `method` and it reflects the path that actually ran.
- `proposal-grounded` — the generated body references the lead's own scored signals, not just name and budget.
- `proposal-clause-verbatim` — the CONTRACTS.md clauses reach the output without passing through the model.

Add `apps/web/src/test/proposal-ai.test.ts` in the style of `apps/web/src/test/contract-ai.test.ts` — stub `@anthropic-ai/sdk`, assert `method: "ai"` on valid JSON and clean fallback on throw / malformed JSON / missing key. **No live API call in a test.**

**The bench is the instrument, not the deliverable.** If your whole diff sits under `bench/` and `test/`, you have shipped nothing.

Green means all of these exit 0:

```bash
node bench/roadmap/final/proposal.mjs
npm run build:api
npm test                                        # start your API first, see §4
node bench/roadmap/roadmap-remain/scoring.mjs   # must STAY green
```

`proposal-tracker` and `proposal-pdf` in `roadmap-remain/scoring.mjs` are green today and must stay green — you are adding a path, not replacing one.

## 4. Running the gate

Two test files (`api-wiring.test.ts`, `e2e-flow.test.ts`) hit a live API. Your lane is provisioned — deps installed, build proven, `advo_final_proposal` cloned from the working DB with full fixtures including real lead rows. Run:

```bash
npm run dev:api                                 # in one shell — serves :6509
VITE_API_URL=http://localhost:6509 npm test     # in another
```

Baseline at `61ba8a0` is **15 files / 194 tests, all passing**. Fewer means you broke something, not the fixture.

You have **no Anthropic key** in this lane, by design. That is the honest prod condition (`docs/ROADMAP.md`: *"prod has no key, so live paths are fallback-only"*). Prove the AI path with a stubbed SDK, exactly as `contract-ai.test.ts` does. Do not ask for a key and do not paste one into `.env`.

## 5. Files

**You own** (nobody else may touch these):

```
apps/api/src/services/proposal.service.ts
apps/api/src/routes/proposal.routes.ts
apps/web/src/test/proposal-ai.test.ts
bench/roadmap/final/proposal.mjs
```

**Forbidden — another lane owns these. Do not open them to edit:**

```
apps/web/src/components/landing/*.tsx
apps/web/src/components/landing/landing-page.css
apps/web/src/components/ui/ScrollProgress.tsx
apps/web/src/pages/NotFound.tsx
apps/web/src/test/landing-drawer.test.ts
bench/roadmap/final/web.mjs
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

`apps/api/src/index.ts` is owned by the `resilience` lane. Your routes are **already registered** there — you do not need to touch it. If you think you do, you are adding a route that does not belong in this item.

**Shared — edit ONLY your own rows, never reformat or reorder:**

```
docs/ROADMAP.md  docs/HANDOFF.md  docs/FEATURES.md  README.md  docs/CONTRACTS.md
package.json  package-lock.json
apps/api/src/utils/env.ts       ← already registers ANTHROPIC_API_KEY; read it, do not re-declare
apps/web/src/test/api-wiring.test.ts  ← append your own describe block only
bench/roadmap/roadmap-remain/scoring.mjs   ← append NOTHING; that is the old tier's registry
```

## 6. Standing orders

- `gate` before any completion claim: fresh `npm run build:api`, `npm test`, and your bench — read the **exit codes**.
- `sync-docs` on close: update your own rows in `docs/ROADMAP.md` (P0 "Proposal-to-contract pipeline" and P1 "Clinic-scraper → proposal-PDF pipeline"), append one entry to `docs/HANDOFF.md` ending in **Honest open-items**.
- `convention`: **singular everywhere.** `clause` not `clauses`, `section: Section[]` not `sections`. The repo's AI services already use singular JSON keys — match them.
- `claude-api`: this is Anthropic SDK work. Load that skill before writing the model call — do not answer model id, pricing, or parameter questions from memory. The repo currently pins `claude-opus-4-8` in its other AI services; check whether that is still the right id rather than copying it blind.

## 7. Non-negotiables

- **A contract clause never passes through the model.** Verbatim insertion only.
- **`method` reports the truth.** A template fill that claims `method: "ai"` is worse than no AI path.
- **No live model call in a test.** Stub the SDK.
- **No new dependency** — `@anthropic-ai/sdk` is already in the tree. If you think you need another, say so in the close-out instead of installing it.
- **The clauses are still legally unreviewed.** `docs/ROADMAP.md` P0 says every CONTRACTS.md draft *"needs legal review before binding use."* Do not remove that caveat from the generated document, and do not let generated copy imply the terms are settled.
- **No invented proof.** Fourlinq (`fourlinq.ph`, June 19 2026) is the only shippable case study. The model must not fabricate clients, metrics, or testimonials into a proposal — that goes out to a real prospect.

## 8. Close out

Commit in this repo's voice — `git log --oneline -15` first. Scope prefixes in use: `feat(site)`, `feat(meeting)`, `fix(ops)`, `docs:`, `test:`. Small, coherent commits.

Do **not** merge into `main` yourself. Report back: what shipped, what your bench asserts, the exit codes you read, and anything you left undone.
