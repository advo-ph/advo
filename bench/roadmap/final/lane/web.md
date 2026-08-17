# Lane `web` — ADVO tier `final`

## 0. Confirm you are in the right lane before anything else

Print your working directory. It must be named `advo-final-web`.

- If it is named `advo-final-web` → this is your brief. Continue.
- If it is named `advo-final-<something-else>` → **stop**. You have the wrong brief. Read `.parcel-prompt.md` in your own directory.
- If it is named `advo` (no `-final-` suffix) → **stop immediately**. You are in the shared main repo, not a lane. Do not edit anything.

Branch: `final/web`. Base: `61ba8a0`. Your API runs on `6507`, your Vite on `6547`, your database is `advo_final_web`. Never touch another lane's port or database.

## 1. What you ship

The public landing has **no dead code behind it**. Every component under `apps/web/src/components/landing/` is either rendered by `/` or gone from the tree. The footer closes the product-system story instead of reading as generic agency copy. The mobile nav drawer's escape-close, scroll-lock, and route-change-close behavior is covered by an automated test rather than by hand.

**Surface that proves it:** `npm run dev` then `http://localhost:6547/` at 360 / 390 / 768 / 1280 / 1440 — the page renders, the drawer opens and closes, nothing overflows horizontally. Plus `npm test`.

## 2. Your items

Read `docs/ROADMAP.md` § "P2 — Platform polish (UX / landing)" and § "Open test-coverage gaps" first. Those rows are the spec. Do not reinterpret them.

### W1 — dead landing component

`apps/web/src/components/landing/LandingPage.tsx` has **zero sibling imports**. Ten components in that directory have **zero importers anywhere in the tree**:

`WhyDigital.tsx` · `FAQ.tsx` · `ContactCTA.tsx` · `TechTicker.tsx` · `InfrastructureDiagram.tsx` · `Hero.tsx` · `Footer.tsx` · `ProcessSteps.tsx` · `ServiceTiers.tsx` · `PortfolioGrid.tsx`

Three are still live and must **not** be removed: `landing-shell.tsx` (5 importers), `PortfolioCard.tsx` (2), `FloatingNav.tsx` (1).

**Verify the importer count yourself before deleting anything** — do not trust this brief. Then:

1. Port any copy or section from the dead files that `/` still wants into `LandingPage.tsx`. `docs/ROADMAP.md` row "Strip 'Why Go Digital' / generic FAQ → product-system framing" is marked ⏳ precisely because `WhyDigital` / `FAQ` / `ContactCTA` copy never got ported. Decide per section whether `/` needs it; the shipped `LandingPage` may already cover it, in which case port nothing.
2. Delete the dead files.
3. Delete any CSS in `landing-page.css` that only those files used.

The roadmap rows describing "generic copy" in those files are **stale — they describe components nobody renders**. Fix the rows when you close out.

### W2 — mobile drawer test

`docs/ROADMAP.md` § "Open test-coverage gaps" lists this as the one 🟢 row: *"Mobile drawer interactions (escape close, scroll lock, route-change close) — a11y-critical but currently only verified by hand."*

Cover it in `apps/web/src/test/landing-drawer.test.ts`. **Prefer a vitest render-tree test in the style of `apps/web/src/test/proof-card.test.ts`** — that file is the house pattern and it already runs in the default gate. The roadmap guessed "playwright e2e"; adding a second test framework is a large, gate-perturbing change for one test. If you genuinely cannot cover escape / scroll-lock / route-change without a browser, say so in your close-out and do not add the framework unilaterally.

### W3 — footer system continuity

`docs/ROADMAP.md` row "Footer system-continuity copy + oversized wordmark" is ⏳ Not started. The live footer is `LandingPage.tsx:760` (`.landing-footer`, `.landing-footer-grid`, `.landing-footer-bar`). Bring it in line with the product-system story the rest of the page now tells (website + client hub + admin + private stack), and give the ADVO wordmark the oversized treatment. Real proof only — Fourlinq (`fourlinq.ph`, shipped June 19 2026) is the one shippable case. **Do not invent client names, logos, or testimonials.**

## 3. Done is a command, not a vibe

Write `bench/roadmap/final/web.mjs` — a source-reading, idempotent check in the exact style of `bench/roadmap/roadmap-remain/scoring.mjs` (no clock, no random, no network). It must go **red on the current tree** before you write any fix, and green only when your three items land. At minimum it asserts:

- `no-dead-landing-component` — every `.tsx` under `apps/web/src/components/landing/` has at least one importer outside itself.
- `drawer-interaction-test` — `apps/web/src/test/landing-drawer.test.ts` exists and asserts escape-close, scroll-lock, and route-change-close.
- `footer-system-continuity` — the landing footer carries product-system copy and an oversized wordmark, and carries no generic agency copy.

**The bench is the instrument, not the deliverable.** If your whole diff sits under `bench/`, you have shipped nothing.

Green means all of these exit 0:

```bash
node bench/roadmap/final/web.mjs
npm run build:web
npm test                                            # start your API first, see §4
node bench/roadmap/roadmap-remain/viewport-site.mjs # must STAY green
node bench/roadmap/roadmap-remain/scoring.mjs       # must STAY green
```

Nothing green today may go red.

## 4. Running the gate

Two test files (`api-wiring.test.ts`, `e2e-flow.test.ts`) hit a live API. Your lane is already provisioned — deps installed, build proven, `advo_final_web` cloned from the working DB with full fixtures. Run:

```bash
npm run dev:api                                     # in one shell — serves :6507
VITE_API_URL=http://localhost:6507 npm test         # in another
```

Baseline on this worktree at `61ba8a0` is **15 files / 194 tests, all passing**. If you see fewer, something in your change broke it — not the fixture.

## 5. Files

**You own** (nobody else may touch these):

```
apps/web/src/components/landing/*.tsx
apps/web/src/components/landing/landing-page.css
apps/web/src/components/ui/ScrollProgress.tsx
apps/web/src/pages/NotFound.tsx
apps/web/src/test/landing-drawer.test.ts
bench/roadmap/final/web.mjs
```

**Forbidden — another lane owns these. Do not open them to edit:**

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
apps/api/src/services/proposal.service.ts
apps/api/src/routes/proposal.routes.ts
apps/web/src/test/proposal-ai.test.ts
bench/roadmap/final/proposal.mjs
```

**Shared — edit ONLY your own rows, never reformat or reorder:**

```
docs/ROADMAP.md  docs/HANDOFF.md  docs/FEATURES.md  README.md
package.json  package-lock.json
bench/roadmap/roadmap-remain/scoring.mjs   ← append NOTHING; that is the old tier's registry
```

## 6. Standing orders

- Work the three items with the `fanout` cadence: one item at a time, `gate` after each.
- `gate` before any completion claim: fresh `npm run build:web`, `npm test`, `npm run lint`, and your bench — read the **exit codes**, do not eyeball the output.
- `sync-docs` on close: update your own rows in `docs/ROADMAP.md` (including correcting the stale "copy still generic" rows), append one entry to `docs/HANDOFF.md` ending in **Honest open-items**.
- `convention`: **singular everywhere.** `item` not `items`, `component: Component[]` not `components`. This repo already follows it; match it.

## 7. Non-negotiables

- **No new dependency.** If you believe one is unavoidable, stop and say so in the close-out instead of installing it.
- **No invented proof.** No fake client names, logos, metrics, or testimonials. Fourlinq is the only shippable case study.
- **Reduced motion survives.** Every animation you touch keeps its `prefers-reduced-motion` / `reduceMotion` path.
- **No horizontal overflow** at 360 / 390 / 768 / 1280 / 1440. `viewport-site.mjs` enforces it; check by eye too.
- **Rejected — do not resurface:** restoring the 3D infrastructure diagram as the self-hosted centerpiece; a colorful external logo ticker; decorative gradients as the main source of "wow"; hiding proof inside a carousel; a desktop mega menu; placeholder client logos. All four are recorded as rejected in `ROADMAP.md` § "What We Are Not Going To Do".

## 8. Close out

Commit in this repo's voice — look at `git log --oneline -15` first. Scope prefixes in use: `feat(site)`, `feat(meeting)`, `fix(ops)`, `docs:`, `test:`. Small, coherent commits; do not squash three unrelated items into one.

Do **not** merge into `main` yourself. Report back: what shipped, what your bench asserts, the exit codes you read, and anything you left undone.
