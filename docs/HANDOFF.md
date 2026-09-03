# ADVO Session Handoff

Reverse-chronological log of substantive work sessions. One entry per session or coherent batch. Newest at top. Each entry ends with **Honest open-items** — things that did NOT ship — so the next session knows what's left.

Cross-links:
- Forward-looking work → [ROADMAP.md](ROADMAP.md)
- Current product surface → [FEATURES.md](FEATURES.md)
- VPS deploy state → [CUTOVER.md](CUTOVER.md)
- Schema reference → [SCHEMA.md](SCHEMA.md)
- Contracts/policy → [CONTRACTS.md](CONTRACTS.md)
- Brief for counsel → [LEGAL-BRIEF.md](LEGAL-BRIEF.md)
- Sending that brief → [LAWYER-OUTREACH.md](LAWYER-OUTREACH.md)
- The identity facts everything is waiting on → [ASK-IDENTITY.md](ASK-IDENTITY.md)
- Missing keys/accounts → [CREDENTIALS.md](CREDENTIALS.md)

---

## 2026-09-03 — discounts: a fact about a price, not a new price

> Mar: _"sometimes we do provide discounts, etc."_ Until now a discounted deal had to choose between the list price (and look underpaid forever) and the charged price (and lose the list price), and a discounted addendum would have superseded the contract's figure as if the price had changed. Migration 028 gives the project row `list_value_cents`, `discount_cents` and `discount_reason` beside the charged `total_value_cents`, with list − discount = total refused by the form, the API and a DB CHECK. The corpus reads a discount out of any text as typed terms, keeps the list price live beside the addendum that discounted it, and answers "pays ₱270,000" from "₱300,000 with a 10% discount" with the arithmetic shown. Verifier first: `bench/roadmap/corpus-discount`, 9 checks against the running API, creating and deleting its own bench project and sources, 9/9 locally and on prod.

**What changed in the passes.** `discountTermIn()` runs after both extractors, so the terms do not depend on what the model made of the sentences. `supersedeByNewerDocument()` skips money terms whose newer source carries a discount term, and now supersedes counts too: `termDigit` returns a term's whole value, so "5" matches "5 rounds", which `numberIn()` alone ignored as a lone digit. `checkClaim()` returns `discount` when list − discount equals a figure in the claim and nothing supported it outright. `DELETE /api/corpus/source/:id` (admin) exists so a bench, or a bad ingest, can be removed; facts that pointed at the deleted source's facts as successors go live again.

**Honest open-items**

- **No real discount is recorded yet.** The three fields are empty on every prod project; the corpus holds the referral discounts (20% for a referred meeting, 50% for a signed referral) and FourlinQ's free first year as prose only. Which discounts ADVO actually gives, and to whom, is Mar's to say.
- **One discount per text.** `discountTermIn()` types the first discount it finds; a note that grants two different discounts keeps the second as a fact only.
- **A discount on a recurring fee** (a waived first year) is still a fact, not a row: `recurring_fee` has no discount fields.
- ~~**The admin Corpus screen has no delete button.**~~ Shipped: each source row has a trash button behind a confirm, and the check result shows the discount arithmetic when one explains it.
- As before: no facts verified by a person; the prod admin password is the seed default.

---

## 2026-09-03 — the gaps: supersession, repository knowledge, and the data the contracts said should exist

> A verifier first (`bench/roadmap/corpus-gap`, 8 checks against the running API), then the closures, then 8/8 on prod. `POST /api/corpus/supersede` points every fact an older contract stated at the newer contract's figure; fact-check stops counting a superseded fact as support. The case studies became corpus bundles, one per client repository, every feature cited by the file that proves it. VBE is linked to its real source outside the org and backfilled. Felici's three sister sites, the gelato site's value, and the three contracted recurring fees now exist as rows.

**Supersession.** Terms across contract, proposal and addendum sources are grouped per project and term, newest document first. A cents term matches either spelling, so `300000` finds "₱3,000.00" in prose. The older document's facts carrying the older figure, and pricing / contract-term / commitment / decision facts spoken on recordings dated before the newer document on the same project, point at the newer document's fact. On prod that was Felici's total fee, downpayment, downpayment percentage and infra fee. "Felici pays ₱3,000 a month" is conflicting now, with July's line shown and marked.

**Fact-check, three fixes.** The any-word fallback narrows to matches that name what the claim names. Candidates are over-fetched before narrowing, which brought "FourlinQ pays ₱3,000 a month for hosting" back to supported. When the words match but none carries the figure, the figure itself (four digits or more) is searched as text and rescued; "The Felici contract is ₱200,000" and "The FourlinQ app contract is ₱125,000" were conflicting because the fee facts repeat neither the client's name nor the word contract. Two-digit numbers are not rescued: "Commission is 60%" must stay conflicting rather than lean on a 60/40 payment split.

**Repositories.** `repositoryName` may be owner-qualified; `repoRef()` resolves feed, backfill, branches, webhook matching and the hub link. `POST /api/github/repos/:name/backfill` reads the last 100 commits from GitHub and stores the ones the webhook never saw. VBE's source is `CelestialBrain/vbeeyecenter` (one commit); it was never transferred to `advo-ph`.

**Prod data.** Project 6 ₱45,000 / ₱20,000 paid; projects 16 Nokohi, 17 Flowers and Chocolates, 18 Felici Cafe at ₱45,000 each under the same client, discovery; recurring fees 1–3 (FourlinQ app ₱3,000 monthly, Felici ₱4,000 monthly, FourlinQ website ₱5,000 annual), suspension off, start dates placeholders noted on each row. Corpus on prod: 32 sources, 825 facts.

**Honest open-items**

- **Recurring-fee start dates are placeholders.** Both monthly fees start on delivery of a system that is not delivered; the rows say so in their notes and must be re-dated at delivery.
- **The four sister-site projects share one ₱200,000 contract.** Each carries ₱45,000; there is no row for the contract as a whole, and the ₱20,000 down payment sits on the gelato project only.
- ~~**Supersession covers money and commitments only.**~~ Closed the same day: a term's whole value is its digit now, so 5 rounds → 3 rounds supersedes; see the entry above.
- **Repository knowledge is the case studies, not the code.** Facts come from `case-study.ts`; nothing reads the client repositories directly.
- **No facts are verified by a person** and **the prod admin password is still the seed default**, as before.

---

## 2026-09-03 — the corpus: every fact with the line it rests on, and the first ingestion pass

> Migration 027. Five tables, three ingestion paths, a fact-check endpoint, an accountability ledger, ten templates, and an admin screen. Two agents on Opus read 17 Plaud recordings and 11 Drive documents end to end and wrote curated bundles under `data/corpus/`: 767 facts, 151 typed terms, 160 open actions, 30 sources, mapped to prod projects and leads. Loaded locally and to prod by `npm run corpus:load`.

**Why it exists.** The morning's Drive check found the repo quoting three numbers the signed documents had replaced. Nothing stored a claim next to its source, so nothing could say where a number came from or that it had changed. Now a fact is a sentence, a verbatim quote, an `m:ss` or a heading, and a `basis` that is honest about whether it is a transcript line, a document, an AI summary, or a regex guess.

**What the pass found.** The four "Power Mac Center" spotlights of 08-11 are FourlinQ sessions: the client names her companies, shows the fourlinq site, and the module set is the six-system contract line for line. Fun Ride PH / MyriadSports has five recordings and no project row. The 07-10 FourlinQ meeting records that the owner already had a friend build a sales CRM. The two FourlinQ website sign-offs disagree on what was paid (₱27,000 vs ₱12,000), the Felici downpayment is ₱9,600 in July's document and ₱20,000 in August's for the same date, deemed-approval windows differ across three contracts (15+15, 10+3, 7+3), and every signature block in every Drive copy is blank. All of it is in `data/corpus/*/INDEX.md` with timestamps.

**Fact-check, honestly.** `POST /api/corpus/check` searches by words, not numbers, then compares the numbers. "FourlinQ pays ₱3,000 a month for hosting" → supported, 08-11 transcript at 39:20. "The commission split is 60 percent developer" → conflicting, the signed agreement says 55. "Felici pays ₱3,000 a month" → supported by July's contract and flagged contested, because August's says ₱4,000. The verdict shows its work; it does not decide truth.

**The cheaper second pass.** The first pass was Opus by hand. The steady state is `POST /api/corpus/ingest/plaud` per link with `CORPUS_EXTRACT_MODEL` pointed at a cheaper model; with no key the heuristic runs and marks every guess as one.

**Honest open-items**

- **No facts are verified by a person.** 767 rows, 0 with `is_verified`. The corpus is as good as the transcripts and the agents; a human pass over pricing and contract terms is the next real step.
- ~~**Supersession is manual.**~~ Closed the same day: `POST /api/corpus/supersede`, see the entry above.
- **Meetings under Inbox.** Recordings with no project row (Fun Ride, the 07-30 and 08-16 memos) sit under the Inbox project on the Meetings screen.
- **The prod admin password is still the seed default.** The loader used it to reach prod. Rotate it.
- **Template rendering is fill-in-the-blanks.** No document generation to PDF; the rendered markdown is copied out.
- **No embeddings.** Postgres full-text is enough for a few thousand claims; revisit at tens of thousands.

---

## 2026-09-02 — the runway landing, the client hub tier, and the tooling that gates them

> Thirty commits across two sessions on one day. Public `/` rebuilt in the runway grammar with real proof and no generated art; the client hub gained the thread, preview history, event notifications and Pay now; the API gained the ESP bounce webhook; the dev loop gained a one-command local database, an env-drift gate and a design-brief bench. `vitest` 770/770 with the 118 integration tests that used to skip now running. Deployed to prod at the end of the day.

**The landing.** *"durastically improve the UI of the fronten … removing all the unnescsary words/ai-generated slop + keeping this 'runway' feel."* Thirteen sections became six. Every isometric PNG under `public/landing` is gone; the page runs on the cinematic stills and real client marks. Hero copy staggers in and the still drifts on scroll; sections fade up once; the process panel cross-fades; buttons press to 96%. Then the brief from the owner's Dribbble agent — *"serious monotone, not friendly campus UI … Chrome is 1px hairline, no glass, no shadow, no mesh … Lucide at strokeWidth={1}"* — turned the blurred bar into a solid one with a hairline, the mission band flat `#0c0c0c`, every icon an absolute 1px. The footer floor is the traced lockup (`public/advo-wordmark.svg`, contours lifted from the 1024px mark) set to the column width through a CSS mask, the way tripi sets its footer mark to the rule above it. The first screen is cut from the viewport so the client strip is always on it; the strip is an infinite marquee by the owner's call, reduced-motion or not. The native scrollbar is hidden outright (the sisia system) and a draggable overlay thumb drawn instead, which also removed the page shift the drawer lock used to cause. Work cards are each product's 1200×630 share frame over two inner screens, captured from the live sites with cookie banners dismissed, and open `/work/:slug` case studies read out of the client repos.

**The hub.** *"what else is missing for advo for the team, the client and for the devs … do all, make sure each feature works."* One `ProjectThread` component mounted on the hub and in the admin command center, against `project_message` (026); a team reply notifies the client by row and email. `preview_link` records every mint and the hub lists them. `notify.service.ts` is the single writer of client notifications — deliverable completion, change orders, preview mints, thread replies, and the admin POST all go through it. Pay now appears only when a pending intent carries a live checkout URL; the manual rail shows nothing. The live-preview iframe was rendering as a blank white box for any client domain that sends `X-Frame-Options`, which is all of them; it is a link card now. Driven in the browser as `contact@fourlinq.com` and as admin, both directions.

**The devs.** `scripts/db-local.mjs` creates, pushes, migrates and prints the drift verdict; SETUP.md carries the Windows Postgres path. `scripts/env-drift.mjs` found ten keys documented in `.env.example` but never declared in `env.ts`; `bench:env` grades it and CI runs it. `bench:visual` now asserts no glass, no shadow, stroke-1 icons, one gradient. `live-api.ts` targeted `localhost`, which Node resolves to `::1` while the API listens on `127.0.0.1`, so `e2e-flow` and `api-wiring` had skipped on every run; they target `127.0.0.1` and run in the node environment now. The ESP webhook (`POST /api/campaign/esp-webhook`) sits above the team-auth line, Svix-verified, and refuses with 503 until `RESEND_WEBHOOK_SECRET` is set. Migration 026 was first written with its CHECKs inside `CREATE TABLE IF NOT EXISTS` — exactly the 025 defect — and was rewritten to guarded `ALTER` before it shipped.

**Two sessions on one tree.** Commits from this session and the connector-suite session interleaved on the same branch twice, once sweeping a half-done landing into a test commit and once sweeping an API schema change into a CSS commit (split back out). Everything landed on `feat/connector-suite`, which had no upstream, so nothing reached GitHub until the end-of-day fast-forward. A friend who believed they had pushed had not; no push from anyone else reached the repo today.

**Honest open-items**

- **Prod migrations are applied by hand** — 022 through 026 were streamed over ssh before the deploy because `deploy.sh` does not run them. That is the same gap that produced the 025 defect; `db-local` closes it locally and nothing closes it on the box.
- **The hub components have no render tests.** `ProjectThread`, the pay button and the preview list are covered only by the live API suite and by browser probes done by hand.
- **Pay now has never been exercised against a real provider.** `PAYMENT_PROVIDER` is `manual` in prod; the button was proven with a fixture intent carrying a placeholder URL.
- **`RESEND_WEBHOOK_SECRET` and `ANTHROPIC_API_KEY` are still unset in prod**, so the bounce webhook refuses with 503 and the AI paths stay on fallbacks.
- **The admin has no unread badge for client threads** outside the project's Overview tab.
- **Camps PH's home page errors server-side** (`Something went wrong`), which is why its work card shows the listing page. That is their site, not ours, but it is what a visitor sees.
- **PayMongo identity, the lawyer, the FourlinQ tier, outreach DNS** — unchanged, all on a person.

---

## 2026-08-29 — the credentials session: three keys, and a mail outage nobody knew about

> Cloudflare Pages token + project, a Resend key and a verified sending domain, a GitHub PAT and webhook. Every one proved by exercising the real path rather than reading a config. `bench:preview` 8/8. Prod env: 17 set, 14 unset, and only one of the fourteen matters.

**The outage.** Reading the prod `.env` to add a Cloudflare key surfaced something unrelated and much worse: **there was no mail transport configured at all** — neither `RESEND_API_KEY` nor `SMTP_HOST`. `email.service.ts:44` handles that case by logging and returning, so every client magic link, team invite and lead notification for an unknown period was composed, addressed, and dropped, with the caller seeing success. 37 "no transport" lines sat in the last 400 log entries. `GET /api/health` reported `status: ok` the whole time. Nobody had reported it, which is its own signal about how many clients have tried to log in.

**Fixing it took two things, not one.** The key alone was not enough: with the key installed, `noreply@advo.ph` and `noreply@send.advo.ph` both returned `403 domain is not verified`, while Resend's own `onboarding@resend.dev` sent fine — proving the key worked and the domains did not. Live DNS already carried a `resend._domainkey.advo.ph` record, so a Resend domain had been set up before, under a **different account** from the one that issued this key. Once `advo.ph` was added and verified in the right account, the send worked. Worth naming because the failure mode is indistinguishable from a bad key, and the swallow hides both.

**And it was verified over the path the app actually uses.** `email.service.ts` sends over SMTP (`smtp.resend.com:465`, nodemailer), not Resend's REST API — so a successful REST call proves nothing. The check that counts was run from the VPS with the app's own transport config: `SMTP AUTH OK`, then a real message from `noreply@advo.ph`, the address hardcoded at `email.service.ts:50`.

**Cloudflare Pages — the preview credential is live.** Token issued with no TTL, project `advo-preview` created (`advo-preview-2bg.pages.dev`), four vars on the box. Creating the project was also the only way to *prove* the token carries Pages:Edit: reading `/pages/projects` returns `200` with an empty list whether you are permitted or scoped to nothing, so only a write settles it. An eight-endpoint probe of the token found it broader than intended — `/accounts/{id}/members` and `/user` both returned real data — which the operator accepted.

**`bench:preview` was re-authored, not merely turned green** (`ea237ff`). `provider-credential-live` was hard-coded to `Boolean(process.env.HERENOW_API_KEY)` and marked RED BY DESIGN. here.now was closed on 08-24, superseded by Cloudflare precisely because its credential is self-issuable — so the row was demanding a credential nobody intends to obtain: a permanently red check measuring a decision already made. It now asserts a credential for whichever provider `PREVIEW_HOST_PROVIDER` selects, with `manual` passing on none by design.

**GitHub — token and webhook, both proved.** `GITHUB_ORG` had been set with nothing behind it, so the feed authenticated as nobody and returned `[]`. A fine-grained org-scoped read-only PAT now answers the exact call the app makes (`GET /orgs/advo-ph/repos` → 23 repos). A webhook secret was generated, set, and an org-level push webhook added; the endpoint moved from `503` (secret unset) to `401` (signature checked). The end-to-end proof came from pushing this branch: `github_event` went 0 → 3 rows, one per commit, and the API logged `"Processed push event"`.

**Honest open-items**

- **`email.service.ts` still swallows its own failures.** `send()` catches and logs, so the next missing key or expired credential will fail exactly as invisibly as this one did, with health still green. This is the highest-value follow-up in this entry and it did not ship.
- **`ANTHROPIC_API_KEY` is still unset in prod.** Re-checked live on 08-29. Five features remain on their fallback paths.
- **Apex mail is still unauthenticated.** Verifying `advo.ph` in Resend proves DKIM and nothing else: `advo.ph` still has no SPF record and Workspace DKIM is still unpublished. The two ❌ rows in [DNS.md](DNS.md) are untouched.
- **The GitHub token expires 2027-08-29** — GitHub caps fine-grained PATs at a year. On expiry the feed returns `[]` with no health failure. Noted in both `.env` files; nothing enforces it.
- **Nothing gates environment drift.** Both of today's failures were env-shaped — a key missing from prod, and a duplicate key in `env.ts` that no bench compiled. `bench:drift` covers migrations only.
- **A Namecheap API key was enabled and never used** (Resend verified through its own Namecheap integration). It can rewrite DNS for every domain in the account and should be reset.
- **Prod is running the pre-merge tree.** The env work took effect on restart, but the `TS1117` build fix and the re-authored bench only reach prod on a deploy of `main`.

---

## 2026-08-28 — the two blockers are one ask, and `main` could not build

> Started as "what's next": run every bench and read the reds honestly. Eleven of thirteen were green, both reds were human-blocked as documented — and then the gate found that `npm run build` had been failing on `main` since `b0af285`.

**The build was broken and nothing said so.** `apps/api/src/utils/env.ts` declared `CLOUDFLARE_ACCOUNT_ID` twice: the preview-hosting commit added it beside `CLOUDFLARE_API_TOKEN`, while an older `CLOUDFLARE_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` pair was still sitting six lines below it. `TS1117`, so `tsc` refused the API and `npm run build` exited 2. Every bench stayed green through this, because no bench compiles the API — they read source and drive the browser. The stale pair is deleted rather than the new one: `CLOUDFLARE_TOKEN` is read nowhere in `apps/api/src`, and `preview-host.service.ts` reads `CLOUDFLARE_API_TOKEN`. `apps/api/.env.example` was still advertising the dead name; it now names the trio the adapter actually reads and says which `PREVIEW_HOST_PROVIDER` value selects them.

**`bench:drawer` could not be run the way its own docstring says to run it.** It defaulted to `127.0.0.1:6100`; `apps/web` serves `6447`. Following the documented two-step — `npm run dev:web`, then `npm run bench:drawer` — produced a playwright `ERR_CONNECTION_REFUSED` stack, which reads exactly like a failing a11y gate rather than a missing server. The default now tracks `server.port` in `vite.config.ts` with a comment saying it must, and an unreachable server exits `2` printing the two commands to run instead of a stack. Verified both directions: 7/7 green against a live server, and the instruction plus `exit=2` against a dead port. The a11y behaviours themselves were never in question — this only made the instrument runnable.

**The three human-blocked rows are one chase, not three.** "Merchant identity of record", the PayMongo disclosure row, and LEGAL-BRIEF Annex A were tracked as separate ⏳ items and read as three things to chase Prince about. They are the same five facts off one DTI/SEC certificate — which also fill the contract's own signatory block. [ASK-IDENTITY.md](ASK-IDENTITY.md) consolidates them into one message with a table of which answer lands in which file, and the note that a photo of the certificate covers four of the five on its own. It also asks for the sent 11 August PDF, which answers the three open contract questions (executed?, the truncated fortuitous-events clause, which tier the client selected) at once.

**The legal packet now has a recipient plan.** [LEGAL-BRIEF.md](LEGAL-BRIEF.md) has been send-ready since 08-23 and nobody has sent it, because "pick a lawyer" was the whole remaining instruction. [LAWYER-OUTREACH.md](LAWYER-OUTREACH.md) is that instruction written down: four screening criteria (PH commercial practice, RA 10173 experience, willing to quote fixed, SME-sized), the covering email drafted to keep Section 10's framing without apologising for the small budget, and a table of what to update *here* when an opinion comes back — because an answer on Policy 3 is a migration, not a copy edit. The pre-send checklist says to send **despite** the blank Annex A: waiting on the identity ask delays the RA 10173 half, which is the half gating revenue, for a reason counsel does not need resolved to quote.

**Docs the fix exposed as stale.** The root `.env.example` still told operators to set `VITE_GITHUB_TOKEN` — removed by S4 (`9574820`), read nowhere, and the exact footgun S4 closed, since Vite inlines `VITE_*` into the public bundle. Deleted. `SETUP.md` still documented `CLOUDFLARE_TOKEN=... # Deployment status` and documented neither the outreach transport nor preview hosting. The README's API env table was missing eight live variables including the entire `OUTREACH_*` block, so the one property that block exists to guarantee — that a cold-outreach reputation hit cannot take client magic-links down with it — was undocumented in the front door.

**Honest open-items**

- **Nothing was sent.** Both new documents are drafts waiting on a human: the identity message has not gone to Prince, and no lawyer has been contacted. `bench:paymongo` stays 5/7 and the P0 legal row stays ⏳ until then.
- **No bench compiles the API.** That is how a `tsc` error survived on `main` across a green bench sweep. A build check belongs in the gate; none was added here.
- **`npm test` fails two files on any box without a local API** — `api-wiring` and `e2e-flow` need one on `:6407`. `npm run test:local` boots one but needs `DATABASE_URL` and the JWT secrets, which this box does not have. Pre-existing, environmental, and unrelated to these changes, but it means a bare `npm test` is not a clean signal.
- **The ESP bounce webhook is still not wired.** Migration `020`'s endpoint has had no caller since 08-23.
- **`bench:preview` stays red on `provider-credential-live`** by design — no here.now key exists.

---

## 2026-08-23 — the legal packet: something you can actually send a lawyer

> `docs/LEGAL-BRIEF.md`. `npm run bench:legal` 9/9 (was 0/9). Docs-only lane — no code, no migration, no API surface.

**The problem this closes.** "Engage Philippine corporate/cyber lawyer" was the oldest ⏳ on the roadmap and the only P0 still open, and it had been open because it was framed as a hiring task. It isn't. The part that had never been done is *preparing what you hand one* — the questions were living as a 16-item punch list buried at the bottom of a 30KB policy document. Nobody can send that to counsel and get a bounded quote back.

**What shipped.** One self-contained document a Philippine lawyer can price and answer without reading this repo or opening a single attachment:

- **The live exposure is the first thing on the page** — that substantially this language already went to a client ahead of review. That is what turns the engagement from drafting into remediation, and it belongs above the fold, not in an appendix.
- **All nine policies, each with its operative clause language quoted inline.** Counsel validates text, not a summary of text, so the packet carries the words that actually went out.
- **49 numbered questions**, each phrased to be answerable *yes / no / yes-with-modification* — not "please review our contracts."
- **The commercial figures**, because a payment clause cannot be judged without the money it governs: ₱45,000 / ₱70,000 tiers, the 50/50 milestone split, the ₱3,000/month infrastructure fee, and the honest note that these are five-figure engagements where the proportionate answer may differ from the optimal one.
- **The RA 10173 outreach block carried over whole** — lawful basis for ~5K scraped clinic records, legitimate interest for B2B, first-contact notification, retention for an unconverted lead and for a permanently-suppressed address, NPC registration at this volume, unsubscribe-versus-erasure. Section 8 is marked separable because it is the half gating revenue.
- **Both known defects in the sent contract** named as questions, not as regrets: the contradictory deemed-approval clock (10 days in the payment table, 15 + 15 in the revisions clause) and the fortuitous-events clause that is truncated mid-sentence in our copy.
- **The instruments named** so counsel can scope: RA 10173, RA 8792, the Civil Code, RA 8293, RA 11967, and the Rules on Electronic Evidence — offered as a list to correct, not as an assertion of law.
- **A bounded ask** — fixed fee, turnaround, whether the executed contract is needed to start, conflict check, and a range for the follow-on MSA.

**What it deliberately does not contain.** Annex A is a table of nine blanks: entity legal name, registration particulars, registered address, signatory, correspondence address, the executed contract, the full fortuitous-events wording, and which tier the client selected. None of that is in this repo. Guessing a company identifier in a document going to counsel is the one failure mode that would make the whole packet worse than not sending it, so every one of them is marked **TODO — to be supplied**. The bench enforces this.

**The sharpest question in it** is #18: whether "full ownership of all deliverables, including source files and codebases" on final payment silently transfers ADVO's reusable internal components. We have shipped the same internal scaffolding to more than one client under that language. That was an open question in the June draft, survived the August reconciliation unanswered, and is flagged in the packet as the one we are most worried about.

**Honest open-items**

- **No lawyer has been contacted.** The packet is written; nobody has sent it. The remaining work on this P0 is human — pick counsel, fill Annex A, send. The roadmap row stays ⏳ for exactly that reason.
- **Annex A is still nine blanks.** They are not knowable from this repo. Someone with access to the corporate file has to fill them before the packet goes out.
- **The executed 11 August contract has not been retrieved**, so questions 26 and 10–11 are asked against a copy we know to be incomplete.
- **Nothing in the packet has been reviewed by a lawyer** — including its own assumptions about which statutes are engaged. That list is offered to counsel for correction, and question 49 explicitly invites them to tell us what we failed to ask.
- **CONTRACTS.md and LEGAL-BRIEF.md can now drift.** The punch list is the source; the packet is built from it. A note in CONTRACTS.md says anything added there must be carried across, but nothing enforces it.

---

## 2026-08-23 — `deploy.sh` rewritten around the git path (lane `deploy`)

> Closes the first 2026-08-19 open-item: *"deploy.sh should stop using rsync from Windows. Rewrite it around the git pull path above, and move the pm2 stop to *after* the sync so a transport failure cannot take prod down. Until then, do not run it from this box."*

`deploy.sh` no longer moves code with a file-copy transport, and **the `pm2 stop` is gone entirely** rather than merely reordered. `pm2 restart --update-env` is now the only lifecycle call in the script, and it runs only after the new code is already on disk — so the failure that took prod down for ~2 minutes on 2026-08-19 has no path left to reach the running service.

**API** — `/opt/advo` is a checkout of the same origin, so the deploy is the path that actually worked on 2026-08-19: back up `apps/api/.env`, `apps/web/.env.production`, and a tarball of `/opt/advo` into `/var/tmp/advo-backup/`, then `git fetch --prune origin` + `git reset --hard origin/main`, then `npm install --workspace apps/api`, then `pm2 restart`. `reset --hard` stays deliberate over `pull` — it discards the tracked CRLF churn and the `package-lock.json` that every on-box `npm install` rewrites, both of which a merge would conflict on, and it leaves untracked files (`.env`, `.env.production`, `uploads`) alone.

**Web** — built locally, verified to reference `api.advo.ph`, shipped over SSH into `/var/www/advo/dist.new-<stamp>`, verified again on the box, then swapped into place with the replaced tree kept as `dist.prev-<stamp>`. The live tree is never written in place, so a partial upload is never what nginx serves.

**One deliberate behaviour change.** The old transport shipped your *working tree*; this ships `origin/<branch>`. That is silent-stale-deploy shaped, so the script now refuses to run when `HEAD` is not `origin/<branch>` (`DEPLOY_ANY_HEAD=1` overrides) and warns on a dirty tree. `DEPLOY_BRANCH` defaults to `main`.

**Verified** — `npm run bench:deploy` 7/7. Beyond the bench, the script was dry-run end-to-end against stubbed `ssh`/`npm`/`curl` and the traced remote command order confirmed: backup → fetch/reset → install → restart → stage → verify → swap → health, with zero `pm2 stop` calls. Two induced-failure runs confirm the load-bearing property: a failed `git reset` issues **zero** lifecycle calls and never swaps the web tree, and a failed web upload leaves the live `dist` in place. Health checks now retry and a non-200 exits non-zero with the rollback commands printed.

### Honest open-items
- **Not yet run against the real box.** Everything above is bench + stubbed dry-run; the first real `./deploy.sh` should be watched, and `/var/tmp/advo-backup/` checked afterwards.
- The atomic swap is `mv` + `mv`, so there is a sub-millisecond window where `/var/www/advo/dist` does not exist. A symlink flip would close it; not done, because nginx's `try_files` on a missing root is a 404 for that instant only.
- Old backups still accumulate — `/var/tmp/advo-backup/*` and `dist.prev-*` are never pruned. Worth a retention sweep.
- The remaining 2026-08-19 open-items (`PLAUD_TOKEN` / `ANTHROPIC_API_KEY` on prod, outreach transport, the wider prod ownership bug) are untouched by this lane.

## 2026-08-23 — web-aug parcel: PayMongo compliance + offer truth (2 lanes, not yet built)

> Nothing shipped this session. Two founder instructions from the 08-15/08-21 Messenger threads were turned into red benches and parcelled into lanes; the lanes have not been run.

**Where these came from.** A scan of the polkadoc vault (`Messenger/ADVO Core 💪`, `Messenger/Prince A Wagan`) for advo.ph traffic. Six asks surfaced; three are parcellable and three are not. The two that became lanes:

- **PayMongo merchant review.** ADVO is submitting advo.ph for approval. Prince, 08-21: _"sir can u put all this to advo website"_ over a screenshot of PayMongo's requirement list — DTI/SEC/CDA registration number, Terms, Privacy, Return and Refund, customer-service contact **including business address**, Dispute Resolution. His stated worry: _"they may take longer or deny us if the website looks ai or they dont get what were doing"_. None of the four policy routes exist today.
- **Offer truth.** Prince, 08-21: _"remove the price boi we dont put the pricing on the website, its always get a quotation"_ and _"lets just keep only the section for the websites that we've already created, put emphasis on each project that weve made (large screenshot images, get them from the advo portfolio database) with short and concise and simple descs only"_. The landing currently publishes ₱60,000 / ₱80,000/mo / ₱800/hr, and its work rail is four hardcoded cards over `/landing/rw/*.jpg` stock.

**The committed benches are RED by design** (`6ddb931`):

- `bench/roadmap/paymongo-compliance/scoring.mjs` — 0/7. Six checks are lane work. **`legal-identity-filled` is meant to stay red**: it requires a real registration number and business address in `data/legal-identity.json`, and those facts are not in this repo. The lane is explicitly told not to invent them — a fabricated registration number on a page submitted to a payment processor is the worst outcome available here.
- `bench/roadmap/offer-truth/scoring.mjs` — 1/6.

**`bench:landing` currently asserts the opposite of the pricing instruction.** Its `engagement-cta` check requires the landing to carry `₱` and the four engagement shapes. Removing the prices turns a green check red, so the `offer` lane owns both files and re-authors that check to assert quotation language instead. `stale-price-check-retired` in the new bench is what forces that resolution rather than letting the lane delete a sibling bench to get green.

**Lanes** — parallel, worktree, `link-main` (junction to the main `node_modules`; no per-lane install), teardown via `/cleanup`. Builder is `claude` in both.

| Lane | Branch | Owns | Done when |
|---|---|---|---|
| `offer` | `lane/offer` | `LandingPage.tsx`, `PortfolioCard.tsx`, `landing-page.css`, `bench:offer`, `bench:landing` scoring | `bench:offer` 6/6 with `bench:landing` still green |
| `compliance` | `lane/compliance` | `pages/legal/**`, `lib/legal-identity.ts`, `data/legal-identity.json`, `App.tsx`, `landing-footer.tsx`, `bench:paymongo` | `bench:paymongo` 6/7; `legal-identity-filled` stays red |

`offer` merges **first** — it re-pins `bench:landing`. Tip gate is the full suite plus all five benches at the merged tip.

Both lane plans pass the parcel contracts: `lane-plan-check.mjs` → PASS, `warp-config-check.mjs` → PASS. Warp launch config at `%APPDATA%\warp\Warp\data\launch_configurations\parcel-web-aug.yaml`, two tabs, each booting `claude` with `.parcel-prompt.md` already in the prompt.

**Not parcelled, deliberately:**

- **Vision/tagline swap.** Prince asked twice for _"We digitalize it for you."_ as the tagline. Angelo objected in-thread that it reads software-only when ADVO also ships hardware; [VISION.md](VISION.md) agrees with Angelo. It would also revert the shipped `title-meta` row in [ROADMAP.md](ROADMAP.md#p2--platform-polish-ux--landing), which deliberately dropped "We Digitalize It For You" from the document title. Founder decision, not a lane.
- **runway.com UI redesign.** A visual reference, not acceptance criteria. No instrument can be authored, so no lane.
- **Food / Medical / Education industry sections.** Blocked on the AI customer-journey videos Prince said he was still making.

### Honest open-items
- **Neither lane has been run.** This session produced benches, worktrees, prompts and a launch config — no product code. Every check above is still red.
- **`data/legal-identity.json` needs Prince.** Registration body + number, registered business address, support email, support phone. Until those land, `bench:paymongo` cannot go fully green and the PayMongo submission is not complete regardless of what the lane builds.
- **The policy prose has no legal review.** These four pages join the nine CONTRACTS.md policies already waiting on the Philippine corporate/cyber lawyer (P0, still ⏳). Publishing a Refund and a Dispute Resolution policy is a binding-ish public commitment; the lane is told to stay consistent with CONTRACTS.md, which is itself unreviewed.
- **`offer` needs a public portfolio read path that does not exist.** `LandingPage.tsx` is entirely static and `portfolio_project` is only read by the admin hook. The lane will have to add one API route outside its owned set.
- **The portfolio table may be empty.** The lane is told to render nothing rather than invent client work, so the section could ship blank until real screenshots are loaded.
- **12 stale worktrees are still on disk** from earlier tiers (`advo-lane-{admin,copy,docs,hub,lead,ops,route,site,staff,test,wiring}`, `advo-final-*`). Unrelated to this parcel, but `/cleanup` has never been run on them.
- The polkadoc vault this scan read is itself incomplete — it was rebuilt from empty on 08-23 and only backfills to 07-20 for ADVO Core and 08-19 for the Wagan DM. Older advo.ph discussion exists only in `~/polkadoc.bak-20260821-214330` and was not scanned.

---

## 2026-08-23 — soft-bounce escalation: the unreachable enum arm is now reachable

> Closes the second 2026-08-18 campaign open-item. `soft_bounce_limit` had been a suppression reason that nothing on earth could write.

**The gap.** Migration 015 shipped `suppression_reason` with five arms. Four were writable — an unsubscribe click, the delivery-failure callback's `hard_bounce` and `complaint`, an operator's `manual`. The fifth, `soft_bounce_limit`, appeared in exactly two places in the repo: the enum, and the reason union in `suppress()`'s own signature. No call site. The delivery-failure route's zod enum did not even accept `soft_bounce`, so an ESP reporting one got a 400.

**Why it mattered before the first send, not after.** A hard bounce is self-announcing: one report, one suppression, done. A soft bounce is the dangerous one precisely because each instance is individually forgivable — a full mailbox, a greylist, a temporary reject — and retrying them against a warming domain is the most reliable way to get a sender blocked. The mechanism had to exist before the first campaign, because after it the reputation damage is already priced in.

**What shipped**
- **Migration 020** — `email_soft_bounce`, keyed on the address. 019 was left untouched for the drift lane.
- **`SOFT_BOUNCE_LIMIT = 3`** in `campaign.service.ts` — a named single-source constant, not an inline number. Three rather than the industry five: the industry default assumes an established sender with reputation to spend, and the outreach domain has none.
- **`recordSoftBounce()`** — upserts the counter, and at the limit calls `suppress(email, "soft_bounce_limit", …)`. That enum arm now has a producer.
- **Route** — `POST /api/campaign/delivery-failure` accepts `soft_bounce` alongside the two terminal kinds, and returns the **real** outcome. It used to hard-code `isSuppressed: true`, which was accurate while every kind was terminal; a soft bounce under the limit is not suppressed, and the response now says so and reports `softBounceCount` / `softBounceLimit`.
- **Six behavioural tests + four wiring tests** in `campaign.test.ts` (383/383 suite green).

**Three decisions worth arguing with**
1. **The count belongs to the ADDRESS, not the recipient row.** `campaign_recipient` was the cheaper place for an integer and would have been wrong: the count would reset at every campaign boundary, so an address soft-bouncing twice per campaign forever would sit at 2 and never escalate. That is exactly the address that must escalate.
2. **The count is CUMULATIVE, not consecutive.** A mature ESP resets on a successful delivery. Nothing here receives a delivery event — `status = "sent"` means handed to the transport — so resetting on it would zero the counter for precisely the accept-then-defer addresses this catches. Cumulative errs toward suppressing sooner, never later. **When a delivery webhook lands, the reset belongs there and nowhere else.**
3. **Normalization is a DB CHECK here, not a convention.** Migration 015 used a `lower(email)` expression index and trusted the app to normalize. `ON CONFLICT` can only infer a plain-column index through the query builder, so 020 puts uniqueness on the bare column and enforces `email = lower(email)` as a constraint. Same guarantee, arrived at from the other side — a non-normalized write is now rejected rather than merely deduplicated.

**Bench** — `npm run bench:bounce` 8/8, red-proved at 1/8 on the untouched tree (only `suppression-still-a-gate`, which asserts the v1 invariant this lane must not break). `bench/roadmap/final/campaign.mjs` still 17/17: the v1 invariant that suppression is re-checked *inside* the send loop survived the change.

**Verified against real Postgres**, not only the test stand-in: driven against `advo_bounce`, five reports for one address gave `count=1,2,3,4,5` with `suppressed=false,false,true,true,true`, one `soft_bounce_limit` row, no error on the retries past the limit, and an uppercase input counted as the same address.

### Honest open-items
- **Still nothing has been sent.** This lane shipped escalation, not clearance. Every 2026-08-18 transport item stands: no outreach subdomain, no SPF/DKIM/DMARC, no warm-up ramp, no provider whose ToS permits the list.
- **No ESP webhook calls the endpoint.** All three kinds are now accepted and correct, and all three are still driven by hand until a webhook is wired. That is the remaining half of the original open-item.
- **The endpoint is unauthenticated for the ESP's benefit and nothing verifies the caller.** A signed-webhook check belongs on it before it is exposed to a real provider — anyone who can reach it can suppress an arbitrary address.
- **No reset path**, by decision 2 above. The counter only rises until a delivery event exists to reset it.
- **No admin surface for the counter.** `softBounceCount` is returned by the callback but is not rendered anywhere; an operator cannot see which addresses are one bounce from suppression without a query.

---

## 2026-08-23 — outreach DNS preflight (lane `outreach`)

The campaign sender was 17/17 and had never sent anything. The missing piece was never a
mechanism — it was clearance: an outreach subdomain whose SPF, DKIM and DMARC actually
resolve. `isOutreachConfigured()` only ever proved that SMTP env vars were present, and env
present + DNS absent is precisely the state that gets a domain blocked on its first campaign.

- **`scripts/outreach-preflight.mjs`** — `npm run outreach:preflight`. Live TXT lookups, not a
  config-presence check:
  - **SPF** — exactly one `v=spf1` on the outreach domain. Two records is a PermError, which
    receivers treat as no SPF at all, so a second record fails rather than passes.
  - **DKIM** — `<selector>._domainkey.<domain>`, with the selector from
    `OUTREACH_DKIM_SELECTOR`. No default: a guessed selector checks the wrong name. A record
    present with an empty `p=` (a revoked key) fails — it signs nothing.
  - **DMARC** — `_dmarc.<domain>`, with `p=` surfaced. `p=none` passes but is called out as
    publishing a record and enforcing nothing. If the subdomain has no record of its own, the
    org policy that would apply by inheritance is reported in the failure so it is actionable.
  - **Separation** — an outreach domain equal to the transactional one is refused outright.
    `advo.ph` carries client magic-links; a blocked outreach domain must not take logins with it.
  - Exits non-zero on any failure, so it gates rather than informs.
- **The verdict is written down** — `docs/outreach-preflight.json` records the records found,
  the domain, and the timestamp, so "is the domain cleared?" still has an answer after the
  terminal closes.
- **The sender reads it.** `outreachDnsVerification()` / `isOutreachDnsVerified()` in
  `email.service.ts` clear a send only when the recorded preflight **passed**, for the domain
  `OUTREACH_FROM` names **right now**, within **30 days**. `sendOutreachEmail()` throws
  otherwise, and `sendCampaign()` refuses up front rather than flipping 5000 rows to `failed`
  one at a time. `isOutreachConfigured()` is deliberately unchanged — configured and cleared
  are two different questions and the UI needs to say which is missing.
- **No per-send DNS call.** A resolver call inside the send loop would let a transient SOA
  timeout stop a campaign mid-flight. The committed artifact is the answer; it expires instead.
- **Surface** — `/admin` → Campaigns shows a red "outreach domain is not DNS-verified" banner,
  with the specific reason and the command to fix it, distinct from the existing amber
  "no transport configured" one.
- **Bench** — `npm run bench:outreach` 8/8 (was 0/8). `bench/roadmap/final/campaign.mjs` still
  17/17, `bench:roadmap-remain` still 35/35.
- **Proved live** — `resend.com`/`resend` clears 6/6; `google.com`/`20230601` correctly fails on
  a revoked (empty `p=`) key; `advo.ph` as the outreach domain is refused for equality.

### Honest open-items
- **Still nothing sent, and now the refusal is enforced rather than advised.** The
  `outreach.advo.ph` subdomain does not exist yet — the recorded preflight is 0/3 because
  `OUTREACH_FROM` is unset everywhere, including prod.
- `advo.ph` has **no SPF record at all** (`ENODATA`). Unrelated to outreach, but it means
  transactional mail is unauthenticated today.
- The preflight is not wired into CI or the deploy, and nothing re-runs it on the 30-day
  expiry — an operator has to run it. A scheduled run that keeps the artifact fresh is the
  obvious next step.
- No warm-up ramp is enforced. Clearance is not reputation; the first campaign on a new
  subdomain still needs volume staged by hand.
- Still blocked on the RA 10173 questions in CONTRACTS.md and on an ESP whose ToS permits the
  list — Resend's does not.

---

## 2026-08-19 — final tier deployed; rsync replaced with git pull

> The `final` tier (web / resilience / proposal / campaign) is **live on prod**. The 2026-08-16 "deploy blocked" item is closed. Pushed `976a64a`.

**The `ENOBUFS` block is gone.** SSH to `advo` connects cleanly and TIME_WAIT sat at 15 locally — the resilience lane's keep-alive agent plus the dead-token latch fixed the churn that was exhausting ephemeral ports.

**`deploy.sh` is still broken on this Windows box, for a different reason.** rsync now fails with `dup() in/out/err failed` — an MSYS/Git-Bash rsync file-descriptor bug, not a network one. Because the script does `pm2 stop` **before** the sync, that failure left prod down for ~2 minutes until `pm2 restart` brought it back.

**What actually worked — `/opt/advo` is a git checkout of the same origin**, so the deploy became:

1. `git fetch && git reset --hard origin/main` on the box (after a tarball + `.env` copy to `/var/tmp/advo-backup/`). The 69 "modified" files were 64 of pure CRLF churn from past Windows rsyncs plus 5 real ones — the Plaud work that had been rsynced in but never committed there. All 5 are in `main`, so the reset was a superset, and `.env` / `.env.production` were untouched (`reset --hard` leaves untracked files alone).
2. `npm install --workspace apps/api` then `pm2 restart advo-api --update-env`.
3. Web bundle shipped as `tar czf - dist | ssh ... tar xzf -` into a staging dir, verified to reference `api.advo.ph`, then atomically swapped with the old `dist` kept as `dist.prev-*`.

**Migrations applied to prod first**, before the code, since all are additive: `014_proposal_method` and `015_campaign` (012/013 were already there). Both were run as `postgres`, which reproduced the pre-existing ownership bug — the app role could not read the new objects — so ownership of all three campaign tables, four types, and three sequences was transferred to `advo`, then verified readable by the app user.

**Verified live:** `advo.ph` 200 serving the new hashes (`index-iCu7RWch.js` / `index-BYWntzW-.css`); `GET /api/campaign` returns 401 (mounted + gated); `GET /api/campaign/unsubscribe/:token` returns 200 (public, one click); `/api/health` returns the new operational shape and honestly reports `isDegraded: true` with `plaud: Plaud auth is not configured`.

### Honest open-items
- **`deploy.sh` should stop using rsync from Windows.** Rewrite it around the `git pull` path above, and move the `pm2 stop` to *after* the sync so a transport failure cannot take prod down. Until then, do not run it from this box.
- **Prod has no `PLAUD_TOKEN` and no `ANTHROPIC_API_KEY`** (`config.isPlaudTokenConfigured` / `isAnthropicKeyConfigured` both `false`). Folder watch and Ask Plaud stay latched off; contract review, meeting-to-task, timeline suggest, and the new proposal generator all run their fallback path.
- **No outreach transport configured** — campaign sending is refused by design. Needs the `outreach.advo.ph` subdomain + DNS first, and the RA 10173 questions answered. The DNS half is now checkable: `npm run outreach:preflight` resolves SPF/DKIM/DMARC live and the sender refuses until it passes.
- Pre-existing prod ownership bug is wider than the new tables: the app role also cannot `pg_dump` `change_order`. Worth a sweep of `ALTER TABLE ... OWNER TO advo` across the schema.
- `package-lock.json` shows as modified on the box after every `npm install`; harmless churn, but `git pull` will need `--autostash` or a reset next time.
- Backups from this deploy: `/var/tmp/advo-backup/advo-pre-015-*.dump`, `opt-advo-pre-pull-*.tar.gz`, and `/var/www/advo/dist.prev-*`. Clean up once this is proven stable.

---

## 2026-08-18 — email campaign sender (lane `final/campaign`)

> Last open code row in ROADMAP.md P1. Leads were imported, targeted, and a proposal could be generated — nothing sent it.

- **Schema** — migration `015_campaign.sql`: `campaign`, `campaign_recipient`, `email_suppression`. Unique index on `(campaign_id, lead_id)` makes a double-send impossible at the DB level; unique index on `lower(email)` means casing cannot defeat suppression.
- **Separate sending identity** — `email.service.ts` gains an outreach transport (`OUTREACH_SMTP_HOST` / `OUTREACH_SMTP_PORT` / `OUTREACH_SMTP_USER` / `OUTREACH_SMTP_PASS` / `OUTREACH_FROM`) configured independently of the transactional one. `sendOutreachEmail()` **throws** when unconfigured — it never borrows the mailer that carries client magic-links, and never logs-and-succeeds.
- **Suppression is a gate, not a filter** — re-checked inside the send loop immediately before each send, so a caller holding a lead id directly still cannot reach a suppressed address. Unsubscribe / hard bounce / complaint all feed it, permanently.
- **Throttled + resumable** — paced by `rate_per_hour`, one recipient at a time, only `queued` rows sent. No `Promise.all` over the recipient list (that is the ENOBUFS shape the resilience lane fixed the same week).
- **Public one-click unsubscribe** — `GET /api/campaign/unsubscribe/:token`, mounted above the auth middleware. Token is 24 random bytes and does not encode the address; the page renders the same for an invalid token so it cannot be used as a guessing oracle.
- **Surface** — `/admin` → Campaigns: dry-run a segment (post-suppression count, sends nothing), queue, then send.
- **Bench** — `bench/roadmap/final/campaign.mjs`, 17/17. Red-proved: 1/17 on the pre-lane tree.

### Honest open-items
- **Nothing has been sent.** No outreach transport is configured anywhere, including prod. The lane shipped the mechanism, not the clearance.
- Needs an outreach subdomain (e.g. `outreach.advo.ph`) with its own SPF/DKIM/DMARC, plus a warm-up ramp before any volume. **The clearance is now enforced, not just advised** — see the preflight section below.
- `advo.ph` itself has **no SPF record** today (`ENODATA` on the TXT lookup). That is a transactional-mail problem independent of outreach, and worth fixing on its own.
- Resend's ToS prohibits scraped lists — the outreach transport likely needs a different provider than the transactional one.
- RA 10173 questions are now item 8 on the CONTRACTS.md legal punch list and are **unanswered**.
- Bounce/complaint/soft-bounce all arrive via `POST /api/campaign/delivery-failure`; no ESP webhook is wired to it yet, so suppression from bounces is still manual until that is connected. The endpoint is ready for one; nothing calls it.
- ~~Soft-bounce escalation is modelled in the enum (`soft_bounce_limit`) but no counter increments it yet.~~ **Closed 2026-08-23** — migration 020, see the entry at the top of this file.

---

## 2026-08-18 — raw media offloaded to 4TB

`apps/web/media` is a symlink to `/Volumes/gelo's 4tb/from-macbook-pro/antigravity/advo/apps/web/media` (479 files, 21.5 GB, copy-verified). `.gitignore` now matches both `media/` and the symlink. The landing site still works only while the drive is plugged in. Fourlinq experiment folders were archived beside it on the drive; Mac copies kept (unique WIP).

**Honest open-items:** `combine-media.sh` still assumes a local directory; site images in `public/` were not moved.

---

## 2026-08-17 — resilience lane: ENOBUFS root-caused, poll latch, Ask retry, operational health

> Lane `final/resilience`. The API now survives its own background work. Root cause of the `ENOBUFS` reported on 2026-08-16 is **measured, not guessed** — and it was not the `limit=99999` listing.

**Root cause — connection churn, not payload size.** The ADVO folder poll ticks every 60s; undici's default keep-alive idle timeout is ~4s. Every tick therefore opened a brand-new TLS connection and abandoned the previous one into `TIME_WAIT`. Measured on this box against `api-apse1.plaud.ai` with ticks spaced past the idle window:

| Transport | TIME_WAIT across 5 spaced ticks |
| --- | --- |
| default global dispatcher | 3 → 5 → 6 → 7 → 8 → 9 (**+1 per tick, monotonic, no plateau**) |
| shared keep-alive agent (idle > poll interval) | 7 → 7 → 7 → 7 → 7 → 5 (**flat**, one connection reused) |

Five *back-to-back* calls added zero `TIME_WAIT` — reuse works inside the keep-alive window. It is the 60s gap that defeats it. Windows holds `TIME_WAIT` ~120s, so the poll accumulated faster than it drained; on a box near its ephemeral-port ceiling that surfaces as `WSAENOBUFS` on the **next** outbound connect — which is what rsync/SSH and Ask Plaud actually hit. `limit=99999` makes each response big but is still **one** connection, so it is **refuted as the socket cause** (still fixed, for bandwidth and memory).

**Second, compounding cause.** `hasPlaudAuth()` only proves a token *string* exists. This box's workspace token is expired (`-419`) and its auth file has no `user_token`/`workspace_id`, so `remintWorkspace()` can never succeed — the poller was firing one doomed connect every 60s, forever, each leaking a socket.

- **Transport** — one shared keep-alive `undici.Agent` (`plaudFetch`) behind every Plaud request, idle timeout held above `PLAUD_POLL_SECOND`. Dynamic import, degrades to the global dispatcher if unresolvable; **no new dependency declared**.
- **Latch** — `markTokenDead()` / `isTokenUsable()`. A rejected-and-unremintable token suppresses the poll outright instead of retrying forever. A later success clears the latch.
- **Backoff** — self-rescheduling tick (`setTimeout`, not `setInterval`); a failed tick widens its own next delay ×2, capped at 5 steps.
- **Paged listing** — `limit=99999` → bounded 200-row pages, walk capped at 25 pages, short-circuited at the first already-imported `file_id`. A steady-state tick reads one short page; a no-new-file tick now skips the `/filetag/` request entirely.
- **Ask retry** — bounded 3 attempts with 400ms×2ⁿ backoff on transport faults (`ECONNRESET`/`ENOBUFS`/`ETIMEDOUT`/…). A 4xx is **never** retried (`AskClientError`) — retrying an auth rejection is the socket-burning bug, not a fix. `method` still reports the path that actually ran.
- **Operational health** — `GET /api/health` extended: `isDegraded` + `degradedReason`, `plaud.*` poller state, `error.*` bounded ring of redacted stack-free messages, secrets as booleans only. `status` deliberately stays API-own liveness so an uptime ping does not page on an expired Plaud token.

Verified live: the poller now logs `Plaud poll stopped — nothing to poll with` after **one** request instead of looping every 60s, and health reports `isDegraded: true` with `"plaud: workspace token rejected (status -419) and cannot be reminted"`.

Gate: `bench/roadmap/final/resilience.mjs` 10/10 (red 1/10 before the fix), `npm run build:api` exit 0, `npm test` **16 files / 214 tests** (baseline 194 + 17 new + 3 wiring), `bench/roadmap/roadmap-remain/scoring.mjs` 35/35 still green.

### Honest open-items
- **`method: ask` is NOT proven on this box.** Ask is attempted first and fails on `-419 workspace token expired` — a credential fault, correctly not retried, correctly falling back to `method: note` (meeting 20 → 6 tasks). Proving `method: ask` needs a live Plaud token, which is on the human checklist. The retry path itself is covered by tests that stub a reset.
- The keep-alive fix is proven by direct `TIME_WAIT` measurement, **not** by reproducing a full `ENOBUFS` — that needs a box already at its port ceiling.
- `undici` is imported dynamically and is present as a transitive dep but **declared in no `package.json`**. If a future install prunes it, Plaud requests silently fall back to the churning global dispatcher. Declaring it is the durable fix; not done here to honor the no-new-dependency rule.
- Poller state is in-process only — it resets on restart and is per-instance, so it will not aggregate across a multi-instance deploy.
- Prod untouched: no deploy, no migration, no `PLAUD_TOKEN` set. Not merged.

## 2026-08-16 — docs synced; deploy blocked locally

> `/sync-docs` + attempted `./deploy.sh`. Web built (`api.advo.ph` in the bundle). Rsync failed: this Windows box is `ENOBUFS` / “No buffer space available” on outbound SSH. `https://api.advo.ph/api/health` is still **200** (`db: true`, uptime ~21h) — the previous `pm2 stop` did not leave prod down.

### Honest open-items
- Run `./deploy.sh` from a **fresh** terminal (not this session). Then on the VPS: apply `012_meeting_plaud_import.sql` + `013_meeting_is_visible_client.sql`.
- Add `PLAUD_TOKEN` (or `PLAUD_AUTH_FILE`) to `/opt/advo/apps/api/.env` or folder watch + Ask stay idle. Deploy does **not** overwrite `.env`.
- Ask Plaud live path is proven off-API; `propose-task` via the local API was `ENOBUFS` this session.

## 2026-08-16 — Ask Plaud for Advo JSON

> Propose-task now calls Plaud's own Ask (`POST /ask/v2/ask`, same consumer JWT praud uses) with the live roster + glossary and expects `{"task":[...]}`. Falls back to note parse if Ask fails or returns non-JSON.

Live try on meeting 20: Ask hit `ECONNRESET` (box was `ENOBUFS` from the 60s folder poll) and fell back to `method=note`. Parser path still assigned Prince / Anthony / David.

### Honest open-items
- Ask Plaud needs a healthy outbound TLS path; retry-on-reset not wired yet.
- Poller listing `limit=99999` every 60s may be starving sockets (`ENOBUFS`).

## 2026-08-16 — Plaud note owners + multi-section + auto-preview

> Fanout: assign pipeline on the real 08-16 note.

- Parse `— *Prince*` / `*[Insert Name]* *Anthony*` suffixes; try each name until a `team_member` hits.
- Collect **every** Action Items section (David/Cirrus no longer dropped at `## 2`).
- Import and Sync Plaud open the propose-task preview when a new meeting row is created.

### Honest open-items
- Still no auto-insert of deliverables (preview → confirm).
- `Speaker 1` in the transcript is still unlabeled.

## 2026-08-16 — Plaud ADVO folder watch + seed fixture

> Follow-on: auto-import ADVO recordings without praud; fix `client@advo.ph` seed so S1–S3 pass.

- **Poller** — `startPlaudPoll()` on API boot. Every `PLAUD_POLL_SECOND` (default 60) lists Plaud files tagged ADVO or named with “advo”, imports unseen `file_id`s into Inbox. Manual **Sync Plaud** on Admin Meetings (`POST /api/meeting/plaud/sync`).
- **Seed** — `ensureUser` resets `admin@advo.ph` / `client@advo.ph` password + `isActive` so `npm run db:seed` restores the wiring fixture.
- **Dev** — root `npm run dev` uses `npx concurrently` (package was missing from `node_modules`).

### Honest open-items
- Poller needs consumer JWT on the box (`PLAUD_TOKEN` or `~/.piper/plaud-auth.json`). Prod today may still be share-URL only.
- Apply `012`/`013` on envs that do not already have the columns (local already did).
- Not deployed.

## 2026-08-16 — Plaud import + grounded task preview; landing rewrite

> Fanout of the dirty tree: ship Plaud adapters, then close the loop from note → assigned deliverable, then the already-built landing rewrite. Commits `7a98d75` + `5617afe`.

- **Import** — `GET /api/meeting/plaud`, `POST /api/meeting/import`, praud `POST /api/meeting/import/praud` (Inbox). Migrations `012`/`013`. Admin Import from Plaud + Publish. Hub shows published MoMs.
- **Grounded propose** — `POST /api/meeting/:id/propose-task` reads Plaud note first, resolves Prince/Gelo/… against `team_member`, preview dialog, confirm inserts `deliverable.assignedTo`. Tests in `meeting-task.test.ts` + `plaud-import.test.ts`.
- **Landing** — Runway-language `/` + `landing/rw` stills. Vite `:6447` proxies `/api`.

### Honest open-items
- Apply `012`/`013` on each env (local may already match schema from earlier push). Not deployed.
- Plaud cannot be taught Advo JSON — we consume the note, then resolve. No `meeting_action_item` / attendee table yet.
- Prod still has no `ANTHROPIC_API_KEY` (Claude paths stay fallback).
- `npm test` S1–S3 failed here because the seed client login fixture was missing; e2e-flow 43/43 and unit suites green.
- Root `npm run dev` needs `concurrently` on PATH; start web + api workspaces separately.
## 2026-08-15 — test lane: coverage table

> Roadmap-remain **test** lane. The bench only measures; this lane's deliverable is the tests.

Closed the open coverage table in [ROADMAP.md](ROADMAP.md#open-test-coverage-gaps) plus the WIRING-AUDIT method gaps:

- `settings-public-test` — anonymous `GET /api/settings/public` allowlist in `api-wiring.test.ts`
- `asset-delete-test` — scoped `DELETE /api/projects/:id/assets/:assetId` (wrong project 404, then delete)
- `lead-email-test` — route wires `sendLeadNotificationEmail`; mocked mailer called per admin
- `ai-contract-test` — `contract-ai.test.ts` runs `reviewContract()` against a stubbed `@anthropic-ai/sdk` (no live key)
- `proof-card-test` — `proof-card.test.ts` render-tree of `getProof()` fallbacks
- `wiring-method-test` — bulk lead, convert, team reorder, broadcast, availability

Full web suite **114/114**. Scoring: those six ids PASS; `monitor-backup` stays PASS.

### Honest open-items
- Site lane still owns `destination-test` (role redirect) and the leftover coverage rows it claims.
- Mobile drawer e2e is still untested (playwright, not this lane).
- Do not merge this branch; other lanes land first (`plan.json` merge_order).

## 2026-08-15 — ops: Vertex brand-analysis gone + installable PWA

> Roadmap-remain lane `ops`. Scoring: `brand-analysis-gone`, `monitor-backup`, `pwa-install` PASS. Other ids stay FAIL.

- Deleted `apps/api/src/routes/brand-analysis.routes.ts` + `apps/api/src/services/brand-analysis.service.ts` and unmounted them from `apps/api/src/index.ts`. Claude contract/PM assist untouched. Structural vitest: `apps/web/src/test/brand-analysis-decommission.test.ts`.
- PWA Tier 1: `manifest.webmanifest` (standalone, `/hub`, `#0A0A0A` / `#E67A3A`) + `vite-plugin-pwa` (`registerType: autoUpdate`). Icons 192/512/512-maskable/apple-touch from the inverted ADVO wordmark. Preview `http://127.0.0.1:6447/` serves manifest + `/sw.js` + `registerSW.js`.
- `docs/SETUP.md` nightly `pg_dump` + `apps/api/backup.sh` left as-is (`monitor-backup` stayed green).

### Honest open-items
- Live `GET /api/brand-analysis` 404 not hit against a running local API — this worktree has no `apps/api/node_modules` or `.env`.
- Chrome DevTools MCP could not attach (profile already running); Lighthouse + a real Android/iOS install were not run.
- PWA Tier 2 (offline / stale-while-revalidate) is out of this tier.
- Error tracking + uptime ping still not wired.

## 2026-08-15 — site lane: reduced-motion + white interiors + destinationFor

> Roadmap-remain lane `site`. Public marketing chrome honors reduced motion; `/start` `/login` `/team` `/project/:slug` interiors match the white shell; `destinationFor` is a tested pure function.

- `LandingPage` + `landing-shell` use `reduceMotion` / `prefers-reduced-motion` (hover lift + remaining framer loops gated).
- Login Linear grid (`hsl(var(--border))`) removed. ProjectDetail dropped leftover `glass` + honors reduced motion.
- Viewport/source check for the shipped `LandingPage`: `bench/roadmap/roadmap-remain/viewport-site.mjs` (not the Stripe bench).
- `destinationFor(role, explicitRedirect)` extracted to `apps/web/src/lib/destination.ts` + 5 vitest cases.

### Honest open-items
- Other seven lanes' ids stay FAIL. `monitor-backup` still PASS.
- Live Playwright overflow probe in `viewport-site.mjs` skips when `@playwright/test` is not installed; source check is the gate.
- `/hub` stays Linear / `FloatingNav`.

## 2026-08-15 — wiring leftover (W1–W5, R3–R4)

> Roadmap-remain wiring lane. Close the WIRING-AUDIT half-built admin items this lane owns.

- **W1** Settings branding hydrates from `GET /api/settings/agency_name` (+ domain/accent/logo).
- **W2** Add Admin creates a login-capable `user` with `role: "admin"` (temp password emailed / shown once).
- **W3** Auto-rule toggles labeled inactive; `POST /api/notifications` reads them before send.
- **W4** Dashboard Recent activity uses real `getRecentProgressUpdates` (project update feed, not `{ data: [] }`).
- **W5** Social platform stats show queued post counts, not fake follower numbers.
- **R3** Team drag-reorder mutates `allMembers`, not the filtered visible subset.
- **R4** `useAdminTeam` reads `team_order` from `GET /api/settings/public`.

### Honest open-items
- Event triggers in `projects.routes.ts` / invoices / deliverables still do not call the auto-rule helper (those files are another lane).
- W7 scraper delete + R2 asset select + W8 public-settings test belong to admin/test lanes.
- API `tsc` on this machine is red (no `apps/api/node_modules`); not fixed with lockfile churn.

## 2026-08-15 — lane/admin: library, full-page CRUD, Tools scrapers, `/p/:token`

> Roadmap-remain admin lane. Ships the P2 admin surface: Library MVP, Projects/Clients as pages, collapsed Tools scrapers, branded preview gate, controlled add-asset, scraper history delete.

- **Library** — `/admin` → Library. `library_item` (011) + `/api/library` + grid/filter/drawer. Types: website / prompt / module / asset / doc.
- **Project / client forms** — high-field create/edit is a full page (`projectFormMode` / `ClientForm`), not a dialog.
- **Tools submenu** — Brand + FB scrapers sit behind `toolsExpanded`.
- **Preview** — public `/p/:token` branded gate → `GET /api/preview/:token`.
- **R2 / W7** — add-asset type/url/caption is controlled `assetType` state; scraper history has delete; new brand saves omit base64 screenshots.

### Honest open-items
- Library does **not** upload files to `/var/advo/library/` — URL metadata only. Apply `011_library_item.sql` on merge (do not use the shared 6407 DB from this lane).
- Show-Client-Now still *mints* `api.advo.ph/api/preview/<token>` URLs; the pretty path exists for humans to share. Rewriting the mint is a follow-up (Command Center is staff-owned).
- here.now ephemeral deploy still deferred.

## 2026-08-15 — lead lane: import, targeting, proposal tracker + template-fill

> Roadmap-remain lane `lead` (`lane/lead`). Ships the P1 lead-gen + P0 proposal-pipeline items that are code-buildable.

- **lead-import** — `npx tsx scripts/import-clinic-lead.ts` + `data/clinic-lead/sample.json`. Dedupes by email in-file and against existing `lead` rows. The 5K Messenger dump is a path argument when present; sample fixture is 6 rows (1 duplicate) so we do not invent 5K clinics.
- **targeting-rule** — `/admin` → Leads “Outdated only” toggle. `lib/targeting.ts` scores zero/outdated systems up and modern stacks (Shopify/Inventi/…) to 0.
- **proposal-tracker** — `/admin` → Proposals. `proposal` table statuses: sent / opened / replied / signed.
- **proposal-pdf** — Generate fills CONTRACTS.md clauses + lead fields into printable HTML (`POST /api/proposal`, `GET /api/proposal/:id/pdf`). AI generation deferred.
- Surgical mount in `Admin.tsx` + `AdminSidebar.tsx` (admin-lane files) so the Proposals section is reachable and scoring `/proposal/i` is true. Merge-order is lead then admin — keep the add additive.

### Honest open-items
- Full 5K archive is not in-repo; run the importer with the dump path when it exists.
- Proposal document is HTML print-to-PDF, not a binary PDF library.
- Clauses stay draft until the lawyer item.
- Local preview used lane DB `advo_lead` (API :6411) because staff already owns :6407.

## 2026-08-15 — hub: change-order form (`change-order-form`)

> Lane hub. Client files a change order (scope + reason) from `/hub` against CONTRACTS.md policy 3; team lists it.

- Migration `009_change_order.sql` + `change_order` table in `schema.ts`.
- `POST/GET /api/change-order` (client scoped to own projects; team sees all). `PATCH` (team) quotes `price_cents` / `timeline_note` / status.
- Hub project dashboard: Change order panel — form + filed list.
- Bench: `change-order-form` PASS. `monitor-backup` still PASS.

### Honest open-items
- No admin UI for quoting — team uses `GET`/`PATCH /api/change-order`. Command Center is another lane.
- Quote → client-sign flow is API-ready (`signed`) but the hub form only files; no client-confirm button yet.
- Binding language still needs the lawyer (`legal-bind` / `lawyer` are out of this tier).

## 2026-08-15 — staff lane: capacity, junior assign, school blackout

> Roadmap-remain lane `staff` on `lane/staff`. Scoring: `capacity-view`, `junior-assign`, `blackout-calendar` PASS; `monitor-backup` still PASS.

- **Capacity** — `GET /api/projects` already returned `teamMemberId[]`; extracted `attachTeamMemberId` + `projectCountByMember` / `capacityRemaining`. Availability member tabs show active-project count + remaining (soft cap 3).
- **Junior assign** — `POST/DELETE /api/projects/:id/team` (keeps existing `/access`). Command Center Overview **Team** panel assigns a junior (role match junior/dev/intern).
- **Blackout** — Calendar paints a togglable **School blackout** layer from weekly school/unavailable blocks.

Walked on `http://127.0.0.1:6440/admin`: Availability chip `1 proj · 2 left`, Calendar Mondays show `Angelo Revelo: pre-fi finals`, Command Center assign + remove.

### Honest open-items
- Other seven lanes still FAIL on the remain bench (expected).
- AdminProjects still assigns via `/access` (admin lane owns that file).
- Did not apply migrations in this commit; local preview needed 007/008 already in the repo.

## 2026-08-15 — docs: shipped `LandingPage` is the current `/`

> Landing-follow docs lane. A new agent reading README + ROADMAP should be told the truth: `/` is the shipped Codex `LandingPage` (`278a65a`), not the old 3D / TechTicker / orange-blob page, and the landing is not in-progress.

- [README.md](../README.md) Features → Public Site + Design System now describe `LandingPage` / `landing-page.css` (white editorial). Admin/hub stay Linear dark.
- [ROADMAP.md](ROADMAP.md) intro no longer calls the Codex landing in-progress or a hero+services-only copy port.
- [FEATURES.md](FEATURES.md) Public Landing + [MOODBOARD.md](MOODBOARD.md) type/look rows match the live page.

### Honest open-items
- Copy + route + docs lanes are merged to `main`. `/start` `/login` `/team` `/project/:slug` use `landing-shell`; inner page bodies still use dark Linear tokens on the white chrome.
- `/hub` stays Linear / `FloatingNav`.
- Do not invent a newsletter API, client-logo strip, or dashboard redesign.

## 2026-08-14 — host `advo`, ports 6400/6407, admin/meeting/expense on `main`

> User: *"i want to change the name of my contabo repos"* / *"go /cleanup commit merge to main"*. The ADVO-PH box is **`ssh advo`** (was Contabo `vmi3170887`). Local + prod API **6407**, web **6400** (claimed block 6400–6499; do not share sisia's 6107). `deploy.sh` defaults `VPS_SSH=advo`. Expense / meeting / PM-assist WIP fast-forwarded to `origin/main` (`c75fc3d`); parking-lot `wip/admin-meeting-expense` deleted after land. Three-box contract: `booted/docs/vps.md`. Ledger: `~/Antigravity/PORTS.md`.

### Honest open-items
- **Calendar endpoints still have no automated test** (carried from 2026-06-20).
- **`.grok/` leftover** untracked; not committed.
- **Meeting/expense has no dedicated test** beyond what was already in the suite — new routes landed with the product WIP.
- This session did not re-smoke `api.advo.ph` after the 6407 retarget from this machine.

## 2026-06-20 — ADVO records calendar (Phase 1)

> Merged to `main` (`0018c3e` + `80f076e`). API + web typecheck 0/0, both builds ✓, suite 81/81. **Deployed (API + web + migration 003)** — `/api/calendar` live (401-gated), advo.ph serves `index-C1JfRqd4.js`, migration applied to prod as the app DB user. User: *"for availability, I feel like we can just make that a calendar... a full out calendar that's connected to deliverables, financing, BIR compliance, content, social aspects, posting, cold emailing."*

Phase 1 of the all-around calendar (the vision is much bigger — see open-items).
- Backend: new `calendar_event` table (migration `003`, per the database-conventions skill — see [SCHEMA.md](SCHEMA.md)). `GET /api/calendar?from&to` ([calendar.routes.ts](apps/api/src/routes/calendar.routes.ts), requireTeam) returns **manual events UNION derived** events computed at read time from deliverables (due), invoices (due + paid), and projects (kickoff). POST/PATCH/DELETE manage manual events.
- Frontend: [AdminCalendar.tsx](apps/web/src/components/admin/AdminCalendar.tsx) — month grid, dot-coded event chips, prev/today/next, category-filter legend, today highlight, click-day-to-add, edit/delete dialog (title/category/date/all-day/time/location/notes). [useCalendar.ts](apps/web/src/hooks/useCalendar.ts) hook. Wired "Calendar" into the Operations nav.
- Verified: read path live-tested locally (real deliverable/invoice/kickoff events rendered across months); migration applied + table confirmed local + prod.

### Honest open-items
- **Calendar endpoints have no automated test** — `/api/calendar` GET/POST/PATCH/DELETE aren't in `api-wiring.test.ts`. Add a range-GET + create/delete assertion.
- **Authenticated create not live-tested on prod** — no prod admin creds in hand; the write path is deployed + compiles + uses the same insert/mutation pattern as other working CRUD, but a live "Add event" click should confirm it.
- **Phase 2** (not started): contracts/MOAs, meetings, BIR deadlines, content/social posting, cold-email cadence as event layers — some need their own tables/fields first.
- **Phase 3** (not started): Google Calendar + ICS sync — needs the owner's **two-way vs read-only** decision.
- **Availability** page still in the nav; folds into the calendar (team-availability layer) once the calendar is proven.

---

## 2026-06-20 — Linear-inspired UI redesign (admin + hub + design system)

> Merged to `main` (`d728c2e` → `8d67d82`, + refinement `eab41ea`). API+web typecheck 0/0, lint 0 err, builds ✓, full suite **81/81**. **Deployed (web).** User: *"this font is screaming ai"* · *"I'd like the design... more compressed... not follow a template... more humane."*

Full redesign of the admin console + client hub to a Linear-inspired language, validated against the captured Linear spec in the local `Codex/design.md` repo. Design preference saved to memory (`feedback_design_language`).
- **Foundation** (`d728c2e`): cooled the palette to a cool near-black canvas + charcoal panels (kept ADVO orange accent), dark-first; swapped Geist/Geist Mono → **Hanken Grotesk** and removed all `font-mono` (the loudest "AI" tell); shared admin primitives in [_ui.tsx](apps/web/src/components/admin/_ui.tsx) (PageHeader/StatStrip/Stat/Panel/Empty/Dot/Table).
- **Compression** (`cbcfd5f`): killed the AI tells (greeting hero, "Admin" badge, icon chips, uniform floating cards, motion fade-ins); list pages → **dense tables**, summary pages → stat-strip + hairline panels. Propagated across all 17 admin sections via parallel agents + the Command Center.
- **Hub** (`8d67d82`): same language, compressed.
- **Refinement** (`eab41ea`): snapped tokens to Linear's exact values (canvas `#08090a`, card `#0f1011`, hairline `#23252a`, muted `#8a8f98`); radius 8px → 6px.

### Honest open-items
- Presentation-only — no logic changed; 81/81 suite still green (it tests API wiring, not styling).
- Landing page also picked up Hanken (the font is global) — owner OK'd one cohesive brand font.
- Availability page restyled but not restructured (becomes the calendar — see the entry above).

---

## 2026-06-20 — "go build these" batch: email-on-lead · S4 closed · Files pillar · AI contract review

> Merged to `main` (4 commits, `8bc719f`→`fae49dd`). API + web typecheck 0/0, lint clean (0 err), both builds ✓, full suite **81/81** against the live dev API. **Deployed (API + web)** — health 200, advo.ph serves `index-Mnygn4dS.js`, new routes live (401-gated).

Four open items from prior handoffs, shipped together:

1. **Email-on-new-lead** (`8bc719f`) — `POST /api/leads` fire-and-forgets a notification to every admin (`user` where role='admin') via `sendLeadNotificationEmail` (HTML summary + link to `/admin`). Resend SMTP when `RESEND_API_KEY` set, else logs only; failures swallowed so they never block lead creation. ([leads.routes.ts](apps/api/src/routes/leads.routes.ts), [email.service.ts](apps/api/src/services/email.service.ts))
2. **S4 closed** (`9574820`) — [github.ts](apps/web/src/lib/github.ts) / [cloudflare.ts](apps/web/src/lib/cloudflare.ts) no longer read `VITE_GITHUB_TOKEN`/`VITE_CLOUDFLARE_TOKEN` or call api.github.com / api.cloudflare.com from the browser. Commits + branches route through the backend (server-side token, github_event cache); enrichment with no backend endpoint degrades to null/[]/0. Tokens were never set in prod, so this removes the footgun, not an active leak. Live bundle has 0 token literals.
3. **Files/Drive pillar** (`bdf1a8b`) — per-project file drive in the Command Center: [useProjectAssets.ts](apps/web/src/hooks/useProjectAssets.ts) (list / upload via storage+record / optimistic delete) + `DELETE /api/projects/:id/assets/:assetId` (requireTeam, scoped) + a Files tab (upload, thumbnail grid, download, delete).
4. **AI contract review** (`fae49dd`) — `reviewContract()` now runs Claude (`claude-opus-4-8`) against ADVO's 5 contract policies when `ANTHROPIC_API_KEY` is set, and falls back to the existing heuristic on a missing key or any AI error / malformed output. Same `ContractReview` shape + route + UI; `method` is `"ai"` vs `"heuristic"` and the disclaimer reflects which ran. Adds `@anthropic-ai/sdk`. (Read the claude-api skill first: TS SDK, opus-4-8, strict-JSON prompt + parse/validate.)

### Honest open-items
- **AI contract path is untestable without a key** — prod has no `ANTHROPIC_API_KEY`, so live contract review still runs the **heuristic** (correct fallback). To activate the AI path: add `ANTHROPIC_API_KEY` to the VPS `.env` + `pm2 restart advo-api`. The heuristic stays covered by the existing contract tests.
- VPS `/opt/advo` had a drifted tracked `package-lock.json` (prior `npm install`); resolved with `git checkout -- package-lock.json` before the pull (**not** `stash -u`). Future pulls may hit the same — discard the lock, never sweep untracked.
- **Test-coverage gaps (low severity, verified manually this/prior session):** `DELETE /api/projects/:id/assets/:assetId` has no dedicated test (the GET-assets list is exercised in `e2e-flow.test.ts`); the fire-and-forget email side-effect on `POST /api/leads` isn't asserted (the lead-create path is). Both were proven live earlier (asset add→delete; leadId 154 email fired). Add an asset-delete + a lead-email-trigger assertion when convenient.
- Still open from prior: pretty `advo.ph/p/<token>` preview route; here.now fresh-deploy path; import the metro-manila clinic leads from the Messenger archive.

---

## 2026-06-20 — Command Center: Dev/Deploy pillar (Show Client Now)

> Merged to `main`. typecheck 0/0, lint clean, build ✓, full suite 81/81 (+3). Backend flow proven end-to-end via curl. **Deployed (API + web).**

Second pillar: the "Show Client Now" preview flow + client-initiated requests. Owner chose the **expiring-link-to-stored-preview** approach (no external dep / key) over a full here.now integration.

- Backend:
  - [preview.service.ts](apps/api/src/services/preview.service.ts) — signs a short-lived (20 min) HS256 token bound to a projectId (reuses `JWT_SECRET`/jose).
  - `POST /api/projects/:id/preview-link` (requireTeam) → mints `{ url, expiresAt, ttlMinutes }` where url is `…/api/preview/<token>`.
  - `GET /api/preview/:token` (**public**, [preview.routes.ts](apps/api/src/routes/preview.routes.ts)) → verifies + **302-redirects** to the project's `preview_url`; bad/expired token → branded 410 gate page. Host-agnostic.
  - `POST /api/projects/:id/preview-request` (auth + `assertProjectAccess`) → logs to `activity_log` (action `preview_requested`). `GET /api/projects/:id/preview-requests` (requireTeam) → team sees them.
- Frontend:
  - Command-center Dev tab: real **Show Client Now** card (Generate link → copyable, "expires in 20 min") + a "Client requests" list. Header button now jumps to the Dev tab (controlled tabs).
  - **Client Hub** ([ProjectDashboard.tsx](apps/web/src/components/hub/ProjectDashboard.tsx)): a **"Request a preview"** button → notifies the team (owner's ask).
- Verified: curl proved mint→302→request→list; 3 new endpoint tests (mint 200, bad token 410, request logged) pass in the 81/81 suite; typecheck + build clean.

### Honest open-items
- Admin generate-link **UI** verified via backend + build + the rendered Dev panel, but the final on-screen link render wasn't browser-clicked this run (MCP browser flaked on lock contention). Low risk — thin React-Query render over a proven endpoint.
- **S4 NOT closed** — this pillar added the preview flow but did not route the GitHub feed through the backend; `VITE_GITHUB_TOKEN`/`VITE_CLOUDFLARE_TOKEN` are still in the bundle. Separate task.
- Preview link is `api.advo.ph/api/preview/<token>` (functional, slightly unbranded) — a pretty `advo.ph/p/<token>` frontend route is a polish follow-up.
- here.now fresh-deploy path deferred (needs a here.now API key + per-project build artifacts) — the link approach is host-agnostic and works today.

---

## 2026-06-20 — Command Center: Contracts pillar (red-flag review)

> Merged to `main`. typecheck 0/0, lint clean, build ✓, full suite 78/78 (+3), browser-verified. **Deployed (API + web).**

First real pillar filled into the command center: the Contracts tab now runs a **heuristic red-flag review** of a pasted contract/SOW against ADVO's own [CONTRACTS.md](CONTRACTS.md) policies.
- Backend: [contract-review.service.ts](apps/api/src/services/contract-review.service.ts) (pure function, LLM-ready shape) + `POST /api/contracts/review` ([contracts.routes.ts](apps/api/src/routes/contracts.routes.ts), requireTeam) mounted at `/api/contracts`.
- Checks 5 policies (downpayment floor 40%/₱30k · 2 revisions/phase · change-order clause · late-payment · termination) → per-policy red/amber/green + verdict (good_to_go / needs_work / high_risk) + summary + disclaimer.
- Frontend: [useContractReview.ts](apps/web/src/hooks/useContractReview.ts) + the Contracts tab (paste → Check → verdict badge + flag list + disclaimer).
- Verified: silent contract → **high_risk (5 red)**; complete contract → **good_to_go (5 green)** — both in tests + a live browser run.

**Why heuristic, not AI:** there is **NO LLM configured anywhere** — no Vertex/Google/Anthropic env keys, no GCP creds, `GOOGLE_APPLICATION_CREDENTIALS` unset on local + VPS. The existing Gemini brand-analysis service is non-functional for this reason (hence orphaned). The review's return shape is LLM-ready: swapping `reviewContract()` to call a model later is a one-function change — needs a key (owner chose heuristic-only for now; recommended upgrade = add `ANTHROPIC_API_KEY` and use Claude).

### Honest open-items
- Heuristic = presence check, not legal analysis (disclaimer says so). Upgrade to real AI when a key is added.
- No PDF auto-extract yet — user pastes text (contract_url is just a link). PDF→text extraction is a follow-up.
- No persistence — the review is stateless (not saved per project). Status tracking (draft/sent/signed) is future.
- **Dev/Deploy pillar still to build** — incl. owner's new ask: clients should be able to **request** a temporary preview from their Hub. Owner's "here-dot-now" = **here.now** (instant web hosting for agents) — the intended mechanism for Show-Client-Now.

---

## 2026-06-20 — Project Command Center (shell)

> Branch merged to `main`. typecheck 0/0, lint clean, build ✓; walked through in a real browser. Web-only — **not yet deployed**. New feature, not an audit item.

First slice of the per-project "command center" vision (owner wants a Drive + dev/deploy status + "show client now" + contracts/AI-review, role-aware for manager/dev/finance, "benefit but don't overwhelm"). Chose **shell-first**: structure before features.

- New [ProjectCommandCenter.tsx](apps/web/src/components/admin/ProjectCommandCenter.tsx) — opened via a new **Open** button on each card in `AdminProjects` (early-returns into the command center; `openProjectId` re-derives from the live list so it stays fresh). Header (title/status/client/value/repo/preview + a disabled **Show Client Now**) + 6 tabs:
  - **Overview / Deliverables / Finance** — REAL data (project fields + payment progress; project-scoped deliverables via `useAdminDeliverables`; project-scoped invoices via `useInvoices`).
  - **Files / Dev & Deploy / Contracts** — `ComingNext` scaffolds that spell out each pillar (Project Drive on `project_asset`+R2; Show-Client-Now expiring preview link, host-agnostic, also closes S4; contract status + AI red-flag review against CONTRACTS.md). Each scaffold names which role it serves.

**Key insight (owner's "here-dot-now"):** that's **here.now** — "instant web hosting for agents". It's the right mechanism for the instant/ephemeral preview pillar (far better than fighting Vercel's persistent previews). Design Show-Client-Now around here.now when that pillar gets built.

### Honest open-items
- **Not deployed** (web-only — needs `build:web` + rsync).
- Shell only — Files/Dev/Contracts panels are scaffolds, no functionality yet. Next: pick a pillar to fill (owner leaning order TBD; my rec was Contracts AI-review first for business value, but they chose shell-first to see structure).
- Command center doesn't yet host Post Update / Edit (those still live on the list cards) — could move in later.

---

## 2026-06-20 — Tier 2 quick-fix batch (5 broken/papercut items)

> Merged to `main`. typecheck 0/0, lint clean, build ✓, full vitest 75/75. Each fix verified at runtime. **Touches API + web — needs both deploys.**

Knocked out five small verified-broken items from the audit in one pass:
- **B2** — health badge always read "Disconnected". `checkConnection` ([db.ts](apps/web/src/lib/db.ts)) now reads the raw `db` field from the un-enveloped `/api/health` instead of `res.data?.db`. Browser-verified: Settings shows **Connected**. (Endpoint shape unchanged → health tests + monitors unaffected.)
- **B3** — removed the no-op "Quick action" dashboard button (`AdminDashboard.tsx`).
- **R1** — invoice PATCH now clears `paid_at` when status leaves "paid" ([invoices.routes.ts](apps/api/src/routes/invoices.routes.ts)). API-verified: paid→stamps, overdue→clears.
- **W6** — dashboard "View all" leads CTA was a dead `#leads` anchor; now a button calling `onNavigate("leads")` threaded from `Admin.tsx`. Browser-verified: switches to Leads tab.
- **R5** — broadcast notification loop wrapped in try/catch so a client deleted mid-broadcast is skipped instead of 500ing the whole call ([notifications.routes.ts](apps/api/src/routes/notifications.routes.ts)). (The `fileParallelism:false` test fix from the gate stays.)

### Honest open-items
- **Deploy pending** — this batch changes both `apps/api` (invoices, notifications) and `apps/web` (db, dashboard, Admin), so it needs API rebuild+restart AND web build+rsync.
- Remaining Tier 3: W1 (settings not read back), W2 (Add-Admin), W3 (notif toggles), W4 (dashboard recent-activity stub), W5 (social mock stats), W7 (scraper delete+bloat), W8 (settings/public test); R2/R3/R4 edges. Plus **S4** (browser tokens).

---

## 2026-06-20 — B1: Deliverables CRUD UI (admin)

> Branch merged to `main`. Build + typecheck clean; full vitest suite 75/75; CRUD verified end-to-end in a real browser. **Not yet deployed** (frontend — needs VPS `build:web` + rsync).

Closed the audit's biggest functional gap (B1): the Deliverables panel (`AdminSchedule`) was entirely read-only despite a ready backend. Now full CRUD:
- [useAdminDeliverables.ts](apps/web/src/hooks/useAdminDeliverables.ts) — added create/update/delete mutations + an optimistic inline status mutation, `toApiPayload` (snake→camel), react-query invalidation to re-pull the joined list.
- [AdminSchedule.tsx](apps/web/src/components/admin/AdminSchedule.tsx) — Add/Edit dialog (project, title, description, assignee, status, priority, due date), per-card inline status quick-change, delete (dialog footer), empty-state CTA. Matches the `AdminAvailability` dialog pattern.

Verified in-browser (logged in as admin, local API): created "Gate Verify" deliverable → appeared with correct project/assignee/status; inline status → Completed persisted with `completedAt` set; edited title → persisted; deleted → removed from DB. Each step confirmed against `GET /api/deliverables`.

### Honest open-items
- **Not deployed yet** — frontend change; live admin still read-only until VPS `npm run build:web` + `rsync apps/web/dist/ /var/www/advo/dist/`.
- No automated UI test for the CRUD (verified manually in-browser). The API endpoints it uses are covered by the wiring suite.
- Remaining Tier 2: B2 (health-badge envelope), B3 (no-op dashboard button), the write-only Settings/notification items, S4 (browser tokens).

---

## 2026-06-20 — Tier 1 security fixes shipped + deployed

> Merged to `main` (`0e42f13`). Build: api+web typecheck clean; api-wiring suite 30/30 local. Prod: **deployed to api.advo.ph** (PM2 `advo-api` rebuilt + restarted from `0e42f13`).

Fixed the three verified cross-tenant data leaks from the wiring audit (S1/S2/S3) — all were `requireAuth`-only with no ownership scoping:
- **S1** `GET /api/deliverables` now role-branches (client → own projects, team → granted projects, admin → all). Was leaking every client's deliverables to any logged-in client.
- **S2** `GET /api/projects/:id` (+ `/updates`, `/github`, `/assets`) gated by a new `assertProjectAccess()` (404, not 403, so IDs can't be probed). Was an IDOR exposing any project incl. financials.
- **S3** `PATCH /api/notifications/:id/read` scoped to the caller's own `clientId` for non-admins.

Pattern copied from the already-correct `invoices.routes.ts` role-branch. Added a **regression test** ("cross-tenant data scoping" in `api-wiring.test.ts`) + a `client@advo.ph` seed fixture; proved teeth by reverting the handlers (tests went red) then restoring (green). Deploy: VPS `git pull` bc0ac03→0e42f13 + `npm run build:api` + `pm2 restart advo-api`; verified `assertProjectAccess` in the compiled dist + live `/api/health` OK.

### Honest open-items
- **S4 still open** — `VITE_GITHUB_TOKEN`/`VITE_CLOUDFLARE_TOKEN` are inlined into the public browser bundle. Fix = route the engineering feed through the backend `/api/github/*` cache (currently orphaned). See [WIRING-AUDIT.md](WIRING-AUDIT.md).
- The `client@advo.ph / changeme` seed fixture is a weak credential — fine for dev, but **do not run `db:seed` against prod**.
- Local dev DB was synced (`db:push`) + seeded during testing — local only, no prod impact.
- Tier 2 audit work (B1 Deliverables CRUD UI, B2 health-badge envelope, write-only settings, etc.) untouched — next up.

---

## 2026-06-20 — Feature wiring audit (admin + client surface)

> Branch: `main`. No code changes — investigation only. Output: [WIRING-AUDIT.md](WIRING-AUDIT.md).

Cautious pre-build audit (owner + Prince had hit many broken features). Traced all 15 admin sections + the client portal end-to-end (UI → API client → route → DB) via 5 parallel sub-audits + a frontend↔backend cross-reference. **Headline: wiring is clean** — every frontend call resolves to a real route, 0 broken/shadowed, casing+auth correct on wired paths. The real issues (full detail + fixes in [WIRING-AUDIT.md](WIRING-AUDIT.md)):

- **🔴 Security (verified, live):** `GET /api/deliverables` leaks all clients' deliverables (S1); `GET /api/projects/:id` IDOR exposes any project + financials (S2); `PATCH /api/notifications/:id/read` no ownership check (S3); `VITE_*_TOKEN` inlined into the public bundle (S4). Fix by copying the role-scope pattern in `invoices.routes.ts`.
- **🔴 Broken admin UI:** Deliverables (AdminSchedule) is entirely read-only — no CRUD controls despite a ready backend (B1); health badge always "Disconnected" — envelope mismatch (B2); a no-op dashboard "Quick action" button (B3).
- **🟡 Write-only/stub:** settings branding not read back; "Add Admin" creates a `team_member`, not an admin `user`; notif auto-rule toggles inert; dashboard recent-activity stub; social mock stats; scraper no-delete UI + base64 bloat.
- **⚪ Dead code:** backend GitHub cache + `brand-analysis.routes.ts` orphaned (~14/63 endpoints unused).

Decided this session: "prompt management system" = **AI prompt management** (author/version/test the Vertex prompts used by scrapers + the future proposal generator). Leads management already exists + fully wired; "customer management" = a CRM unifying leads + clients with an interaction timeline (the `activity_log` table exists but is surfaced nowhere).

### Honest open-items
- **Nothing fixed yet** — this is an audit. Tier 1 = the S1–S3 security fixes (small; copy the invoices scoping pattern). Tier 2 = Deliverables CRUD UI (B1). Full tiered action plan in WIRING-AUDIT.md.
- S1/S2 data-scoping bugs have **no regression test** — add one alongside the fix.

---

## 2026-06-20 — DB audit Tier 2: explicit ON DELETE on 8 FKs

> Branch: `db/audit-tier2-fk-policies` (not yet merged). Build: `apps/api` typecheck green. Prod: migration `002` applied live — all 18 FKs now carry an explicit policy.

Picks up the **8 FKs without explicit ON DELETE** open-item from the previous session. drizzle-kit `push` creates FK constraints but never ALTERs an existing one's action, so the DB had drifted to `NO ACTION` (RESTRICT-like) on 8 FKs — and it was actively blocking real deletes: `DELETE /api/team/:id` failed when a member had assigned deliverables/leads, and client-delete couldn't cascade through a project that had notifications.

**What shipped:**
- New migration [`002_audit_tier2.sql`](../apps/api/migrations/002_audit_tier2.sql) — `DROP`/`ADD CONSTRAINT` to set `ON DELETE` on all 8, applied to prod in one transaction.
  - **CASCADE** (drift-repair — schema.ts already declared it): `github_event.project_id`, `notification.project_id`.
  - **SET NULL** (nullable ref — detach, don't erase or block): `activity_log.user_id`, `deliverable.assigned_to`, `lead.assigned_to`, `scrape_result.scraped_by`, `client.user_id`, `team_member.user_id`.
- Per-FK policy decided with the database-conventions skill (rule 17). The two judgment calls — `client.user_id` and `team_member.user_id` — were confirmed **SET NULL** with the owner: deleting a login should preserve the business/billing record and the public team profile, not vaporize them (`team_member` already has `is_active` for hiding people).
- `schema.ts` mirrored — 6 `onDelete: "set null"` clauses added (the 2 cascades were already declared there). API `tsc --noEmit` clean.
- [SCHEMA.md](SCHEMA.md) migration-log row + 6 FK descriptions updated.
- **Verified:** `pg_constraint` now shows 12 CASCADE + 6 SET NULL, 0 NO ACTION. A rolled-back prod transaction proved deleting `team_member` 101 (3 assigned deliverables) now succeeds and sets `deliverable.assigned_to = NULL` instead of raising a FK violation.

### Honest open-items
- **No automated regression test for the FK policies.** Verified by hand (rolled-back txn). If a future raw migration reverts an action, nothing catches it — low risk (drizzle `push` won't touch FK actions), but a DB integration test asserting the delete-detach behavior would close it.
- Remaining Tier 2 hygiene unchanged: **19 of 20 tables still lack `COMMENT ON TABLE`**; `scripts/scrape-result-retention.ts` still unwritten.
- Branch `db/audit-tier2-fk-policies` not yet merged to `main`.

---

## 2026-06-19 → 2026-06-20 — Big session: monorepo, landing port, DB audit

> Range: `f024fae` → `0565510` (15+ commits). Branch: `main`. Build: green. Prod: live (frontend `index-Gpm-x0c2.js`, API uptime ~24h).

**What shipped, grouped:**

**Infra / restructure**
- Monorepo: two-repo split (`advo` + `advo-api`) merged into `apps/web` + `apps/api` under npm workspaces. VPS cutover completed (~30 sec downtime). Old `/opt/advo-api` kept intact as rollback. Runbook + gotchas in [CUTOVER.md](CUTOVER.md). Commits `f024fae`, `ad06a61`, `f3f3180`, `fd12d0b`.
- API repo initialized (was orphan, no `.git`) → `github.com/advo-ph/advo-api` (private). Now both halves are tracked.

**Auth + nav**
- Post-login role-based redirect: admins land on `/admin`, clients on `/hub`. `redirectAdminTo` prop on `ProtectedRoute` bounces admins off `/hub` too (`5c4a326`).
- Hub user card no longer hardcoded "Client" — shows actual role (`383f90b`).
- FloatingNav mobile menu: small popover → full-screen drawer with numbered tap rows, ADVO tagline header, bottom-pinned action grid. A11y (role=dialog, aria-modal/expanded), escape close, body scroll lock, prefers-reduced-motion. Commits `2360771`, `bc0ac03` (z-index fix — was equal to Hero's z-40, only bottom row peeked through).

**Landing copy + visuals**
- Hero headline default: *"We digitalize for you."* → *"Websites with the system behind them."* + product-system subtext. Structure / photo / stats unchanged (`38ff047`).
- ServiceTiers: generic agency tiers → 4 product surfaces (Website / Client Hub / Admin / Care Plan), section header *"One system, not just a website."* (`38ff047`).
- PortfolioCard: generic preview tile → proof card with outcome metric, products-used chips, launch timeline, result bullets, before/after ProofMock fallback. Section header: *"Proof, not just screenshots."* (`2360771`).
- Admin sidebar regrouped: flat 14 items → 4 labeled groups (Operations / Marketing Site / Pipeline / Tools) + Dashboard solo on top + Settings pinned bottom (`ae550e3`).
- Admin empty states with CTAs (Projects, Clients, Notifications); AdminLeads gets a hint pointing to advo.ph/start (`383f90b`).

**API**
- `GET /api/settings/public` — new anonymous endpoint exposing allowlisted keys (`social_links`, `brand_name`, `team_order`). Footer now calls this instead of admin-only `/api/settings`, eliminating per-pageview 401 (`a8a8cdc`).
- CORS allowlist extended to localhost:6100/6101 + 127.0.0.1 variants. Patched directly on VPS earlier in session; now reflected in source.

**Database**
- Tier 1 audit migration `001_audit_tier1.sql` applied: 3 missing FK indexes, `created_at` added to `site_config` + `site_content`, retention `COMMENT` on `scrape_result`. Schema.ts kept in sync (`0565510`).
- 2 test leads (`lead@test.com`) deleted from prod DB.

**Docs**
- New: [docs/ROADMAP.md](ROADMAP.md) — unified forward-looking roadmap synthesizing Messenger archive + landing/feature sub-roadmaps (`38b2daa`).
- New: [docs/CONTRACTS.md](CONTRACTS.md) — DRAFT policy + clauses for revision limits, downpayment floor, change orders. Needs legal review (`791a039`).
- New: [docs/CUTOVER.md](CUTOVER.md) — VPS monorepo cutover runbook + rollback plan (`ad06a61` + `f3f3180` + `fd12d0b`).
- New: ROADMAP.md at root, audits/, bench/ — codex/linear-design-system planning artifacts archived; PNGs gitignored (`256375f`).
- New: docs/SCHEMA.md migration log section + scrape_result + availability_block table docs.
- New: this file.
- Updated: docs/FEATURES.md (Public Landing section, Operational Docs table, shipped/open status), docs/SETUP.md (post-monorepo paths + cutover warning), README.md (Quick Start + Deployment paths).

**Codex/linear-design-system stash**
- The full landing redesign WIP was visually compared against Prince's deployed version and judged: keep Prince's foundation (distinctive 3D InfrastructureDiagram + tech ticker + team-photo hero), port only copy + product framing + portfolio proof cards + mobile drawer. Original WIP preserved in `stash@{0}` with descriptive label.

### Honest open-items

- **Email-on-new-lead notification.** Resend creds exist in `apps/api/.env`. User explicitly said "not yet" — punted to a later session. Until shipped, you only see leads by logging into admin.
- ~~**8 FKs without explicit ON DELETE.** DB drifted from schema (drizzle-kit push doesn't alter existing FK actions). Each needs per-FK decision (CASCADE / SET NULL / RESTRICT). Tier 2 audit work. Affected: `activity_log`, `client`, `deliverable`, `github_event`, `lead`, `notification`, `scrape_result`, `team_member` — see audit report in session conversation.~~ **✅ Resolved 2026-06-20** in `002_audit_tier2.sql` — see the Tier 2 entry above.
- **`scrape_result` retention script** mentioned in its COMMENT (`scripts/scrape-result-retention.ts`) doesn't exist. Table is fine at 4.7 MB today; only matters when scrape volume grows.
- **19 of 20 tables still have no `COMMENT ON TABLE`.** Tier 2 hygiene work.
- **Test coverage gaps** (see [ROADMAP.md → Open test-coverage gaps](ROADMAP.md#open-test-coverage-gaps)) — 4 untested behaviors shipped this session including the new `/api/settings/public` endpoint. The existing api-wiring test treats `/api/settings` as auth-required and wasn't updated for the public variant.
- **Capacity view in AdminAvailability** requires extending `GET /api/projects` (or new `GET /api/team/:id/projects`) to include team assignments. Audit done, no code yet.
- **Reduced-motion guards** are partial — Hero + FloatingNav have them, ContactCTA / TechTicker / InfrastructureDiagram don't.
- **TypeScript strictness mismatch:** `apps/api` is `strict: true`, `apps/web` has `noImplicitAny: false` + `strictNullChecks: false`. Probably accidental drift; tightening web would surface real null-safety bugs.
- **README has stale `advo-api/` path references** in code blocks not yet audited.
- **docs/SCHEMA.md still doesn't document `social_post` table indexes** and isn't a complete reference — drift accumulates.
- **Felici Round 1 revisions** still active per Messenger archive — apply new CONTRACTS.md revision-limit policy before any Round 2.
- **Coffee Rush proposal not yet sent** — first chance to apply the new downpayment floor + revision-allowance clauses.
- **Legal advisor not engaged.** All CONTRACTS.md clauses are DRAFT until reviewed by a Philippine corporate/cyber lawyer.

### Quick references next session needs

- VPS SSH alias: `advo` → `root@62.146.237.12` (in `~/.ssh/config`)
- Live URLs: `https://advo.ph` (frontend), `https://api.advo.ph` (API), `https://api.advo.ph/api/health` (health check)
- Prod DB: `ssh advo "sudo -u postgres psql advo"`
- Deploy: `./deploy.sh` (host `advo`; `--api-only` / `--frontend-only`). API cwd `/opt/advo/apps/api`, web `/var/www/advo/dist`.
- PM2: `ssh advo "pm2 list"` — process name `advo-api`, port 6407
- Codex WIP recall: `git stash show -p stash@{0} -- <path>` (do not pop; the stash is the archive)
