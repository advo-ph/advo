# Credentials, accounts and setup — how to get each one

Date: 2026-08-28
Scope: every key, account and external setup ADVO's code expects but does not have. Live state read
off `GET https://api.advo.ph/api/health`, live DNS (via [DNS.md](DNS.md), checked 08-24), and the env
schema in `apps/api/src/utils/env.ts`.

Each item says **who can get it** — that is the only field that determines what you can do today.

> **Status 2026-08-29 — four of these are now closed**, all verified rather than assumed:
> the Cloudflare Pages token (1), the Resend transactional key (new item 12), and the GitHub
> token plus webhook secret (10). What is left is `ANTHROPIC_API_KEY`, the mail-authentication
> DNS records, the outreach identity, and the three human-blocked items.

Sibling docs: [DNS.md](DNS.md) has the exact records; [ASK-IDENTITY.md](ASK-IDENTITY.md) has the
message to Prince; [LAWYER-OUTREACH.md](LAWYER-OUTREACH.md) has the counsel packet.

---

## The shared procedure — putting a secret on the box

Every API key below lands in the same place. Do it once, this way:

```bash
ssh advo
cp /opt/advo/apps/api/.env /var/tmp/advo-env-$(date +%Y%m%d%H%M).bak   # always back up first
nano /opt/advo/apps/api/.env                                            # add or edit the line
pm2 restart advo-api --update-env                                       # or it keeps the old value
curl -s https://api.advo.ph/api/health | head -c 400                    # confirm
```

`--update-env` is not optional. A plain `pm2 restart` reuses the environment PM2 captured at start,
so the new key is written to disk and ignored by the running process — which looks exactly like a
wrong key.

**Never commit a real key.** The `.env.example` files carry names and shapes only.

---

## 1. Cloudflare Pages API token

**Who can get it: you, right now.** This is the only credential on this list that ADVO issues for
itself — no third party, no review, no waiting. It is why the preview feature was built on
Cloudflare instead of here.now.

> ✅ **Done 2026-08-29.** Token issued with no TTL, Pages project `advo-preview` created
> (serving from `advo-preview-2bg.pages.dev`), all four vars set on the box and locally,
> `bench:preview` 8/8. The steps below are kept for reissuing it. Note that creating the
> project was also the only way to *prove* the token carries Pages:Edit — a read of
> `/pages/projects` returns `200` with an empty list whether you are allowed or scoped to
> nothing, so only a write settles it.

**What it unblocked:** "Show Client Now" deploying a real preview instead of the team pasting a
URL. Before the token, a live call returned Cloudflare error `9106: Authentication failed`.

1. Sign in at `dash.cloudflare.com`. Copy the **Account ID** from the account home sidebar.
2. Create the Pages project once, before the first deploy — the API deploys *into* a project, it
   does not create one. Either **Workers & Pages → Create → Pages → Direct Upload**, or
   `npx wrangler pages project create <name>`. The name you choose is `CLOUDFLARE_PAGES_PROJECT`.
3. **My Profile → API Tokens → Create Token → Create Custom Token.** Permission:
   **Account → Cloudflare Pages → Edit**. Scope it to this one account and nothing else — a token
   carrying Zone or DNS rights is a far worse thing to leak than a Pages deploy token.
4. Copy the token once; Cloudflare will not show it again.

**Where it goes:** `/opt/advo/apps/api/.env`

```
PREVIEW_HOST_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_PAGES_PROJECT=...
```

**Verify:** `npm run bench:preview` — `provider-credential-live` turns green. Until a real token
runs a real deploy, that row stays red and the roadmap says so.

**If you do nothing:** the adapter falls back to `manual`, today's paste-a-URL behaviour. Setting
the provider without a key is safe by design.

---

## 2. `ANTHROPIC_API_KEY`

**Who can get it: you, right now.** Two minutes, and the largest capability change per unit of
effort on this list.

**What it unblocks:** five features silently running their fallback path in prod — contract
red-flag review, meeting → tasks, timeline suggestion, revision-note polish, and proposal body
copy. Still missing as of 2026-08-29: `GET /api/health` reports
`config.isAnthropicKeyConfigured: false`.

1. `console.anthropic.com` → **API Keys → Create Key**. Name it `advo-prod`, so a later audit can
   tell it apart from a laptop key.
2. Set a spend limit in **Billing → Limits**. This key sits on an internet-facing server; a cap is
   the difference between a bug and a bill.
3. Add `ANTHROPIC_API_KEY=sk-ant-...` per the shared procedure above.

**Verify:** health shows `isAnthropicKeyConfigured: true`, then open a project's Contracts pillar
and confirm a review returns `method: "ai"` rather than `"heuristic"`.

---

## 3. Apex mail authentication — SPF, Workspace DKIM, DMARC reporting

**Who can get it: you (DNS) plus whoever administers Google Workspace.** No third-party approval.

**What it unblocks:** nothing — and do it anyway. `advo.ph` has **no SPF record at all**, and
Workspace has never signed a message. Every email the team sends is being delivered on reputation
alone. This is invisible until the day it isn't.

1. **Add reporting to the existing DMARC record first.** Costs nothing, and starts collecting the
   evidence you will want before step 4.
   `_dmarc.advo.ph` TXT → `v=DMARC1; p=none; rua=mailto:dmarc@advo.ph; pct=100`
   Make sure `dmarc@advo.ph` exists and someone reads it.
2. **Publish apex SPF.** One record, covering Workspace *and* Resend:
   `advo.ph` TXT → `v=spf1 include:_spf.google.com include:amazonses.com ~all`
   **Exactly one `v=spf1` record on a name.** Two is a PermError and fails worse than none.
3. **Enable Workspace DKIM.** Google Admin → **Apps → Google Workspace → Gmail → Authenticate
   email** → generate a new record → publish the `google._domainkey.advo.ph` TXT it produces → then
   return and click **Start authentication**. Workspace does not sign mail until you do this, which
   is why the selector is absent today.
4. **Later, once DMARC reports are clean,** move `p=none` to `p=quarantine`. Not before — enforcing
   while Workspace DKIM is still unpublished would quarantine the team's own mail.

**Verify:** `dig +short TXT advo.ph`, `dig +short TXT google._domainkey.advo.ph`,
`dig +short TXT _dmarc.advo.ph`.

---

## 4. The outreach sending identity

**Who can get it: you, in the Resend dashboard plus DNS.** Half a day, mostly waiting on
propagation.

**What it unblocks:** the 5,000-lead clinic campaign. Nothing else does.

**Why a subdomain and not the apex.** `advo.ph` carries client magic-links. If a cold send earns a
spam reputation, client logins go to spam with it. The preflight gate refuses an outreach domain
equal to the transactional one, and that refusal is deliberate: it is cheaper to publish a
subdomain than to recover a burnt sending domain. Do not "fix" the gate by pointing outreach at the
apex, and do not reuse `send.advo.ph`, which is already transactional.

1. **Resend → Domains → Add Domain** → `outreach.advo.ph`.
2. Publish **every record Resend shows you, verbatim** — the DKIM TXT, and the MX it issues for the
   custom return path. That MX is how bounce and complaint feedback reaches your domain, so skipping
   it is skipping the feedback loop. Note the selector in the DKIM record's name; for Resend it is
   `resend`.
3. Publish the two records Resend does not give you:
   `outreach.advo.ph` TXT → `v=spf1 include:amazonses.com ~all`
   `_dmarc.outreach.advo.ph` TXT → `v=DMARC1; p=none; rua=mailto:dmarc@advo.ph; pct=100`
   `include:amazonses.com` is correct **for Resend**, which sends over SES. A different ESP means a
   different `include:` — never guess one. A wrong include is a silent fail, and SPF caps at 10 DNS
   lookups.
4. Wait for Resend to show the domain **Verified**.
5. Set on the box:
   ```
   OUTREACH_FROM=hello@outreach.advo.ph
   OUTREACH_DKIM_SELECTOR=resend
   OUTREACH_SMTP_HOST=smtp.resend.com
   OUTREACH_SMTP_PORT=587
   OUTREACH_SMTP_USER=resend
   OUTREACH_SMTP_PASS=<a Resend API key created fresh for outreach>
   ```
   Issue a **separate** API key for outreach. Sharing the transactional key defeats the separation
   the whole design exists to create.
6. `npm run outreach:preflight`. It must print **6/6**. This is a switch, not advice: the sender
   refuses while the recorded verdict is failing, older than 30 days, or recorded for a different
   domain.

**Then warm the domain.** A new subdomain sending 5,000 cold emails on day one is the textbook way
to get it blocked. Start in the low hundreds and climb over two to three weeks.

**And note the gate above this one:** the RA 10173 lawful-basis question (item 8) is unanswered.
Technical clearance to send is not legal clearance to send.

---

## 5. The ESP bounce webhook — **needs code first**

**Who can get it: nobody yet. This is not a dashboard task, and the roadmap is misleading about
it.**

The roadmap says migration `020`'s endpoint "is ready, but no ESP webhook calls it yet," which
reads as *go configure a webhook*. You cannot. Two things block it:

1. **The endpoint is behind team auth.** `campaign.routes.ts:70` applies
   `campaignRoutes.use("*", requireAuth, requireTeam)` to every route below it, and
   `POST /api/campaign/delivery-failure` is below it. An ESP has no session and no JWT, so a
   correctly configured Resend webhook would get a `401` on every event.
2. **It expects ADVO's own payload, not an ESP's.** The handler validates
   `{ email, kind: hard_bounce | soft_bounce | complaint, campaignId? }`. Resend posts its own event
   shape (`type: "email.bounced"`, address nested under `data`), signed with a Svix signature
   header.

So the work is a small adapter route, not a dashboard setting: an unauthenticated
`POST /api/campaign/esp-webhook` mounted **above** the auth line, verifying the Svix signature with
a `RESEND_WEBHOOK_SECRET`, translating the ESP event into the existing internal shape, and calling
the same suppression functions. Signature verification replaces the auth middleware as the thing
that proves the caller is real — an unauthenticated, unverified suppression endpoint would let
anyone on the internet suppress any address.

Until that exists, hard bounces and complaints never reach the suppression list: the code is live
and deaf. **Do not start a campaign send before this is closed.** Sending without bounce processing
is how a fresh sending domain gets burned in a single pass.

---

## 6. PayMongo merchant account

**Who can get it: Prince, then a 14-business-day review.** Longest lead time on this list, so start
it the day the documents exist.

**Required documents** (sole proprietorship — the likely shape; confirm the entity type first,
which is question 2 in [ASK-IDENTITY.md](ASK-IDENTITY.md)):

- **DTI Certificate of Business Name Registration**
- **BIR Certificate of Registration (Form 2303)** — required, and *not* one of the five facts
  currently being chased. If ADVO is not BIR-registered, that is a separate and slower blocker.
- **Government-issued ID of the registered owner** (1 primary, or 2 secondary)
- If the person signing up is not the owner: a **notarized Special Power of Attorney** plus that
  representative's ID

**Steps**

1. Create the account at `dashboard.paymongo.com`, then open the **activation page** and upload the
   documents to upgrade to a fully verified merchant.
2. PayMongo reviews the **live website** as part of this. That is what `/terms`, `/privacy`,
   `/refund` and `/dispute` on advo.ph are for — all four are live, linked from the footer, and
   render merchant identity from one file. **They currently print "Not yet published" where the
   registration number, address and support phone go.** A reviewer reading that will not approve
   you, so fill `data/legal-identity.json` **before** submitting, not after.
3. Expect **up to 14 business days** after a complete submission.

**Verify (before submitting):** `npm run bench:paymongo` must print **7/7**. It is 5/7 today.

**Know this before spending effort here:** approval lets ADVO *accept* card and e-wallet payments,
but **there is no payment integration in this codebase.** No PayMongo, Stripe or Xendit SDK, no
checkout route, no payment or invoice table. Finance tracks recurring fees and commission splits as
records; nothing collects money. Approval is necessary and not sufficient — the checkout build is a
separate, unstarted project. Worth saying plainly so the merchant account is not mistaken for a
payments feature.

> PayMongo restructured its developer docs in 2026 and several onboarding URLs now 404 or redirect.
> Treat the document list above as the shape to prepare, and confirm it against the live activation
> page in the dashboard or `support@paymongo.com`.

---

## 7. The merchant identity facts

**Who can get it: Prince only.** Five fields off one certificate.

Fully written up in [ASK-IDENTITY.md](ASK-IDENTITY.md), including the message to send. Short
version: legal name, entity type, registering body plus registration number, registered address, and
a publishable support phone. A photo of the DTI/SEC certificate covers four of the five.

The same facts fill `data/legal-identity.json` (turning `bench:paymongo` 7/7 with no code change),
LEGAL-BRIEF Annex A, and the contract's own signatory block. One ask, three unblocks.

---

## 8. Legal counsel

**Who can get it: you, today — it is an email.**

Fully written up in [LAWYER-OUTREACH.md](LAWYER-OUTREACH.md): screening criteria, the covering
email, and what to update in this repo when an opinion comes back. The packet
([LEGAL-BRIEF.md](LEGAL-BRIEF.md)) has been send-ready since 08-23.

Send it to two or three practitioners in parallel — quotes for scoped work vary widely and the
brief costs nothing to send twice. **Send despite the blank Annex A.** Waiting on item 7 delays the
RA 10173 half, which is the half gating revenue, for a reason counsel does not need resolved in
order to quote.

---

## 9. `PLAUD_TOKEN`

**Who can get it: whoever holds the Plaud account.**

**What it unblocks:** the ADVO-folder watch and file-id import. Confirmed missing 2026-08-28 —
health reports `isDegraded: true`, reason `"plaud: Plaud auth is not configured"`. Share-URL import
works without it, which is why this has stayed unset.

The token is a consumer JWT from a signed-in Plaud session, not an issued API key, so it expires and
this will need redoing. Two ways to supply it: `PLAUD_TOKEN` directly, or point `PLAUD_AUTH_FILE` at
a `{ "token": "..." }` JSON file.

**Verify:** health shows `isPlaudTokenConfigured: true` **and** `plaud.isTokenUsable: true`. The
second is the one that matters — a stale token configures fine and works never.

---

## 10. `GITHUB_TOKEN` / `GITHUB_WEBHOOK_SECRET`

> ✅ **Done 2026-08-29.** Fine-grained PAT scoped to the `advo-ph` org, read-only, verified
> against the exact call the app makes (`GET /orgs/advo-ph/repos` → 23 repos, HTTP 200). A
> webhook secret was generated and set, an org-level webhook added, and the whole chain proved
> with a real push: `github_event` went 0 → 3 rows, one per commit, HMAC verified.
>
> ⏰ **This token expires 2027-08-29.** GitHub caps fine-grained PATs at a year, so unlike the
> Cloudflare token it is not forever. On expiry `github.routes.ts:131` returns
> `{ data: [], error: "GitHub token not configured" }` — the feed goes quietly empty with no
> health-check failure. The date is noted in both `.env` files where a debugger will look.

**Who can get it: you.** To confirm what is on the box:

```bash
ssh advo
grep -c '^GITHUB_TOKEN=.\+' /opt/advo/apps/api/.env
```

If it needs issuing: GitHub → **Settings → Developer settings → Personal access tokens →
Fine-grained**, scoped to the `advo-ph` org, read-only on contents and metadata. This token is read
server-side only. **Never reintroduce a `VITE_GITHUB_TOKEN`** — Vite inlines `VITE_*` into the
public browser bundle, which is the leak that audit item S4 (`9574820`) closed.

`GITHUB_WEBHOOK_SECRET` is any random string you generate, pasted identically into the repo's
webhook settings and the box.

---

## 11. Local development setup — this machine

**Who can get it: you, about fifteen minutes.**

This box has no `DATABASE_URL` and no JWT secrets, so `npm run test:local` cannot boot an API and
`api-wiring.test.ts` + `e2e-flow.test.ts` fail on a bare `npm test`. Environmental, not a regression
— but it means the suite never reads clean here.

1. Install PostgreSQL, then `createdb advo`.
2. `cp apps/api/.env.example apps/api/.env` and fill:
   ```
   DATABASE_URL=postgresql://<user>@localhost:5432/advo
   JWT_SECRET=<64 random chars>
   JWT_REFRESH_SECRET=<a different 64>
   ```
   Generate each with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   The schema requires 32+ characters and the API refuses to start below that.
3. Apply the migrations in order from `apps/api/migrations/` (through `021_deemed_approval.sql`),
   then `npm run migration:drift` to confirm the tree matches.
4. `npm run test:local` — it boots the API, runs vitest, and kills it afterwards.

Do **not** point local dev at the production `DATABASE_URL`. The e2e suite creates and deletes
records.

---

## 12. `RESEND_API_KEY` — transactional mail

> ✅ **Done 2026-08-29 — and it was a live outage, not a missing nice-to-have.**
> Prod had **no mail transport configured at all**: neither `RESEND_API_KEY` nor `SMTP_HOST`.
> `email.service.ts:44` handles that by logging and returning, so every magic link, team
> invite and lead notification was composed, addressed and dropped, and the caller saw
> success. 37 "no transport" lines sat in the last 400 log entries. `GET /api/health`
> reported `status: ok` throughout.

**Who can get it: you.** A send-only restricted key is the right shape — it can post mail and
nothing else (`GET /domains` returns `401 restricted_api_key`, which is correct, not a fault).

1. `resend.com/api-keys` → **Create API Key** → permission **Sending access**.
2. Add `RESEND_API_KEY=re_...` per the shared procedure.
3. **The domain must be verified in the same Resend account the key belongs to.** This is the
   step that actually bit: the key worked immediately, but both `advo.ph` and `send.advo.ph`
   returned `403 domain is not verified`, because live DNS already carried a
   `resend._domainkey` record issued to a *different, earlier* Resend account. A valid key
   plus an unverified domain fails exactly like a bad key, except the failure is swallowed.
   Add the domain at `resend.com/domains` and publish what it shows you.

**Verify — and verify the right thing.** The app sends over **SMTP** (`smtp.resend.com:465`
via nodemailer), not Resend's REST API, so a successful REST call proves nothing about the
path the app uses. Test the real one, from the box:

```bash
ssh advo
cd /opt/advo/apps/api && node -e "
const t = require('nodemailer').createTransport({host:'smtp.resend.com',port:465,secure:true,
  auth:{user:'resend',pass:process.env.RESEND_API_KEY}});
t.verify().then(()=>console.log('SMTP AUTH OK')).catch(e=>console.log('FAIL',e.message));"
```

Then send one to an address you can read, from `noreply@advo.ph` — the From is hardcoded at
`email.service.ts:50`, so any other sender proves nothing about magic links.

**The related defect, still open.** `send()` catches its own errors and logs them. A missing
key, an unverified domain, an expired credential — all of them fail invisibly, with health
still green. This is what let the outage run unnoticed. Fixing the swallow is tracked in
[ROADMAP.md](ROADMAP.md); until it lands, a working mail path has to be verified by sending,
never by reading a status page.

---

## Order to actually do these in

**Closed 2026-08-29:** Cloudflare Pages token (1), Resend transactional key (12), GitHub token
and webhook secret (10) — each verified by exercising the real path, not by reading a config.

What is left, in order:

1. **`ANTHROPIC_API_KEY`** (2) — self-serve, two minutes, still `false` on health. The last
   cheap capability win.
2. **Apex SPF, Workspace DKIM, DMARC `rua=`** (3) — unchanged by the Resend verification on
   08-29, which proves DKIM only. Improves every email the team already sends.
3. **Send the identity ask to Prince** (7) and **the brief to counsel** (8) — long human
   latency, so start both clocks now.
4. **DTI / BIR documents → PayMongo** (6) — 14 business days, needs 7 first.
5. **The bounce-webhook adapter** (5) — code, and it gates the campaign.
6. **Outreach subdomain, then preflight 6/6** (4) — then warm the domain.
7. **First campaign send** — only after 5, 6, and the RA 10173 answer from 8.

**Housekeeping:** the Namecheap API key enabled on 08-28 was never used — Resend verified
through its own Namecheap integration instead — and should be reset, since it can rewrite DNS
for every domain in the account. The Cloudflare and Resend keys passed through a chat
transcript and are worth rotating at leisure; both are two-minute reissues.
