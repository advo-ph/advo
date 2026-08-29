# Sending the legal brief

Date: 2026-08-28
Status: ready to send. The remaining work is choosing a recipient and pressing send.

[LEGAL-BRIEF.md](LEGAL-BRIEF.md) is finished and graded (`npm run bench:legal`, 9/9). It is
self-contained: all nine policies quoted inline, 49 closed-form questions, the live exposure in the
first screenful, and the real commercial figures counsel needs to judge a payment clause. It needs
no attachments to produce a quote.

This file is the part the brief cannot do for itself — who to send it to, what to say in the
covering email, and what to do with the reply.

## What we are buying

A **fixed-fee, bounded opinion**, not a retainer and not a drafted agreement. Section 10 of the
brief states this in its own words, and states our constraint honestly: five-figure-peso contracts,
so we want the twenty percent of the advice that removes eighty percent of the exposure. Do not
soften that in the covering email — it is what makes a small quote likely rather than an
apologetic one.

## Choosing a recipient

The brief spans corporate contract law and RA 10173 data privacy. Those are often the same
practitioner in a Philippine SME practice, but not always.

Screen on four things:

1. **Philippine corporate/commercial practice**, not a general-litigation shop. We need clauses
   validated, not a dispute run.
2. **Data privacy experience** — specifically RA 10173 and the NPC. Section 8 is the urgent half
   and the one that gates revenue. If a candidate is strong on contracts and blank on privacy,
   that is fine, but split the engagement and say so.
3. **Willing to quote a fixed fee** on a scoped review. A firm that only works hourly can still be
   right, but Section 10 asks for fixed and the reply tells you how they work.
4. **SME-sized.** A large firm's minimum engagement will exceed what this is worth.

Reasonable sourcing routes, in rough order of how fast they return a real name: another founder in
the same size bracket who has had contracts reviewed; the Integrated Bar of the Philippines chapter
for the city we register in; a data-privacy practitioner found through NPC-registered DPO training
providers. Send to two or three in parallel — quotes for scoped work vary widely, and the brief
costs nothing to send twice.

## The covering email

Keep it short. The brief carries the argument; the email only has to get it opened.

> **Subject:** Fixed-fee contract + data privacy review — Philippine software agency
>
> Good day,
>
> I run ADVO, a small software agency in Metro Manila. We build and host custom business systems
> for local SMEs.
>
> We wrote our own contract policy — payment, revisions, deemed approval, change orders, late
> payment, IP, termination, warranty, sign-off. Nine policies, none of them ever reviewed by a
> lawyer, and substantially that language has already gone to a client in a contract dated
> 11 August 2026. So we are past "is this safe to use" and into "what is already binding us."
>
> Separately, we hold roughly 5,000 scraped business-contact records and have built, but never
> used, a system that can email them. We have not sent anything because we do not know our lawful
> basis under RA 10173. That question is holding up revenue.
>
> I have written a brief that contains everything you would need to quote: each policy quoted in
> full, 49 questions phrased so they can be answered yes / no / yes-with-modification, our actual
> commercial figures, and the data-privacy questions. It is attached — no other documents are
> needed to give us a number.
>
> We are asking for a fixed-fee, bounded engagement: an opinion on the nine policies, a remediation
> note on the August contract, and an answer on the privacy question. We are a small agency and are
> asking for a scoped opinion rather than a retainer.
>
> If you are able to take this on, I would need a fixed fee (or one per section if you would rather
> separate privacy from contracts), a turnaround date, whether you need the executed contract in
> hand before starting, and any conflict check you need to run.
>
> If this is not your practice area, I would be grateful for a referral.
>
> Thank you,
> [name, title]
> ADVO — contact@advo.ph

Attach `docs/LEGAL-BRIEF.md` as a PDF. Do not paste it into the body; it is long, and its structure
is what makes it answerable.

## Before sending

- [ ] Annex A is still nine TODOs. **Send anyway** — the brief says explicitly that those are
      supplied on engagement, and waiting on [ASK-IDENTITY.md](ASK-IDENTITY.md) delays the urgent
      half for a reason counsel does not need resolved to quote.
- [ ] Retrieve the executed 11 August contract if it can be found first. It is question 3 in the
      email, and having it changes the answer.
- [ ] Fill in the signatory name in the sign-off line.
- [ ] Do not name the client. The brief deliberately omits client names and project totals
      (Annex B); the covering email must match.

## When a reply arrives

A quote is not the finish line — the opinion changes documents in this repo.

| Reply touches | Update |
| --- | --- |
| Any of the nine policies | [CONTRACTS.md](CONTRACTS.md) — the policy text, not a note beside it |
| The RA 10173 questions | [CONTRACTS.md](CONTRACTS.md#open-questions-for-the-legal-advisor) and the outreach consent basis. **This is what unblocks the first campaign send** |
| A policy that is unenforceable as drafted | Whatever code implements it — Policy 3's deemed-approval clock is modelled in migration `021`, so a change to the window is a migration, not a copy edit |
| The engagement itself | The P0 row in [ROADMAP.md](ROADMAP.md), which currently reads "lawyer still not engaged" |

The last line of the brief is "Nothing in this brief has been reviewed by a lawyer. That is what it
is asking for." When that stops being true, that line and the ROADMAP row change together.
