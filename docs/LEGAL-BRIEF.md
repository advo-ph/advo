# ADVO — Legal Review Brief

**Prepared for:** a Philippine corporate / cyber lawyer
**Prepared by:** ADVO (software agency, Metro Manila)
**Date:** 2026-08-23
**Purpose:** request for a bounded engagement — validate nine contract policies and answer the data-privacy questions gating our outreach.

This document is self-contained. Everything a reviewer needs is quoted inside it; no attachments are required to give us a quote, and none of it assumes familiarity with our codebase or our internal documents.

---

## 1. The situation, in one screenful

ADVO is a Philippine software agency. We build and host custom business systems — HR and attendance platforms, client portals, websites — for local SMEs.

We wrote our own contract policy: payment schedule, revisions, deemed approval, change orders, late payment, IP, non-abandonment and termination, warranty and force majeure, and a final sign-off document. Nine policies. **None of them has ever been reviewed by a lawyer.**

**The exposure.** Substantially this language has already been sent to a client, ahead of review, in a contract dated 11 August 2026. We do not have a lawyer's opinion on a single clause in it. So the question is no longer "is this safe to use" — it is "what is already binding us, and what can still be corrected." That changes the work from drafting to remediation, and it is why we are writing now rather than at the next engagement.

Two further facts about that contract, both unresolved on our side:

- **We do not know whether it was executed.** In the copy we hold, neither investment tier is initialed and the signature page is not visible. Treat it as terms offered, not terms agreed, until we retrieve the executed original.
- **One clause in our copy is truncated mid-sentence** — the fortuitous-events clause ends at "In such circumstances, performance…". Nobody here knows what the sent version said after that.

**A second, separate exposure.** We hold roughly 5,000 scraped business-contact records for Metro Manila clinics and have built (but never used) a system that can email them. We have stopped short of the first send because we do not know our lawful basis under the Data Privacy Act. That question is gating revenue, and it is in scope for this engagement (Section 8).

---

## 2. What we are asking for

A fixed-fee, bounded engagement with three deliverables:

1. **An opinion on the nine policies below** — for each, whether it is enforceable as drafted under Philippine law, and where it is not, the modification that makes it so.
2. **A remediation note on the 11 August contract** — what we can correct on an executed agreement, by what instrument, and what we simply have to live with.
3. **An answer to the RA 10173 questions in Section 8** — enough for us to either start outreach or stop planning on it.

A master service agreement drafted from the corrected policies is a natural follow-on, but we are not asking for it in this scope. We would rather know what is wrong before paying anyone to write what is right.

---

## 3. Who ADVO is

A small Philippine software agency operating out of Metro Manila. Founder-led, with a development team; we design, build, deploy and then host the systems we sell, which is why hosting and data handling sit inside the same commercial relationship as the build.

Our clients are Philippine SMEs. Every engagement so far has been **B2B** — we have no consumer contracts and no consumer-facing terms of service. Some client systems hold employee records (attendance, leave, HR files) belonging to the client's own staff.

**Corporate details we have deliberately not filled in here** — registration particulars, registered address, and the correspondence address for this engagement — are listed as open items in Annex A. We would rather hand you a blank than a guess in a document you are going to rely on.

---

## 4. What ADVO actually sells, and for how much

You cannot judge a payment clause without knowing the money it governs. These are real, current figures.

**Deal shape — a commissioned system, quoted in tiers.** Our largest open deal is an integrated HR and operations application, quoted at two investment tiers, one to be initialed by the client:

| Tier | Scope | Price |
|---|---|---|
| Tier 1 | Core Attendance System | **₱45,000** |
| Tier 2 | Advanced Integrated Management System (Tier 1 plus leave management, company handbook, showroom QR tracking, CRM/sales pipeline, website updates) | **₱70,000** |

**Payment — a 50/50 milestone split.** 50% of the Total Project Value on commissioning (contract signing, with a witness present), 50% on final delivery and formal Project Sign-off. So the first milestone on that deal is ₱22,500 or ₱35,000 depending on the tier, and the second is the same again. Invoices payable within 7 business days.

**Recurring — an infrastructure fee.** A separate **₱3,000 per month** per client, billed on the 1st, starting at final delivery and deployment. It covers hosting, database maintenance, domain renewals, and an uptime target; it is quoted separately from the build fee and is subject to load testing. We currently have two clients contracted at ₱3,000/month each. This fee is the reason we hold a suspension remedy (Policy 5) — it is the only lever we have on a client whose live system we are paying to keep online.

**Timeline.** 6–8 weeks for the smaller tier, 12–16 for the larger. 30-day post-launch warranty.

**Scale, so you can calibrate.** These are five-figure-peso engagements, not enterprise deals. A clause that is technically optimal but costs ₱20,000 to enforce is not useful to us. Where the correct answer and the proportionate answer differ, we would like to know both.

**Two engagements that shaped this policy**, so the drafting choices are legible:

- A deployed project where a ₱12,000 downpayment did not cover the work performed, and revisions ran open-ended, because the contract was silent on both.
- A project where the client began requesting features seen on *competitors' sites* mid-build, with no change-order trigger in the contract to classify them as new scope.

Everything in Section 6 is a reaction to one of those two failures, or to a gap we found afterwards.

---

## 5. How to read Section 6

Each of the nine policies below gives you: **the operative language we are actually using** (quoted verbatim — this is the text that went out), **why it is drafted that way**, and **the closed-form questions we need answered**.

The questions are deliberately phrased so they can be answered *yes / no / yes-with-modification*. We are not asking you to "review our contracts." We are asking you to close a list.

**Instruments we believe are engaged** — please correct this list if it is wrong or incomplete, since it drives the scoping:

- **RA 10173** (Data Privacy Act of 2012) and its IRR — Sections 6, 8 and 9 below.
- **RA 8792** (Electronic Commerce Act of 2000) — electronic documents and signatures, Policy 9.
- **Civil Code of the Philippines (RA 386)** — autonomy and mutuality of contracts, penal clauses and their equitable reduction, interest, and fortuitous events. Policies 1, 5, 7 and 8.
- **RA 8293** (Intellectual Property Code) — ownership of commissioned work versus copyright in it. Policy 6.
- **RA 11967** (Internet Transactions Act of 2023) — whether our model, or our clients', falls within its scope at all. Section 9.
- **Rules on Electronic Evidence** (A.M. No. 01-7-01-SC) — evidentiary weight of the in-app signature record, Policy 9.

---

## 6. The nine policies

### Policy 1 — Payment schedule

> Client shall pay fifty percent (50%) of the Total Project Value upon commissioning, being the signing of this Agreement in the presence of a witness, and the remaining fifty percent (50%) upon final delivery of the deliverables and formal Client sign-off (or deemed approval as provided in the Revisions clause). Payments are strictly non-refundable once the corresponding milestone has been approved and signed off. Invoices are payable within seven (7) business days of issuance.

Alongside this, a **recurring monthly infrastructure fee** is billed separately from the Total Fee, on the 1st of each month, beginning at final delivery. Data on our hosting is architected for a **10-year retention** period, after which records enter automated archival and deletion.

**Why:** the milestone that gets disputed later is always the first one ("we never agreed to that amount"), hence the witness. Splitting 50/50 replaced an earlier floor-based rule that could not coexist with our real tier sizes.

**Questions**

1. Is the **"strictly non-refundable once the milestone is approved and signed off"** term enforceable as drafted against a B2B client under Philippine law, or is it vulnerable as a penalty a court may reduce?
2. Is a **witnessed signature** doing any legal work for us here, or is it purely evidentiary? Should it be notarized instead, and does the answer change at these contract values?
3. Does splitting the engagement into a **build fee and a separate recurring infrastructure fee** create any characterization problem — two contracts, or one contract with a services tail — that we should be drafting around?
4. Does the **10-year retention** commitment expose us where the hosted data is the client's employee records rather than our own? Is retention properly the client's decision to make as controller, and are we drafting it at the wrong layer?

### Policy 2 — Revision limits

> Each deliverable includes up to five (5) rounds of revisions at no additional cost. All revisions must be utilized prior to the signing of the Project Sign-off document. Where included revision rounds remain unused as of final delivery, the Client may still invoke them, within the scope originally agreed, for a period of six (6) months following the signing of the Project Sign-off document. Adjustments requested thereafter fall strictly under the thirty (30) day bug-fixing warranty or a separate maintenance agreement.

**Why:** there is no hourly overage meter. The allowance is generous and then simply *ends*. The risk shape that creates is a client who never signs off — because sign-off is the event that closes the allowance. Our commercial defence against that is Policy 3, not this one.

**Questions**

5. The **6-month tail** survives final payment and survives the 30-day warranty. Is that bounded enough to be safe as drafted, or are we exposed to an unbounded claim months after the receivable has closed?
6. Should the tail **expire on transfer of hosting** — that is, when the client migrates the system off our infrastructure and we can no longer verify what changed? Is that a permitted condition to attach?
7. **"Within the scope originally agreed"** is the only limit on what an invoked round may demand. Is that a workable standard, or does it need a defined method to be enforceable?

### Policy 3 — Feedback window and deemed approval

> If the Client fails to provide feedback within fifteen (15) business days of a review delivery, ADVO shall issue a formal Notice of Pending Deemed Approval. If no response is received within fifteen (15) subsequent business days of that Notice, the revision shall be deemed approved and finalized. Separately, delays caused by the Client — including late assets, delayed feedback, or no response within ten (10) calendar days — automatically extend the delivery timeline by the equivalent number of days without penalty to ADVO.

**Why:** this is the mechanism that makes the 5-round allowance finite in practice. Without it, a silent client holds the project — and the second ₱22,500 or ₱35,000 — open indefinitely.

**This clause carries a known defect.** The payment table of the sent contract describes deemed approval as *"10-day non-response as outlined in Revisions,"* while the revisions section defines 15 + 15 business days. Two different clocks for the same trigger, in the same document, already in a client's hands.

**Questions**

8. **Is deemed approval enforceable as drafted** under Philippine law, given that it converts client *silence* into acceptance of a milestone that triggers a payment obligation?
9. Is the **formal Notice sufficient service**, and must it be sent by a specific method (registered mail, personal service, email to a nominated address) to be relied on?
10. **Which clock governs** where the payment table says 10 days and the revisions clause says 15 + 15 — the specific clause, or the one more favourable to the client? Our working assumption is 15 + 15; confirm or correct it.
11. **How do we correct that inconsistency on an already-executed contract** — an addendum, an erratum letter, a side letter, or does it require re-execution?

### Policy 4 — Change orders

> Any addition, removal, or substantive modification of scope outside the agreed Statement of Work constitutes a Change Order. New modules, redesigns, structural adjustments, or feature additions require a written addendum executed before work begins. Each Change Order will be documented in writing by ADVO with: (a) a description of the change; (b) the impact on price (PHP); (c) the impact on timeline; and (d) any dependent changes. No work will commence on a Change Order until the Client confirms the foregoing in writing (email reply or signed addendum). Designs, features, or capabilities observed at third-party vendors or competitor sites that the Client wishes to incorporate after work has begun are governed by this Change Order process.

**Why:** a revision refines what was agreed; a change order adds what was not. With five free rounds, the boundary between the two is carrying much more commercial weight than it used to — a misclassified request is simply free work.

**Questions**

12. What is the **right form of acceptance** for a change order — is an email reply quoting the peso amount and timeline sufficient to vary the agreement, or is a signed addendum required every time?
13. Is the clause enforceable where we have **already begun the added work** on a verbal go-ahead, which is what actually happens in practice? Is there language that protects us in that case without inviting it?

### Policy 5 — Late payment and suspension

> Invoices are payable within seven (7) business days of issuance. Unpaid balances remaining after fifteen (15) business days from the date of issuance, commencing strictly on the sixteenth (16th) business day, shall incur a penalty fee of two percent (2%) per month, calculated daily until fully settled, or the maximum rate permitted by Philippine law, whichever is lower. Where a recurring infrastructure fee remains unpaid fifteen (15) days past its due date, ADVO reserves the right to suspend server hosting and API access until the balance is cleared, and shall not be held liable for data loss or business interruption resulting from that suspension.

**Questions**

14. Is **2% per month, calculated daily from the 16th business day, within the maximum rate permitted** by Philippine law for a B2B obligation? If the "whichever is lower" saving clause is doing the work, is it drafted well enough to survive?
15. **Is the hosting-suspension remedy safe as drafted?** It takes a client's live business system — including their employees' attendance and payroll-adjacent records — offline. What is our exposure, and does the liability disclaimer around it actually survive?
16. If suspension is defensible, **what procedure must precede it** — notice period, form, cure window — for the disclaimer to hold? Our internal rule is never to suspend without a written warning first; we want to know whether that rule should be in the contract instead.
17. Does suspending a client's access to **their own data** create a separate obligation under RA 10173, independent of the contract?

### Policy 6 — Intellectual property and ownership

> All design files, source code, and deliverables remain the exclusive property of ADVO until full payment is received, and the Client has no right to publish or use any deliverable until the corresponding payment clears. Upon receipt of final payment, full ownership of all deliverables, including source files and codebases, transfers to the Client. Client-provided product shots, establishment photographs, and brand materials are licensed to ADVO on a limited basis solely for the purpose of building the deliverables. All private organizational data remains accessible only to the Client and strictly confidential. ADVO retains the right to display completed work in its portfolio and marketing materials unless the Client requests otherwise in writing before final delivery.

**Why:** the portfolio right has a deadline attached deliberately — the client may opt out in writing before final delivery, after which the right is settled and we can market the work.

**Questions**

18. **Does "full ownership of all deliverables, including source files and codebases" inadvertently transfer our reusable internal components** — the libraries, patterns and scaffolding we carry from project to project and reuse for every client? If so, please draft the carve-out. This is the single question on this list we are most worried about, because we have shipped the same internal components to more than one client under this language.
19. How do **ownership of a commissioned work and copyright in it** interact here under the Intellectual Property Code — does our clause validly move both, and does it require a specific written stipulation to do so?
20. Is the **portfolio right with a pre-delivery written opt-out** enforceable, and does it survive where the deliverable displays the client's own branding or a screenshot containing their data?
21. Is the **"no right to publish or use until payment clears"** retention enforceable against a client who has gone live anyway? What is the practical remedy at these contract values?

### Policy 7 — Non-abandonment, continuity and termination

> **ADVO's commitment.** ADVO shall not unilaterally abandon or deprioritize the project without prior written notice and a mutually agreed revised timeline.
>
> **Client's commitment.** The Client shall not cease communication, withhold payment, or engage a third party to replicate or replace ADVO's work while the project is active and any payment remains outstanding; doing so constitutes a material breach of this Agreement.
>
> **With cause.** Either party may rescind this Agreement for legitimate cause by written notice, allowing a fourteen (14) day cure period to resolve the issue. The Client remains liable for the financial value of all work completed up to the date of termination.
>
> **Without cause, by the Client.** Upon cancellation mid-project for convenience, the Client shall compensate ADVO for the exact percentage of project completion achieved as of the cancellation date, and shall fully reimburse any non-refundable third-party integrations purchased for the project.
>
> **Without cause, by ADVO.** ADVO shall fully refund any advanced milestone for which work has not yet commenced, and shall surrender all paid-for code assets to the Client in their current state.

**Questions**

22. **Is "the exact percentage of project completion" a measurable enough standard** to be enforceable on termination for convenience, or does it need a defined method — milestone count, logged hours, deliverable count? Please tell us which method you would actually be willing to argue.
23. Is **"cease communication" as a material breach** enforceable, and how would we evidence it?
24. The **14-day cure period** applies symmetrically. Is that appropriate where the client's breach is non-payment and ours is delay, or should the two carry different cure regimes?
25. Does **"surrender all paid-for code assets in their current state"** on our own termination for convenience conflict with the Policy 6 retention until full payment? We think these two clauses may contradict each other.

### Policy 8 — Warranty, liability and fortuitous events

> ADVO provides a thirty (30) day warranty following launch to correct bugs or defects resulting from development, at no additional cost. While ADVO commits to exercising professional diligence in project execution, it shall not be held liable for indirect commercial losses, third-party service interruptions, or events arising from forces beyond its reasonable control. Interruptions, pricing changes, or breaking changes originating with third-party providers relied upon by the deliverables do not constitute a defect under this warranty.
>
> Neither party shall be held legally responsible for delays, defects, or failure to perform obligations under this Agreement resulting from fortuitous events, including acts of God, national connectivity outages, changes to regional regulations, and prolonged server outages beyond the reasonable control of the developer. **In such circumstances, performance…** *(our copy is truncated at exactly this point — see below)*

**This clause carries the second known defect.** The fortuitous-events clause is **cut off mid-sentence** in the copy we hold. We do not know whether the sent version suspends performance for the duration, extends the timeline day-for-day, or grants either party a termination right after a prolonged event. Those are materially different outcomes, and nobody on our side knows which one is in the client's copy.

**Questions**

26. **What does the executed clause actually say** — we will retrieve the original; we need you to tell us what turns on each of the three possible endings, and which one you would want us to have signed.
27. Is our **limitation of liability enforceable as drafted**, and is an uncapped exclusion of "indirect commercial losses" sustainable, or should there be a stated cap? At a ₱70,000 contract with a ₱3,000/month tail, what cap is defensible?
28. **We need a cyber-specific liability position we do not currently have at all:** a liability cap for a data breach on infrastructure we manage, and the data-handling standard we should be committing to. We hold client uploads, hosted assets, and employee records belonging to client staff. What belongs in the contract, and what belongs in a separate data-processing agreement?
29. Does the **third-party dependency disclaimer** hold where the dependency was our choice of vendor rather than the client's?
30. Would any of our clients' end users being **outside the Philippines** create GDPR or other foreign exposure for us as processor? None currently are, to our knowledge, but we would like the trigger condition rather than a yes/no.

### Policy 9 — The Project Sign-off document

The pivot the whole engagement turns on. It is the client-facing document accepting final delivery of a commissioned system. Signing it makes final payment due within 7 days, closes the free-revision allowance, and starts the 6-month unused-revision tail. Deemed approval under Policy 3 can substitute for a signature.

Our platform captures the signature **in-app**: the client types their name in their portal, and we record the timestamp, IP address, and user-agent, and store a link to any countersigned PDF. We treat the paper PDF as the authoritative artifact and the in-app record as an audit trail — but our product interface has to describe the in-app signature to the client in *some* words, and we have refused to call it "legally binding" pending your answer.

**Questions**

31. **Is a typed name plus IP address, timestamp and user-agent a valid electronic signature** under the E-Commerce Act, or is it only evidence of assent? Is it a qualified electronic signature, and does that distinction matter for a document that triggers a payment obligation?
32. **What may our user interface truthfully call it?** We need the actual words. If "legally binding" is wrong, tell us what is right, and we will put your wording in the product.
33. Does the audit-trail record — **typed name, timestamp, IP, user-agent, stored server-side and immutable after signing** — meet the standard for admissibility under the Rules on Electronic Evidence, and if not, what should we additionally capture?
34. Where an admin records a **deemed or offline signature on the client's behalf**, what must we capture for that record to be relied on later?
35. Is a **countersigned PDF still required** to make sign-off safe, or can the in-app record stand alone? This determines whether we keep asking clients to print and sign.

---

## 7. Cross-cutting questions

### Question 36 — Confidentiality and NDAs

What is the right default confidentiality position for client data, brand assets, and leads we generate on a client's behalf? We currently have no NDA template and no mutual confidentiality clause beyond the one sentence in Policy 6. Should confidentiality be a clause in the master agreement, a separate mutual NDA, or both?

### Question 37 — Uptime commitments

Our infrastructure fee carries a stated uptime target. That is a service-level commitment. What is our exposure if we miss it, should the target be qualified (scheduled maintenance, upstream provider outages, fortuitous events), and is a service-credit remedy better than a bare target at ₱3,000/month?

### Question 38 — Maintenance and infrastructure termination

Monthly maintenance and infrastructure arrangements are currently informal — they simply continue. Should they carry a defined term and a 30-day cancellation clause on both sides, and what happens to the client's hosted data on cancellation?

### Question 39 — Master agreement structure

Should these nine policies live in a single master service agreement with per-project statements of work, or be repeated in each engagement contract? We would like your recommendation on structure before anyone drafts anything.

---

## 8. Data privacy — RA 10173 and cold outreach

**This section is separable, and it is the one gating revenue.** If you would rather quote it separately from Sections 6 and 7, please do.

**The facts.** ADVO holds approximately **5,000 scraped business-contact records** for Metro Manila clinics — publicly listed business contact details, gathered by automated collection from public web sources, not obtained from the data subjects. We have built an email campaign system capable of sending to that list. **It has never been used for a real send**, and we have deliberately held it because these questions are unanswered. We also maintain a suppression list of addresses that have unsubscribed, which we retain **indefinitely and specifically so that we cannot re-contact them**.

**Questions**

40. **What is our lawful basis for processing scraped business-contact data**, and does **legitimate interest** cover B2B cold outreach in this form under RA 10173? If it does, what must the legitimate-interest assessment record for us to rely on it?
41. Does the fact that the records are **business contact details** rather than personal ones change the analysis, or does an individual practitioner's name attached to a clinic address make it personal information regardless?
42. **Do we owe a notification to each data subject on first contact**, and if so, what must it say and where must it appear in the message?
43. **What retention period applies to a lead we never convert?** And to a **suppressed address** — is keeping it forever, precisely so that we cannot re-contact the person, itself defensible, or does it require its own basis?
44. **Are we required to register as a Personal Information Controller with the National Privacy Commission** at this volume, and does the answer change given the client systems we also host and operate?
45. **Does an unsubscribe link alone discharge our obligation**, or is an explicit erasure path also required — and what must that path actually do?
46. **What is the consequence of the collection itself** — is the scraping of these records a completed processing activity that already requires a basis, independent of whether we ever send?
47. Separately from outreach: as **processor of our clients' employee records** on infrastructure we operate, what do we owe — a data-processing agreement, breach-notification undertakings, a Data Protection Officer? We currently have none of these.

---

## 9. Two things we would like you to scope for us

48. **Does RA 11967 (Internet Transactions Act) apply to us, to our clients, or to neither?** We sell and contract online, and we host our clients' commerce-adjacent systems. We do not know whether that puts either party in scope, and it would be useful to be told plainly.
49. **Is there anything in this brief that is the wrong question?** We wrote it from our own failure modes. If there is an exposure we have not thought to ask about — corporate, tax, employment, or cyber — we would rather hear it now than discover it in a dispute.

---

## 10. The engagement we are requesting

**Scope.** Sections 6 and 7 (the nine policies and four cross-cutting questions), Section 8 (data privacy), and the remediation note on the 11 August contract described in Section 2. Section 9 is scoping guidance, not a deliverable.

**What a reply should contain**, so we can act on it without a second round:

1. A **fixed fee** for the engagement, or a fee per section if you would rather split privacy from contracts. We would prefer a fixed fee to an hourly estimate.
2. **Turnaround** — a date by which we would have the opinion. Section 8 is the urgent half; if the two halves carry different turnarounds, tell us both.
3. Whether you need **the executed contract** in hand before starting, or whether you can begin on the policy language while we retrieve it.
4. Any **conflict check** you need to run, and what you need from us to run it.
5. Whether the follow-on **master service agreement** is something you would draft, and a rough range for it — so we can plan, not so we can commit today.

**What we will supply on engagement:** the executed 11 August contract once retrieved, the full policy document these clauses are drawn from, the corporate details in Annex A, and a walkthrough of the sign-off and campaign systems if that helps you answer Sections 8 and 9.

**Our constraint, stated honestly.** We are a small agency with five-figure-peso contracts. We are asking for a scoped opinion, not a retainer, and we would rather buy the twenty percent of the advice that removes eighty percent of the exposure. If that framing changes what you would quote, please quote the version you think we actually need.

---

## Annex A — Facts we cannot supply from this document

Everything below is deliberately blank. It is not in the source material this brief was assembled from, and we will not guess at a company identifier in a document going to counsel. All of it will be supplied on engagement.

| Item | Status |
|---|---|
| Legal name of the contracting entity | **TODO — to be supplied** |
| Entity type (sole proprietorship / partnership / corporation) | **TODO — to be supplied** |
| Government registration particulars | **TODO — to be supplied** |
| Registered business address | **TODO — to be supplied** |
| Signatory and authority to bind | **TODO — to be supplied** |
| Correspondence address for this engagement | **TODO — to be supplied** |
| The executed 11 August 2026 contract | **TODO — being retrieved; not confirmed executed** |
| Full text of the fortuitous-events clause as sent | **TODO — truncated in our copy** |
| Which investment tier the client selected | **TODO — no tier initialed on our copy** |

---

## Annex B — Provenance of this brief

Assembled 2026-08-23 from ADVO's internal contract policy document, which was itself written from project post-mortems and reconciled on 2026-08-19 against the contract dated 11 August 2026. Client names, project totals, and deliverable lists from that engagement are confidential and are deliberately not reproduced here; the commercial figures in Section 4 are the standard terms ADVO offers, and are included because a payment clause cannot be judged without them.

Nothing in this brief has been reviewed by a lawyer. That is what it is asking for.
