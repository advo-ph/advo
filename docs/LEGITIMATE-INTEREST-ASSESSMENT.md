# Legitimate Interest Assessment — Staff Behavioural Telemetry in /admin

**Status: DRAFT — pending founder review. Not adopted. No DPO has been designated; no
approval date is recorded because none has occurred.**

Scope of this assessment: ADVO's proposal to collect *behavioural telemetry* — pointer
hover, dwell time per element, and section attention — from ADVO staff while they use the
internal `/admin` surface. Processing basis considered: legitimate interest, under the
three-part test that NPC Advisory Opinion 2024-003 expects to see documented (purpose,
necessity, balancing). Data subject: ADVO's own staff, i.e. an employment relationship
where consent is not freely given and cannot carry this processing.

---

## 1. PURPOSE — what legitimate interest is served

The honest statement of what management wants to know, in the order it is actually wanted:

1. **Where staff attention goes inside /admin.** Which sections of a project view are
   read, which are skipped, which are opened and abandoned. Intended use: cut dead UI,
   promote the panel people actually read.
2. **Whether a deliverable was actually looked at before it was marked done.** This is an
   accountability motive, not a UX motive. It should be named as such rather than
   dressed as product research.
3. **Rough engagement level per staff member** — who is in the tool, how long, how
   deeply. This is the motive with the highest intrusiveness and the weakest independent
   justification.

Interests (1) is a genuine and lawful business interest: improving an internal tool ADVO
owns and maintains. Interest (2) is lawful in principle — an agency answering to clients
has a real interest in QA integrity. Interest (3), as stated, is workforce monitoring; it
is a *management preference*, and it is the one that has to survive necessity and
balancing on its own merits, not ride along on (1).

No third party receives this data. No client-facing or commercial use is proposed.

---

## 2. NECESSITY — is telemetry actually necessary?

**Finding: for the accountability purpose (2) and the engagement purpose (3), NO. A
less-intrusive means already exists in production and is already collected.**

`apps/api/src/db/schema.ts` confirms ADVO already holds, without any new collection:

| Existing field | Table | What it already answers |
| --- | --- | --- |
| `status` (`deliverable_status` enum) | `deliverable` | Whether work moved and where it stalled |
| `due_date` / `completed_at` | `deliverable` | On-time rate, per person via `assigned_to` |
| `verified_at` | `deliverable` | QA sign-off actually happened; schema comment records it is *independent of status/completed_at*, so a "marked done but never checked" deliverable is already visible as `completed_at IS NOT NULL AND verified_at IS NULL` |
| `assigned_to` → `team_member` | `deliverable` | Attribution per staff member |
| `action`, `entity_type`, `entity_id`, `user_id`, `created_at`, `metadata` | `activity_log` | Who touched what, when, in what order — an audit trail per user already indexed by user and entity |

The accountability question — *did this person do the work, on time, and did someone
verify it* — is answered **more directly and more accurately** by outcome data than by
hover and dwell. Dwell time is a proxy of very poor quality for attention: a long dwell
may be an idle tab, a phone call, or lunch; a short dwell may be competence. Substituting
a noisy proxy for a direct measure ADVO already possesses is not necessity — it is
preference. Under a proper necessity test, a proposal that ignores an available
less-intrusive means that already achieves the purpose **fails that limb**, and this one
does for purposes (2) and (3).

**What telemetry adds beyond the delivery data.** Being fair to the proposal, there is a
real increment, and it is narrow:

- `activity_log` records *writes and actions*, not *reads*. It cannot show that a section
  rendered and was never looked at. Only view-side telemetry can distinguish "UI nobody
  uses" from "UI nobody needed this month".
- Outcome data cannot locate *where in a screen* effort is lost — which panel is scrolled
  past, which field ordering causes back-and-forth. That is design evidence, not
  performance evidence.

That increment supports purpose (1) — interface improvement — **and nothing else**. It is
also obtainable in aggregate: section-attention counts pooled across staff answer the
design question fully, without per-person identity. Necessity therefore holds only for
**aggregate, section-level, non-identified** telemetry, and fails for **per-person,
identified** telemetry on every purpose stated.

---

## 3. BALANCING — staff expectation of privacy vs. the interest

Weight on the staff side:

- An employee cannot meaningfully refuse an employer's monitoring; the power imbalance is
  the whole reason this is a legitimate-interest analysis and not a consent one.
- Staff reasonably expect that using an internal work tool logs *what they change*, not
  *where their eyes and cursor rest*. Continuous attention measurement crosses from
  record-keeping into observation, and it is felt that way regardless of intent.
- Telemetry that can be read per person invites use for evaluation and discipline — a
  purpose beyond the one it was collected for, and the most likely path to real harm here
  (unfair appraisal from a bad proxy).
- Chilling effect is a real cost to ADVO too: staff who know dwell is scored will perform
  dwell.

Weight on ADVO's side: a modest, genuine interest in a better internal tool (purpose 1),
already largely served by outcome data for anything performance-related.

Safeguards that would tip the balance toward proceeding:

1. **Narrow scope.** Section-attention and dwell only, on `/admin` only. Never keystroke
   content, never screen capture, never clipboard, never anything outside `/admin`, never
   off-hours background collection.
2. **Aggregate by default.** Store no `user_id` on a telemetry row; aggregate at write
   time to section-level counts. If a per-person field is ever added, this assessment is
   void and must be redone.
3. **Notice.** Staff are told in writing what is collected, why, and where before any
   collection starts, plus a visible in-tool indicator. No silent instrumentation.
4. **Retention limit.** Raw telemetry deleted at 30 days; only derived section-level
   aggregates persist. Enforced by a scheduled purge, not by policy prose.
5. **Access limit.** Aggregates reachable only by the founder/tool-owner role. Not exposed
   in any per-staff view, not in `activity_log`, not in any performance surface.
6. **Purpose lock.** Telemetry may not be cited in appraisal, discipline, or compensation.
   The accountability question is answered from `deliverable.verified_at`, `due_date` vs.
   `completed_at`, and `activity_log` — the direct measures — and from nothing else.
7. **Right to object.** Any staff member may object and be excluded, without giving a
   reason and without consequence; exclusion must be a real switch, not a request queue.

With safeguards 1–7 the residual intrusion is low and the balance favours proceeding.
Without safeguards 2, 5, or 6, per-person attention data exists in a workplace and the
balance goes the other way.

---

## OUTCOME

**PROCEED WITH CONDITIONS — for purpose (1) only.**

- **Purpose (1), interface improvement:** proceed, conditional on every safeguard 1–7
  being implemented *before* first collection. Aggregate, section-level, 30-day raw
  retention, notice given, opt-out live.
- **Purpose (2), verifying that work was really reviewed:** **DO NOT PROCEED.** It fails
  necessity outright — `deliverable.verified_at`, `due_date`/`completed_at`, and
  `activity_log` already answer it more directly. Use those.
- **Purpose (3), per-person engagement measurement:** **DO NOT PROCEED.** No necessity,
  and it loses the balancing test. Identified behavioural monitoring of staff is not
  authorised by this assessment.

Conditions are cumulative: if any of 1–7 is dropped, or a `user_id` is attached to a
telemetry row, the outcome reverts to do-not-proceed and this assessment must be rewritten
and re-reviewed before collection continues.

Review trigger: any change of scope, retention, access, or purpose; otherwise re-review
annually from the date of founder adoption (not yet set).
