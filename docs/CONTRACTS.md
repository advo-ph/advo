# ADVO Contracts — Policy & Clause Templates

> **⚠️ DRAFT — needs legal review before binding use.** This document is the team's working policy on payment, revisions, IP, termination, and liability, written in clause-ready form so a Philippine corporate/cyber lawyer can validate and adapt it. Do not paste verbatim into a signed contract until reviewed. Per Prince (Jun 2026): *"we basically need an advisor to help us with cyber law related contracts."*
>
> **Reconciled 2026-08-19 against what ADVO is actually sending.** The policy below has been brought in line with the live client contract dated 2026-08-11 (Confidential — **not** reproduced here; commercial terms, client name, and scope stay in the engagement file). **Reconciling this doc to what went out does not make these terms lawyer-approved.** The live contract was sent to a client *ahead of* legal review — so the caveat above is now a live exposure, not a hypothetical one, and the reconciliation is a record of that exposure rather than a resolution of it.

## Why this exists

Two projects in 2026 leaked revenue specifically because the contract was silent on these terms:

| Project | What went wrong | The gap |
|---|---|---|
| **Fourlinq** (deployed Jun 19, 2026) | ₱12k downpayment didn't cover the actual work. Revisions ran open-ended. David's post-mortem: *"the 12k isnt enough as a downpayment"* and *"we lowk shuldv specified pala sa contract ung revisions thingy."* | No downpayment floor. No revision cap. |
| **Felici Gelato** (in dev, Jun 2026) | Client started asking for features from *competitor designers' work* mid-build. Round 1 dragged past the June 12 deadline. David: *"I hope she dont make any more requests."* | Same — plus no change-order trigger for "I saw a thing I want." |

The Jun 2026 draft answered those two gaps with a downpayment floor and a hard revision cap. The contract the team actually drafted and sent in Aug 2026 answered them **differently** — a 50/50 milestone split instead of a floor, and a generous-but-terminating revision allowance instead of a metered cap — and also closed gaps the draft never covered at all (IP retention, non-abandonment, termination, force majeure, portfolio rights). This document now reflects the sent terms, because a policy the team contradicts on the day it signs is worse than no policy.

### What was superseded (kept so the history isn't lost)

| Term | Jun 2026 draft | Reconciled Aug 2026 |
|---|---|---|
| Downpayment | 40% of total **or ₱30,000**, whichever is higher | **50% on commissioning / 50% on delivery.** No peso floor. |
| Revisions | 2 rounds per phase, hourly after | **5 rounds per deliverable, free**, until sign-off |
| Feedback window | 5 business days = one round | **15 business days**, then a deemed-approval notice, then 15 more |
| Late payment | not specified | **2% per month** from the 16th business day, computed daily |
| Post-launch | care plan, 1 round/month | **unused rounds invocable up to 6 months** after sign-off |

The ₱30,000 floor is gone deliberately: at the tier sizes ADVO actually sells, 50% of the smaller tier lands *below* ₱30,000, so the floor and the 50/50 split could not both hold. The split won because it is what ADVO actually put in front of a client. **It is not known to be executed** — neither tier is initialed in the copy on file, and the signature page is not visible in that copy, so treat this as the term ADVO is offering, not a term a client has agreed to.

## Policy 1 — Payment schedule

| Rule | Value |
|---|---|
| Downpayment | **50% of Total Project Value**, on contract signing, **with a witness present** |
| Final payment | **50%**, on final delivery + formal Project Sign-off (or deemed approval) |
| Invoice terms | Payable within **7 business days** of issuance |
| Sign-off payment | Due on signing the Project Sign-off document; **7 days** to comply |
| Refundability | Non-refundable once the corresponding milestone is approved and signed off |
| Ongoing infrastructure | Recurring **monthly** fee, billed on the 1st, separate from the Total Fee |

**Why the witness:** the downpayment milestone is the one most often disputed later ("we never agreed to that amount"). A witnessed signing is cheap insurance and the team has already committed to it in writing.

**Infrastructure is not development.** The Total Fee covers design and build only. Keeping the database and application live is a separate recurring monthly fee, quoted per-engagement and subject to load testing. It covers uptime, hosting, DB maintenance, and domain renewals. Data retention is architected for **10 years**, after which records enter automated archival/deletion workflows.

## Policy 2 — Revision limits

| Rule | Value |
|---|---|
| Included revisions | **5 rounds per deliverable**, at no additional cost |
| Overage rate | **None.** There is no hourly meter. The allowance terminates instead. |
| Deadline | All revisions must be used **before** the Project Sign-off document is signed |
| Unused rounds | May still be invoked up to **6 months after Project Sign-off**, within the original scope |
| After that | Strictly the 30-day bug-fixing window or the maintenance agreement |

**What changed and why it matters:** the Jun 2026 draft metered overage at an hourly rate. The sent contract does not — it gives a bigger free allowance and then *ends* it at sign-off. That is a different risk shape. The draft's risk was an argument about an invoice; this one's risk is a client who never signs off, because sign-off is what closes the allowance. **The commercial defence against that is Policy 3, not Policy 2** — deemed approval is what makes the 5-round allowance finite in practice.

The 6-month tail is a real liability: unused rounds survive sign-off, survive final payment, and survive the 30-day warranty. Track remaining rounds per deliverable in `/admin` at sign-off, or the team is defending against an unbounded claim six months later with no record.

## Policy 3 — Feedback window & deemed approval

| Step | Window |
|---|---|
| 1. Client feedback on a review delivery | **15 business days** |
| 2. Silence → ADVO issues a formal **Notice of Pending Deemed Approval** | on expiry of step 1 |
| 3. Silence after the notice | **15 further business days** |
| 4. Result | The revision is **deemed approved and finalized** |

The notice in step 2 is mandatory and must be issued formally and in writing. Deemed approval does not trigger without it — skipping the notice forfeits the whole mechanism.

**Separately**, client-caused delay (late assets, delayed feedback, or **no response within 10 calendar days**) extends the timeline day-for-day, with no penalty to ADVO. This is a *schedule* remedy and runs independently of the deemed-approval clock above.

> ⚠️ **Known inconsistency in the sent contract.** The payment table describes deemed approval as "10-day non-response as outlined in Revisions," while the Revisions section defines 15 business days + 15 further business days. Two different clocks for the same trigger. Until legal resolves it, quote **15 + 15 business days** — the specific clause governs over the table's shorthand — and fix the table in the next contract revision. Flagged in Open Questions.

## Policy 4 — Change orders (a.k.a. "I saw this on another site")

Anything that adds **new scope** (not refining existing scope) requires a **written addendum before work begins**:
- New module, page, or section not in the original spec
- New feature (e.g., online ordering when the contract was for a static site)
- Redesign or structural adjustment exceeding the agreed scope
- Anything inspired by *another* designer or vendor's work shown mid-build
- Peripheral projects discussed in meetings but excluded from the signed scope

**Process:**
1. Project lead writes a one-paragraph **Change Order**: what's changing, what it costs (₱), how it shifts the timeline.
2. Client signs (email reply confirming the ₱ amount + timeline counts).
3. Work doesn't start until signed.
4. Logged on the project in `/admin`.

**Why:** revisions refine what was agreed; change orders add what wasn't. With 5 free rounds per deliverable, the boundary between the two is now doing much more commercial work than it did under a 2-round cap — a request that would once have burned a paid round now has to be classified correctly or it is simply free. Classify at intake, in writing, every time.

## Policy 5 — Late payment & suspension

| Rule | Value |
|---|---|
| Invoice due | 7 business days from issuance |
| Grace | 15 business days from issuance |
| Penalty | **2% per month**, commencing strictly on the **16th business day**, calculated daily until settled |
| Unpaid infrastructure fee | ADVO may **suspend hosting and API access** if unpaid 15 days past due |
| Liability on suspension | ADVO is not liable for data loss or business interruption caused by the suspension |

Suspension is a serious remedy — it takes the client's live application offline. Do not invoke it without a written warning first, regardless of what the clause permits.

## Policy 6 — Intellectual property & ownership

- **IP retained until full payment.** All design files, source code, and deliverables remain the exclusive property of ADVO until full payment is received. The Client has no right to publish or use any deliverable until the corresponding payment clears.
- **Transfer on full payment.** Full ownership of all deliverables — source files and codebases included — transfers to the Client on receipt of final payment.
- **Client-provided assets.** Product shots, establishment photos, and brand materials are licensed to ADVO on a limited basis, solely for building the application.
- **Data privacy.** Private organizational data is accessible only by the Client and remains strictly confidential.
- **Portfolio rights.** ADVO retains the right to display completed work in its portfolio and marketing materials **unless the Client requests otherwise in writing before final delivery.** The opt-out deadline is what makes this workable — after final delivery, the right is settled.
- **Hosting exit.** After full payment, the Client may stay on ADVO-managed hosting or request a system transfer to their own provider.

Note this is *stricter* than the Jun 2026 draft, which was silent on IP entirely and left "does ADVO retain rights to reusable components?" as an open legal question. It still is — the reconciled clause transfers "all deliverables" without carving out reusable internal libraries. See Open Questions.

## Policy 7 — Non-abandonment, continuity & termination

**Purpose:** protect both parties from project abandonment and guarantee continuity of work.

- **ADVO's commitment.** ADVO will not unilaterally abandon or deprioritize an active project without prior written notice and a mutually agreed revised timeline.
- **Client's commitment.** While the project is active and any payment is outstanding, the Client may not cease communication, withhold payment, or engage a third party to replicate or replace ADVO's work. Doing so is a **material breach**.
- **Termination with cause (either party).** Written notice plus a **14-day cure period**. The Client remains liable for the financial value of all work completed to the termination date.
- **Termination without cause (Client).** The Client compensates ADVO for the **exact percentage of project completion** reached at cancellation, and fully reimburses any non-refundable third-party integrations already purchased.
- **Termination without cause (ADVO).** ADVO **fully refunds** any advanced milestone for which work has not commenced, and surrenders all paid-for code assets to the Client in their current state.

This replaces the Jun 2026 "15 days' notice for convenience, downpayment non-refundable" clause outright. The reconciled version is symmetric and percentage-based; the old one was not, and was never what the team actually offered.

## Policy 8 — Warranty, liability & fortuitous events

- **Warranty.** A **30-day warranty** after launch, correcting bugs or defects arising from development, at no additional cost.
- **Limitation of liability.** ADVO commits to professional diligence but is not liable for indirect commercial losses, third-party service interruptions, or events beyond its reasonable control.
- **Third-party dependency disclaimer.** Outages, pricing changes, or breaking changes at third-party providers (hosting, database, auth, payment, mapping, device SDKs) are outside ADVO's control and are not a defect under the warranty. Name the dependencies per-engagement so this is not argued abstractly.
- **Fortuitous events.** Neither party is legally responsible for delays, defects, or failure to perform resulting from fortuitous events — acts of God, national connectivity outages, changes to regional regulations, and prolonged server outages beyond reasonable control. Performance is suspended for the duration.

> ⚠️ The fortuitous-events clause in the sent contract **is cut off mid-sentence** in the copy on file ("In such circumstances, performance…"). Retrieve the executed version and confirm what follows — whether performance is suspended, extended day-for-day, or gives either party a termination right is materially different, and nobody on the team currently knows which one was signed. Flagged in Open Questions.

## Policy 9 — The Project Sign-off document

The pivot the whole engagement turns on. Policies 1, 2 and 3 all reference it, and until 2026-08-19 the product had no concept of it at all.

| Rule | Value |
|---|---|
| What it is | The **client-facing** document accepting final delivery of a commissioned system |
| Who issues it | ADVO, per commissioned system — a project can hold several (Tier 1, then Tier 2) |
| Who signs it | The client, from `/hub`. An admin may record a `deemed` or `offline` signature on their behalf |
| Final payment | **Due on signing.** The client has **7 days** from signature to comply (Policy 1) |
| Free revisions before | All complementary rounds must be used **before** signing (Policy 2) |
| Free revisions after | **Unused** rounds stay invocable for **6 months** after signing, within the original scope |
| After that window | The 30-day bug-fixing window, the maintenance agreement, or a change order (Policy 4) |
| Deemed approval | Non-response can substitute for a signature (Policy 3) — recorded by a human, never automatically |

**It is not `deliverable.verified_at`.** That column is internal team QA and stays team-only. Conflating the two would show a client an internal flag as if it were their own signature, and would let an internal QA tick start a payment clock. Any change that renders internal QA state in `/hub` is a regression.

**What the product now enforces** (`apps/api/migrations/016_project_signoff.sql`, `/api/project-signoff`):

- Signing is one transaction guarded by `UPDATE ... WHERE signed_at IS NULL`. Two clicks cannot mint two final-payment invoices.
- Used and remaining rounds are **counted from a ledger**, one row per round consumed, each linked to the "Client revision" task it created. The tally cannot drift from the paper trail, which is what Policy 2's "track remaining rounds or defend an unbounded claim six months later" asks for.
- The allowance and window gate live in the write path, so an exhausted allowance or a closed window is refused with the reason named, not just hidden in the UI.
- A signed sign-off is **frozen** (only the internal note and the document link may change) and is **never voided** — it owns a real receivable. Supersede it by issuing a new one.

**Where the paper still wins.** A typed name plus IP and user-agent is an audit trail, not a qualified electronic signature under the PH E-Commerce Act. `document_url` exists so a countersigned PDF stays the authoritative artifact. Do not let any UI copy call the in-app signature "legally binding" until the legal advisor rules on the wording — see Open Questions.

## Clause language (drop-in, after legal review)

> Every clause below carries the same caveat as this document: **draft, needs legal review before binding use.** Substantially this language has already gone out to a client ahead of that review. That is a reason to get it reviewed sooner, not a reason to treat it as reviewed.

### Payment-schedule clause

> Client shall pay fifty percent (50%) of the Total Project Value upon commissioning, being the signing of this Agreement in the presence of a witness, and the remaining fifty percent (50%) upon final delivery of the deliverables and formal Client sign-off (or deemed approval as provided in the Revisions clause). Payments are strictly non-refundable once the corresponding milestone has been approved and signed off. Invoices are payable within seven (7) business days of issuance.

### Revision clause

> Each deliverable includes up to five (5) rounds of revisions at no additional cost. All revisions must be utilized prior to the signing of the Project Sign-off document. Where included revision rounds remain unused as of final delivery, the Client may still invoke them, within the scope originally agreed, for a period of six (6) months following the signing of the Project Sign-off document. Adjustments requested thereafter fall strictly under the thirty (30) day bug-fixing warranty or a separate maintenance agreement.

### Deemed-approval clause

> If the Client fails to provide feedback within fifteen (15) business days of a review delivery, ADVO shall issue a formal Notice of Pending Deemed Approval. If no response is received within fifteen (15) subsequent business days of that Notice, the revision shall be deemed approved and finalized. Separately, delays caused by the Client — including late assets, delayed feedback, or no response within ten (10) calendar days — automatically extend the delivery timeline by the equivalent number of days without penalty to ADVO.

### Change-order clause

> Any addition, removal, or substantive modification of scope outside the agreed Statement of Work constitutes a Change Order. New modules, redesigns, structural adjustments, or feature additions require a written addendum executed before work begins. Each Change Order will be documented in writing by ADVO with: (a) a description of the change; (b) the impact on price (PHP); (c) the impact on timeline; and (d) any dependent changes. No work will commence on a Change Order until the Client confirms the foregoing in writing (email reply or signed addendum). Designs, features, or capabilities observed at third-party vendors or competitor sites that the Client wishes to incorporate after work has begun are governed by this Change Order process.

### Late-payment clause

> Invoices are payable within seven (7) business days of issuance. Unpaid balances remaining after fifteen (15) business days from the date of issuance, commencing strictly on the sixteenth (16th) business day, shall incur a penalty fee of two percent (2%) per month, calculated daily until fully settled, or the maximum rate permitted by Philippine law, whichever is lower. Where a recurring infrastructure fee remains unpaid fifteen (15) days past its due date, ADVO reserves the right to suspend server hosting and API access until the balance is cleared, and shall not be held liable for data loss or business interruption resulting from that suspension.

### Intellectual-property clause

> All design files, source code, and deliverables remain the exclusive property of ADVO until full payment is received, and the Client has no right to publish or use any deliverable until the corresponding payment clears. Upon receipt of final payment, full ownership of all deliverables, including source files and codebases, transfers to the Client. Client-provided product shots, establishment photographs, and brand materials are licensed to ADVO on a limited basis solely for the purpose of building the deliverables. All private organizational data remains accessible only to the Client and strictly confidential. ADVO retains the right to display completed work in its portfolio and marketing materials unless the Client requests otherwise in writing before final delivery.

### Non-abandonment clause

> ADVO shall not unilaterally abandon or deprioritize the project without prior written notice and a mutually agreed revised timeline. The Client shall not cease communication, withhold payment, or engage a third party to replicate or replace ADVO's work while the project is active and any payment remains outstanding; doing so constitutes a material breach of this Agreement.

### Termination clause

> **With cause.** Either party may rescind this Agreement for legitimate cause by written notice, allowing a fourteen (14) day cure period to resolve the issue. The Client remains liable for the financial value of all work completed up to the date of termination.
>
> **Without cause, by the Client.** Upon cancellation mid-project for convenience, the Client shall compensate ADVO for the exact percentage of project completion achieved as of the cancellation date, and shall fully reimburse any non-refundable third-party integrations purchased for the project.
>
> **Without cause, by ADVO.** ADVO shall fully refund any advanced milestone for which work has not yet commenced, and shall surrender all paid-for code assets to the Client in their current state.

### Warranty & liability clause

> ADVO provides a thirty (30) day warranty following launch to correct bugs or defects resulting from development, at no additional cost. While ADVO commits to exercising professional diligence in project execution, it shall not be held liable for indirect commercial losses, third-party service interruptions, or events arising from forces beyond its reasonable control. Interruptions, pricing changes, or breaking changes originating with third-party providers relied upon by the deliverables do not constitute a defect under this warranty.

### Fortuitous-events clause

> Neither party shall be held legally responsible for delays, defects, or failure to perform obligations under this Agreement resulting from fortuitous events, including acts of God, national connectivity outages, changes to regional regulations, and prolonged server outages beyond the reasonable control of the developer. In such circumstances, performance of the affected obligations is suspended for the duration of the event and the delivery timeline is extended by the equivalent number of days. *(Wording of the final sentence to be confirmed against the executed contract — see Open Questions.)*

## How to use this in a new proposal

1. **Set the payment split correctly.** 50% on commissioning, 50% on delivery + sign-off. Do not quote the retired 40% / ₱30,000 floor.
2. **Name the revision allowance** in the proposal: "5 rounds per deliverable, included." Don't bury it in fine print — and don't promise an hourly overage rate, because there isn't one.
3. **State the feedback window and the deemed-approval mechanism** up-front. This is the clause that makes the allowance finite; a client who learns about it only at dispute time will treat it as a trap.
4. **Quote the recurring infrastructure fee separately** from the Total Fee, and say it is subject to load testing.
5. **Add the clauses above** (after legal sign-off) to the SOW or master agreement.
6. **Set up the project in `/admin` with these terms recorded** — including revision rounds consumed per deliverable — so the team has a single source of truth at sign-off and for the 6 months after it.

## Open questions for the legal advisor

> 📬 **These questions now exist as a sendable packet:** [LEGAL-BRIEF.md](LEGAL-BRIEF.md) — self-contained, quotes the operative clause language inline, carries the commercial figures a lawyer needs to judge a payment clause, and closes with the bounded engagement being requested. Send that; this list is the source it was built from. Anything added here must be carried across, or counsel answers a shorter list than we have.

When the lawyer comes on (per Prince's Jun 2026 note), these are the open items they should weigh in on. Items 1–3 are new and urgent because the language is already in a client's hands.

1. **Which deemed-approval clock governs?** The sent contract states 15 + 15 business days in the Revisions section and "10-day non-response" in the payment table. Which one binds, and how do we correct it on an executed contract?
2. **What does the fortuitous-events clause actually say?** Our copy is truncated mid-sentence. Confirm the executed text and whether it grants a termination right after a prolonged event.
3. **Is deemed approval enforceable as drafted** under Philippine law, given that it converts client silence into acceptance of a payment-triggering milestone? Is the formal Notice sufficient service, and does it need to be sent by a specific method?
4. **Is the 6-month post-sign-off revision tail bounded enough** to be safe, given final payment and warranty have both closed by then? Should it expire on transfer of hosting?
5. **Does "full ownership of all deliverables"** on final payment inadvertently transfer ADVO's reusable internal components and code patterns? We need a carve-out drafted if so.
6. Is the "non-refundable milestone" enforceable as drafted under Philippine law for a non-consumer (B2B) service?
7. What's the right form of acceptance for a Change Order — email-with-quoted-confirmation, or an addendum signed by both parties?
8. **Is "the exact percentage of project completion"** a measurable enough standard on termination for convenience, or does it need a defined method (milestones? logged hours? deliverable count)?
9. **Is the hosting-suspension remedy safe**, given it takes a client's live business system offline, and does the liability disclaimer around it survive?
10. Is 2% per month, calculated daily from the 16th business day, within the maximum rate permitted by Philippine law?
11. NDA/confidentiality — what's the right default for client data, brand assets, leads we generate for them?
12. **Cyber-specific:** liability cap for breaches, data-handling expectations (we hold portfolio screenshots, client uploads, hosted assets), GDPR/PDPA exposure if any client serves EU/international users.
13. Does the 10-year data retention policy, with automated archival/deletion after, satisfy PDPA retention requirements for HR and attendance records?
14. Uptime commitments — a stated uptime guarantee on the infrastructure fee is a service-level commitment. What is our exposure if we miss it, and should it be qualified?
15. Care-plan termination — currently informal; should monthly maintenance plans have a 30-day cancellation clause?
16. **Cold outreach / RA 10173 (Data Privacy Act).** ADVO holds ~5K scraped metro-Manila clinic records and now has a sender that can mail them ([ROADMAP.md](ROADMAP.md) P1, shipped). Before the first real send:
    - What is our lawful basis for processing scraped business-contact data, and does legitimate interest cover B2B outreach here?
    - Do we owe a notification to each data subject on first contact, and what must it say?
    - What retention period applies to a lead we never convert, and to a suppressed address (we keep suppressed addresses forever precisely so we cannot re-contact them — is that itself defensible)?
    - Are we required to register as a Personal Information Controller with the National Privacy Commission at this volume?
    - Does an unsubscribe alone discharge our obligation, or is an explicit erasure path also required?

## What this doc isn't

- It isn't a full SOW template — scope, deliverables, pricing, and timeline live per-engagement. **Nothing client-specific belongs in this file:** no client names in clauses, no project totals, no deliverable lists. Contracts sent to clients are Confidential and stay in the engagement file.
- It isn't a master service agreement — the lawyer will draft that, this just feeds the policy positions into it.
- **It isn't binding until legal-reviewed, and it isn't legal-reviewed.** That the terms here match a contract already sent to a client changes nothing about that.

## Revision history

- **2026-06-20** — initial draft. Source: Messenger archive Apr–Jun 2026, Fourlinq + Felici post-mortems, ROADMAP.md P0 items.
- **2026-08-19** — added Policy 9, the Project Sign-off document, and shipped it as a model (`016_project_signoff.sql`, `/api/project-signoff`, `/hub` sign card, `/admin -> Projects -> Sign-off`). Reconciled against the live client contract dated 2026-08-11 (surfaced 2026-08-19; the 08-14 figure earlier in this repo was the as-of date, not the contract date). Payment moved to 50/50 milestones (₱30k floor retired); revisions moved to 5 free rounds per deliverable with a 6-month post-sign-off tail (hourly overage retired); added the 15+15 business-day deemed-approval mechanism, the 2%/month late-payment penalty and hosting-suspension remedy, and new policies for IP retention and transfer, portfolio rights, non-abandonment, three-way termination, warranty, third-party dependency, and fortuitous events. Two defects in the sent contract flagged for legal: a contradictory deemed-approval clock and a truncated fortuitous-events clause. The legal-review caveat is unchanged and now applies to language already in a client's hands.

> ⚠️ **Source-of-record note.** The contract header reads **08/11/2026**; the 2026-08-14 figure that appeared earlier in this repo was the date the copy was captured, not the contract date. This doc now cites 08/11. Two things remain unverified in the copy on file and must be confirmed from the engagement file before either is relied on in a dispute: **whether the contract was ever executed** (no tier is initialed, and the signature page is not visible), and **which fortuitous-events wording was actually sent** (the clause is cut off mid-sentence in that copy).
