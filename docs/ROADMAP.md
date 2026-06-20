# ADVO Roadmap

Unified, forward-looking roadmap for the ADVO platform and the business that runs on top of it. Synthesizes signals from the Messenger archive (Apr–Jun 2026), the May 26 client meeting, and the in-progress codex landing redesign.

Treat this as the **canonical roadmap**. Two existing sub-roadmaps stay where they are and are referenced from here:
- **Landing design** — see [/ROADMAP.md](../ROADMAP.md) (Stripe-audit-driven; most items implemented in the `codex/linear-design-system` stash, only the hero+services copy port shipped to main so far).
- **Platform feature backlog** — see [FEATURES.md → Roadmap](FEATURES.md#roadmap) (Internal Library, Admin UX cleanup, monorepo).

## Status snapshot

| | |
|---|---|
| **Frontend** | advo.ph live, monorepo (`apps/web`) |
| **API** | api.advo.ph live (`apps/api`, PM2 on VPS) |
| **Active client engagements** | Felici Gelato (in dev), Coffee Rush (in dev) |
| **Shipped** | Fourlinq (`fourlinq.ph`) — June 19, 2026 |
| **Stalled** | Daj, Ms. Imee (Inventi), Tita Imee |
| **Passed/declined** | Personal Collection (already on Shopify) |
| **Prospecting** | Medical City (David's cousin lead), dental clinic outreach (5K scraped leads) |

## P0 — Revenue & contracts

Highest leverage: every signal in Messenger about money or scope points here. Without these, revisions are unbounded and downpayments don't cover the work.

| Item | Why | Effort | Notes |
|---|---|---|---|
| **Revision limits in contract template** | Fourlinq + Felici both ran open-ended revisions. Quote, David (Jun 19): *"we lowk shuldv specified pala sa contract ung revisions thingy"*. | S | Add: "X rounds included, $Y per additional round." Need legal review per Prince's "we basically need an advisor to help us with cyber law related contracts." |
| **Change-order process** | Once revisions are capped, scope changes need a paper trail. Email + signature OK to start; eventually a form in `/hub`. | S | Could live in Client Hub later — `/hub/projects/:id/change-orders`. |
| **Proposal-to-contract pipeline** | Felici signed because of a custom PDF. Currently every proposal is a one-off Canva file. | M | Template + variable fill (client name, scope, pricing, timeline). Manual first; automate later. |
| **Downpayment floor** | Fourlinq's 12k downpayment didn't cover the work (David: *"the 12k isnt enough as a downpayment"*). | S | Policy: 40% min upfront, or fixed ₱30k floor — whichever is higher. Document in contract template. |

## P1 — Lead generation & proposal automation

Currently bottlenecked: 5K scraped clinic leads but proposals are manual, so the pipeline can't fan out.

| Item | Why | Effort |
|---|---|---|
| **Email-on-new-lead notification** | Leads come in via the contact form; you don't see them until logging into admin. Two test rows in DB are evidence nobody's monitoring it. | S — wire to existing Resend creds in `apps/api/.env` |
| **Clinic-scraper → proposal-PDF pipeline** | Already have 5K leads with digital scores, design feedback, perf grades. Need: feed → AI-design proposal → send. | L — multi-stage. Start with template-fill, defer AI generation. |
| **Proposal tracker** | Once you send 10+/month, need to know which clinics opened, replied, signed. | M — table + statuses in admin. |
| **Targeting rule: zero/outdated systems only** | Repeating signal: *"if a company has a system/website, we can't just offer them a new one"* (Prince) — Personal Collection passed, AAPM has Inventi, etc. | S | Bake into the scraper scoring + outreach criteria. |

## P1 — Project management for multi-client throughput

Direct quote, Prince (May 6): *"we need a proper workflow or system na we'd be able to manage or handle multiple clients at once — specifically the workload on the developer side."*

| Item | Why | Effort |
|---|---|---|
| **Capacity view in Admin** | `AdminAvailability` tracks per-member time blocks (school/work/break/unavailable) and computes overlapping free time. **Audit finding:** what's missing is the *commitments* side — projects-per-dev. `project_access` table already links team↔project, and the single-project endpoint (`GET /api/projects/:id`) returns the team. But the projects *list* endpoint (`GET /api/projects`) does not include team data, so a per-member project count needs either (a) extending the list endpoint to include `team_member_ids[]` per project, or (b) a new `GET /api/team/:id/projects` endpoint. Then in AdminAvailability: show each member's active-project count beside their tab + a "capacity remaining" indicator. | M — needs API change first |
| **Per-junior client assignment workflow** | Prince's pattern: 1 junior dev per client (Anthony / Au / Kenneth) under his supervision. Surface this in `AdminTeam` + `AdminProjects`. | S |
| **School/availability blackout calendar** | "pre-fi to finals szn" cost ~2 weeks of throughput. Track each member's school blocks so client timelines don't promise into them. | M |

## P2 — Platform polish (UX / landing)

Mostly captured in the two sub-roadmaps; surfaced here so you don't lose them.

| Item | Source | Status |
|---|---|---|
| Portfolio proof cards (outcome metrics, before/after, system map) | Codex stash | Stashed, not ported |
| Full-screen mobile nav drawer | Codex stash | Stashed, not ported |
| Reduced-motion guards on animations | Codex stash | Stashed, not ported |
| Internal Library at `/admin/library` | [FEATURES.md](FEATURES.md#internal-library-planned) | Spec only, no code |
| Admin: empty-state CTAs, modal → page for Projects/Clients, hide experimental scrapers | [FEATURES.md](FEATURES.md#admin-ux-cleanup-planned) | Sidebar grouping ✅; rest open |
| Hub.tsx hardcoded "Client" badge → use actual role | Open thread | Trivial |

## P2 — Long-shot / parked

| Item | Why parked |
|---|---|
| **Hospital department data integration** | Prince flagged Apr 3: *"theres still sumthing big we can fix for them: their data kasi isnt integrated."* Competitors cost tens of millions. ADVO doesn't have a wedge yet. Revisit only when there's a champion inside a hospital (David's Medical City cousin?). |
| **Daj** | Wanted to bulk-submit media; no response since May. Don't chase — Prince's pivot: *"focusing on client generation rather than follow ups"*. |
| **Ms. Imee / Inventi** | Out of country, micromanages. Low-trust → low-throughput. Defer. |

## Active client status

Detailed, because timelines + cash flow run through these:

### Felici Gelato — IN DEV, deadline pressure
- Owner: Reign (daughter). Mother runs the cafe. Portfolio of 3 businesses (cafe, flowers, gelato).
- ₱60k proposal + ₱3k/month maintenance. Hard deadline: June 12 (already past).
- Active concern (Jun 19, David): client requesting features she sees from competitor designers mid-build → scope creep.
- **Action:** finish Round 1, then enforce the new revision-limit clause for further work.

### Coffee Rush — IN DEV, no signed contract
- Owners: Tita Iya + Tito Adrian. Wants Zus-Coffee-style app, **no delivery** model.
- Juniors Anthony + Kenneth assigned.
- May 26 meeting at Eastwood happened. Tito said he'll refer other clients **once ADVO proves on Felici**.
- **Action:** sign contract before Round 1 ships. Block per "downpayment floor" rule above.

### Fourlinq — DEPLOYED, post-mortem
- Owner: Ms. Imee. Site live at `fourlinq.ph` June 19.
- Lesson: ₱12k downpayment insufficient + revisions unbounded → revenue gap. **This is the case study driving the P0 contract changes.**

### Medical City / Makati Med — PROSPECTING
- David's cousin (chief surgeon) is the in-road. No proposal sent yet.
- Idea floated: data-encoding service (lighter than the full hospital integration moonshot).

## May 26, 2026 meeting — decisions

3 guests + 5 ADVO members + Mr. Wagan. Priority order declared 3:47 PM:
1. **Felici Gelato** (first) — needs SocMed campaign for authentic Italian cafe + expansion to BGC/Makati
2. Flowers & Chocolates
3. Italian Cafe
4. Coffee Rush (lowest — most public, but lowest priority)

Other commitments from the meeting:
- **Franchise model** — private rollout first, public release after.
- **Long-term partnership** — Mr. Wagan signaled willingness to bring more clients post-Felici proof. "Considered retirement at 50."
- **Workload protection** — team studies stay priority; partners will throttle referrals accordingly.

## Honest gaps in this doc

- **Felici's exact open scope** — Round 1 revisions are still happening; no public list of what's left.
- **Coffee Rush feature list** — beyond "app like Zus, no delivery," details aren't in the chat archive I scanned.
- **Legal advisor** — Prince said one is needed; not booked.
- **Email provider for lead notifications** — Resend creds exist in API env; the per-event template + trigger don't.
