# ADVO Workplace Monitoring Policy — `/admin` Behavioural Telemetry

> **⚠️ DRAFT — not issued.** This policy has **not** been signed off by the founder and has **not** been distributed to the team. Nothing described here is running. Collection stays disabled in code until (1) the founder signs below, (2) every team member has received this document and had a chance to ask questions, and (3) a human writes the start date into §9. Enabling collection before those three things is the exact failure NPC Advisory Opinion 2018-084 refused to excuse.
>
> Companion document: `docs/LEGITIMATE-INTEREST-ASSESSMENT.md` (the three-part test). This policy is one of the two prerequisites for the `/admin` → Accountability → Activity feature (ROADMAP `A13-team-behavior`); the assessment is the other. Neither is optional.

## 1. Why this document exists

ADVO wants a behavioural signal on its own admin console — which parts of `/admin` a team member actually works in, and for how long — so that workload and accountability conversations rest on evidence instead of impression. That is a real business purpose, and it is also processing of personal data about employees under the **Data Privacy Act of 2012 (RA 10173)**, regulated by the **National Privacy Commission (NPC)**.

Two NPC advisory opinions frame what ADVO may and may not do:

| Opinion | What it held | What ADVO takes from it |
|---|---|---|
| **AO 2018-084** | Keystroke logging and random screen capture on office-issued computers are **excessive and disproportionate**. | ADVO does none of that. See §3 for the explicit exclusion list. |
| **AO 2024-003** | Monitoring software is permissible where **(a)** a clear policy exists, **(b)** employees receive proper notice, and **(c)** the processing survives a three-part legitimate-interest test. Lawful bases: **Sec 12(b)** (processing necessary to a contract with the data subject) and **Sec 12(f)** (legitimate interest). | This document is (a). Distribution under §9 is (b). `LEGITIMATE-INTEREST-ASSESSMENT.md` is (c). |

**This policy does not rely on employee consent.** In an employment relationship the power imbalance means consent is not freely given, so it is a weak and unstable basis — an employee who withdraws it would have to be treated as if the processing had never been lawful. ADVO relies on Sec 12(b) and Sec 12(f) instead, which is why the policy and the notice have to be real rather than ceremonial. Advisory opinions are guidance, not binding rulings, and this document has not been reviewed by counsel.

## 2. What is monitored

Narrowly and only this:

| Dimension | Scope |
|---|---|
| **Surface** | Routes under `/admin` only. Nothing on the public site, the client hub, or any other application. |
| **Who** | Signed-in ADVO staff accounts, while the `/admin` session is active. |
| **Event kind** | Three, and no others: **hover** (pointer enters a named section), **dwell** (elapsed time a named section is the focused/visible section), **section attention** (which named `/admin` section the tab is on while the window is focused). |
| **Payload per event** | Actor account id · route path · section name · event kind · start timestamp · duration in milliseconds. That is the whole record. |
| **Timing** | Only while the `/admin` tab is focused. A blurred tab, a locked screen, or a closed browser produces nothing. |

## 3. What is **not** monitored

This list is binding. Adding anything to §2 that is excluded here requires a new version of this policy, re-issued to the team, before the code ships.

- **No keystroke logging.** Key events are never captured, timed, or counted.
- **No screen capture**, screenshots, screen recording, or webcam/microphone access — scheduled or random.
- **No content.** Nothing a team member types is recorded: not form input, not search queries, not note or message bodies, not client data they view. Only *that* a section was attended to, never *what* was in it.
- **No clipboard**, file system, installed-application, or process monitoring.
- **Nothing outside `/admin`.** No other tab, no other site, no browsing history. The telemetry is code inside the ADVO admin bundle; it has no reach beyond the page it runs on.
- **No location or device tracking**, no IP-based geolocation, no network monitoring.
- **No off-hours collection by design.** Telemetry exists only while someone is signed into `/admin` and working in it. ADVO does not monitor personal devices or personal accounts.
- **No automated decision-making.** These numbers do not by themselves trigger discipline, pay changes, or termination. They inform a conversation with a human in it.

## 4. Why — the purpose, stated honestly

- **Workload evidence.** ADVO is ~8 people. Who is carrying which part of the console is currently a matter of impression, and impressions are unfair in both directions.
- **Accountability.** When a deliverable slips, the team should be able to look at where admin time actually went instead of relitigating memory.
- **Product signal on `/admin` itself.** Sections nobody attends to are sections that are not earning their place in the UI.

That is the complete list of purposes. Data collected under this policy will not be repurposed — not for performance ranking by score, not for client billing, not for anything not listed above — without a revised policy and fresh notice to the team.

## 5. Who can see per-person data

| Role | Access |
|---|---|
| **The team member** | Their own data, in full, at any time, self-service in `/admin`. |
| **Founder (Angelo Revelo)** | Per-person data across the team. Currently the sole holder of per-person access. |
| **Everyone else on staff** | Aggregate and anonymised views only. No named per-person breakdown of a colleague. |
| **Clients, contractors, third parties** | No access. This data is never shared, sold, or exported outside ADVO, except where a lawful order compels it. |

Per-person access is enforced in code by role check, not by convention. Any widening of the per-person tier — for example to a future team lead — is a change to this table and requires the team to be told before it takes effect.

## 6. Retention

| Stage | Period |
|---|---|
| Raw per-event records | **90 days** from the event timestamp, then automatically deleted. |
| Per-person daily rollup | **12 months**, then automatically deleted. |
| Aggregate, non-identifying totals | Retained indefinitely; carries no link back to an individual. |

Deletion is a scheduled job, not a manual chore. When a team member leaves ADVO, their raw records and per-person rollups are deleted within **30 days** of their last day.

## 7. Your data rights, and how to exercise them

Under RA 10173 every team member holds the rights to be informed, to access, to object, to correct, to erasure or blocking, to damages, and to data portability. In practice:

| You want to | Do this | Response |
|---|---|---|
| **See** what has been collected about you | Open `/admin` → Accountability → Activity → *My data*, or email the contact below | Immediate in-app; **15 calendar days** by email |
| **Correct** a record you believe is wrong | Email the contact below with the date and section | Corrected or annotated within **15 calendar days**, with a written reason if declined |
| **Object** to the processing, or to a specific part of it | Email the contact below, in writing | Written response within **15 calendar days**, stating whether ADVO's legitimate interest is overridden in your case and what will change |
| **Ask for erasure** of your records | Email the contact below | Assessed against §6 and any legal-hold obligation; written answer within **15 calendar days** |
| **Complain** past ADVO | National Privacy Commission — `complaints@privacy.gov.ph`, `privacy.gov.ph` | Per NPC process |

Raising any of these, including an objection, is not a disciplinary matter and will not be treated as one.

**Contact for all of the above:** Angelo Revelo — `_______________________` (email to be filled in on issuance).

## 8. Change control

Any change to §2, §3, §5, or §6 requires a new version of this document, founder sign-off, and re-issuance to the team **before** the change reaches production. Version history lives in git; the commit that changes this file and the commit that changes the collection code should be reviewable together.

## 9. Notice precedes collection

Notice comes first. This is the sequence, and none of it may be reordered:

1. Founder signs §10.
2. This document is distributed to every ADVO team member, individually, with a stated window to read it and raise questions.
3. Questions are answered and any resulting revision is re-issued.
4. A human writes the start date below.
5. Only then is the `/admin` telemetry code path enabled.

**Collection begins on:** `____________________` *(to be filled in by a human on issuance — deliberately blank; this document does not assert a date.)*

**Date this policy was distributed to the team:** `____________________`

## 10. Acknowledgement

Signing acknowledges receipt and that you have read the policy. It is **not** consent, and ADVO does not rely on it as a lawful basis — an unsigned acknowledgement does not make the processing unlawful, and a signed one does not cure a defect in it. It is a record that notice was given.

**Issued by**

| | |
|---|---|
| Name | Angelo Revelo |
| Role | Founder, ADVO |
| Signature | `____________________` |
| Date | `____________________` |

**Received and read**

| Name | Role | Signature | Date |
|---|---|---|---|
| `____________________` | `____________________` | `____________________` | `____________________` |
| `____________________` | `____________________` | `____________________` | `____________________` |
| `____________________` | `____________________` | `____________________` | `____________________` |
| `____________________` | `____________________` | `____________________` | `____________________` |
| `____________________` | `____________________` | `____________________` | `____________________` |
| `____________________` | `____________________` | `____________________` | `____________________` |
| `____________________` | `____________________` | `____________________` | `____________________` |
| `____________________` | `____________________` | `____________________` | `____________________` |

*Add rows as the team grows. A team member who joins after the issuance date receives this policy during onboarding, before their `/admin` account is created.*
