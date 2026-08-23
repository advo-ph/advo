# DNS — mail authentication

What is published today, what is missing, and the exact records to add. Read off live DNS
on **2026-08-24**; re-check before acting on it, because DNS is the one thing in this repo
that changes without a commit.

Two separate problems live here and they should not be conflated:

1. **Outreach cannot send at all** — the preflight gate refuses it. This blocks the 5K
   clinic campaign.
2. **Ordinary `@advo.ph` business mail is unauthenticated** — no SPF, no Google DKIM. It
   is being delivered today on reputation alone. This blocks nothing, and is quietly
   costing deliverability on every email the team sends.

---

## What is live now

| Name | Type | Value | Verdict |
|---|---|---|---|
| `advo.ph` | MX | `smtp.google.com` (prio 1) | Google Workspace carries apex mail |
| `advo.ph` | TXT | *(none — `ENODATA`)* | ❌ **No SPF at all** |
| `resend._domainkey.advo.ph` | TXT | `p=MIGfMA0…` | ✅ Resend DKIM verified on the apex |
| `google._domainkey.advo.ph` | TXT | *(none — `NXDOMAIN`)* | ❌ **Workspace DKIM never enabled** |
| `_dmarc.advo.ph` | TXT | `v=DMARC1; p=none;` | ⚠️ Publishes a record, enforces nothing, and has no `rua=` so no reports are collected either |
| `send.advo.ph` | TXT | `v=spf1 include:amazonses.com ~all` | ✅ Resend's sending subdomain is correctly set up |

So the apex sends mail two ways — Google Workspace for humans, Resend for transactional
(`noreply@advo.ph`) — and **neither is covered by SPF.** Resend's mail still passes DMARC
on DKIM alignment alone; Google's mail passes nothing. It is only landing because `p=none`
asks receivers to do nothing about it.

---

## Problem 1 — outreach is refused, and correctly

`npm run outreach:preflight` with `OUTREACH_FROM=hello@advo.ph`:

```
FAIL  The outreach domain is distinct from the transactional one
FAIL  SPF resolves for the outreach domain
4/6 — outreach domain advo.ph is NOT cleared. Sending stays refused.
```

**Do not "fix" this by adding SPF to the apex.** The first failure is the important one and
it is not a DNS problem: the gate refuses to let cold outreach share a domain with
transactional mail, because `advo.ph` carries client magic-links. If a 5K cold send earns a
spam-folder reputation, client logins go to spam with it. That invariant is deliberate and
should not be argued with — it is cheaper to publish a subdomain than to recover a burnt
sending domain.

### Records to publish for a dedicated outreach subdomain

Using `outreach.advo.ph`. Substitute if you prefer another label; do **not** reuse
`send.advo.ph`, which is already transactional.

| Name | Type | Value | TTL |
|---|---|---|---|
| `outreach.advo.ph` | TXT | `v=spf1 include:amazonses.com ~all` | 3600 |
| `_dmarc.outreach.advo.ph` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@advo.ph; pct=100` | 3600 |

**DKIM is not listed and cannot be.** It is selector-scoped and the key is issued by the
ESP — add `outreach.advo.ph` as a domain in the Resend dashboard and publish the
`<selector>._domainkey.outreach.advo.ph` record it hands you, verbatim. Inventing a public
key here would be worse than leaving it blank. Set `OUTREACH_DKIM_SELECTOR` to the same
selector (`resend`, for Resend).

Then set on the box, in `/opt/advo/apps/api/.env`:

```
OUTREACH_FROM=hello@outreach.advo.ph
OUTREACH_DKIM_SELECTOR=resend
OUTREACH_SMTP_HOST=…
```

and re-run `npm run outreach:preflight`. It must print 6/6 before any send. The sender is
gated on the recorded preflight artifact, so this is not advisory — it is the switch.

> `include:amazonses.com` is correct **for Resend**, which sends over SES; it is what
> `send.advo.ph` already uses. If outreach goes out through a different ESP, take that
> ESP's published `include:` instead. Never guess an `include:` — a wrong one is a silent
> SPF fail, and SPF caps at 10 DNS lookups.

---

## Problem 2 — apex mail is unauthenticated

Independent of outreach, and worth doing regardless.

| Name | Type | Value | Why |
|---|---|---|---|
| `advo.ph` | TXT | `v=spf1 include:_spf.google.com include:amazonses.com ~all` | Covers Workspace (human mail) **and** Resend (`noreply@advo.ph`). One record only — two `v=spf1` records on a name is a PermError and fails worse than none. |

Also enable **DKIM in Google Workspace** (Admin → Apps → Google Workspace → Gmail →
Authenticate email → Generate new record), then publish the `google._domainkey.advo.ph`
record it produces. Workspace does not sign mail until you do this, which is why the
selector is absent today.

### DMARC, after the above

The current `p=none` with no `rua=` is the weakest useful record: it enforces nothing and
collects nothing. Add reporting first, watch for a week or two, then tighten:

```
v=DMARC1; p=none; rua=mailto:dmarc@advo.ph; pct=100      ← now, to start seeing reports
v=DMARC1; p=quarantine; rua=mailto:dmarc@advo.ph; pct=100 ← once reports are clean
```

**Do not jump straight to `p=quarantine`.** Turn on reporting, confirm from the reports
that every legitimate sender is aligned, and only then enforce. Moving to enforcement while
Workspace DKIM is still unpublished would quarantine the team's own mail.

---

## Order of operations

1. Add `rua=` to the existing apex DMARC. Costs nothing, starts the evidence.
2. Publish apex SPF; enable Workspace DKIM. Fixes the mail you already send.
3. Add `outreach.advo.ph` in the ESP, publish its SPF + DKIM + DMARC.
4. Set `OUTREACH_*` on the box; re-run the preflight until 6/6.
5. Watch DMARC reports; move apex to `p=quarantine` when clean.
6. Only then, first campaign send — and warm the domain rather than opening with 5,000.
