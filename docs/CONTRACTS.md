# ADVO Contracts — Policy & Clause Templates

> **⚠️ DRAFT — needs legal review before binding use.** This document is the team's working policy on revisions, downpayments, and change orders, written in clause-ready form so a Philippine corporate/cyber lawyer can validate and adapt it. Do not paste verbatim into a signed contract until reviewed. Per Prince (Jun 2026): *"we basically need an advisor to help us with cyber law related contracts."*

## Why this exists

Two projects in 2026 leaked revenue specifically because the contract was silent on these terms:

| Project | What went wrong | The gap |
|---|---|---|
| **Fourlinq** (deployed Jun 19, 2026) | ₱12k downpayment didn't cover the actual work. Revisions ran open-ended. David's post-mortem: *"the 12k isnt enough as a downpayment"* and *"we lowk shuldv specified pala sa contract ung revisions thingy."* | No downpayment floor. No revision cap. |
| **Felici Gelato** (in dev, Jun 2026) | Client started asking for features from *competitor designers' work* mid-build. Round 1 dragged past the June 12 deadline. David: *"I hope she dont make any more requests."* | Same — plus no change-order trigger for "I saw a thing I want." |

The policy below exists so the **third** project doesn't repeat the same lesson.

## Policy 1 — Downpayment floor

| Rule | Value |
|---|---|
| Minimum downpayment | **40% of total project value** *or* **₱30,000**, whichever is higher |
| Due before | Any design or development work begins |
| Refundability | Non-refundable once design begins (see clause) |

**Why:** Fourlinq's 12k on a ~70k project (~17%) left the team funding the work themselves. 40% covers the irreversible phase (discovery + design + initial dev) so a stalled or cancelled project doesn't bleed the team.

**The ₱30k floor** protects against small-project math: a ₱50k engagement at 40% = ₱20k, which still isn't enough to cover senior + junior time across discovery.

## Policy 2 — Revision limits

| Phase | Included revisions | After that |
|---|---|---|
| Discovery / wireframe | 2 rounds | Hourly rate (see below) |
| Design (visual) | 2 rounds | Hourly rate |
| Build / functional | 2 rounds | Hourly rate |
| Post-launch (in care plan window) | 1 round/month | Hourly or roll into next care month |

**One "round" = a single batched feedback list, delivered within 5 business days of the deliverable's preview.** Feedback dribbled in across multiple messages over weeks still counts as one round *if* delivered within the 5-day window — after that, it's a new round.

**Why:** Fourlinq and Felici both ran into the same pattern — the client sees the work and asks for changes, then *next week* asks for more, then sees a competitor and asks for more. Each batch can be a round; what kills profitability is when batches keep arriving without a meter.

**Hourly rate for additional revisions:** to be set by leadership (recommend ₱1,500–₱2,500/hour depending on role). Document it in the contract per-engagement so clients know what overage costs.

## Policy 3 — Change orders (a.k.a. "I saw this on another site")

Anything that adds **new scope** (not refining existing scope) triggers a **change order**:
- New page or section not in the original spec
- New feature (e.g., online ordering when contract was for a static site)
- Major behavior change to an approved deliverable
- Anything inspired by *another* designer or vendor's work shown mid-build

**Process:**
1. Project lead writes a one-paragraph **Change Order**: what's changing, what it costs (₱), how it shifts the timeline.
2. Client signs (email reply confirming the ₱ amount + timeline counts).
3. Work doesn't start until signed.
4. Logged on the project in `/admin` (eventually as a first-class entity — see ROADMAP P0).

**Why:** Felici's "competitor designer" requests are the textbook case. The client isn't being unreasonable — they have new information. But unbilled scope changes turn fixed-price work into uncapped time-and-materials, against the team's will. The change order forces the conversation about cost up-front instead of after.

## Clause language (drop-in, after legal review)

### Downpayment clause

> Client shall pay a non-refundable downpayment of forty percent (40%) of the Total Project Value, or thirty thousand Philippine pesos (₱30,000), whichever is higher, before any design or development work begins. The downpayment secures ADVO's scheduling, discovery work, initial design, and reservation of team capacity for this engagement.

### Revision limits clause

> Each phase of work — Discovery, Design, and Build — includes two (2) revision rounds. One revision round means a single batched feedback list, delivered by the Client within five (5) business days of the corresponding deliverable's preview. Feedback delivered after the 5-day window constitutes a new revision round.
>
> Revisions beyond the included rounds are billed at ADVO's then-current hourly rate (currently [INSERT RATE] PHP/hour), in fifteen (15) minute increments, minimum one (1) hour per round.

### Change-order clause

> Any addition, removal, or substantive modification of scope outside the agreed Statement of Work constitutes a Change Order. Each Change Order will be documented in writing by ADVO with: (a) a description of the change; (b) the impact on price (PHP); (c) the impact on timeline; and (d) any dependent changes. No work will commence on a Change Order until the Client confirms the foregoing in writing (email reply or signed addendum).
>
> Discoveries of designs, features, or capabilities at third-party vendors or competitor sites that the Client wishes to incorporate after work has begun are governed by this Change Order process.

### Late-payment clause

> Invoices are due within fifteen (15) days of issue. Amounts unpaid after thirty (30) days accrue interest at the lower of two percent (2%) per month or the maximum rate permitted by Philippine law. ADVO may pause work on the engagement at any time after Day 30 of an unpaid invoice and shall not be liable for resulting timeline impact.

### Termination clause

> Either party may terminate this engagement for convenience with fifteen (15) days' written notice. On termination: (a) the Client pays for all completed work and work-in-progress at the agreed rate, prorated to the termination date; (b) ADVO delivers all completed deliverables; (c) the downpayment is non-refundable; (d) any unbilled change orders already accepted by the Client remain payable.

## How to use this in a new proposal

When sending a new proposal (e.g., Coffee Rush):

1. **Set the downpayment correctly.** Calculate 40% of total. If under ₱30k, use ₱30k. Put this in the proposal PDF up-front.
2. **Name the revision allowance** in the proposal: "Includes 2 rounds per phase." Don't bury it in fine print.
3. **List the hourly rate** for additional revisions explicitly.
4. **Add the clauses above** (after legal sign-off) to the SOW or master agreement.
5. **Set up the project in `/admin` with these terms recorded** so the team has a single source of truth when revisions are debated.

## Open questions for the legal advisor

When the lawyer comes on (per Prince's Jun 2026 note), these are the open items they should weigh in on:

1. Is the "non-refundable downpayment" enforceable as drafted under Philippine consumer protection law for a non-consumer (B2B) service?
2. What's the right form of acceptance for a Change Order — email-with-quoted-confirmation enough, or do we need an addendum signed by both parties?
3. How should we handle IP transfer — does ADVO retain rights to reusable components / code patterns built during a client engagement?
4. NDA/confidentiality — what's the right default for client data, brand assets, leads we generate for them?
5. **Cyber-specific:** liability cap for breaches, data-handling expectations (we hold portfolio screenshots, client uploads, hosted assets), GDPR/PDPA exposure if any client serves EU/international users.
6. Liquidated damages or service-level commitments — should we offer any uptime SLA on hosted sites, or is best-effort + the care plan enough?
7. Care-plan termination — currently informal; should monthly maintenance plans have a 30-day cancellation clause?
8. **Cold outreach / RA 10173 (Data Privacy Act).** ADVO holds ~5K scraped metro-Manila clinic records and now has a sender that can mail them ([ROADMAP.md](ROADMAP.md) P1, shipped). Before the first real send:
   - What is our lawful basis for processing scraped business-contact data, and does legitimate interest cover B2B outreach here?
   - Do we owe a notification to each data subject on first contact, and what must it say?
   - What retention period applies to a lead we never convert, and to a suppressed address (we keep suppressed addresses forever precisely so we cannot re-contact them — is that itself defensible)?
   - Are we required to register as a Personal Information Controller with the National Privacy Commission at this volume?
   - Does an unsubscribe alone discharge our obligation, or is an explicit erasure path also required?

## What this doc isn't

- It isn't a full SOW template — scope, deliverables, timeline live per-engagement.
- It isn't a master service agreement — the lawyer will draft that, this just feeds the policy positions into it.
- It isn't binding until legal-reviewed.

## Revision history

- **2026-06-20** — initial draft. Source: Messenger archive Apr–Jun 2026, Fourlinq + Felici post-mortems, ROADMAP.md P0 items.
