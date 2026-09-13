# Roadmap Rejections

Date: 2026-06-16
Scope: Stripe landing audit -> ADVO design roadmap.

## Rejected

| Idea | Reason | Evidence |
|---|---|---|
| Copy Stripe's full homepage density | Stripe serves many products, industries, docs paths, and enterprise routes. ADVO needs the confidence and structure, not the page length. | Stripe audit `audit.md:237-244` says to avoid copying Stripe's length or product density. |
| Use gradients as the main wow factor | The user explicitly preferred raw wordmark/footer treatment and disliked decorative fading/gradient effects. The audit also recommends product evidence before more decoration. | Stripe audit `audit.md:239-240`; current feedback thread. |
| Restore a generic isometric/3D infrastructure hero | The user called the current launch/infrastructure views generic and ugly. The useful direction is cleaner self-hosted proof, not another abstract diagram. | Stripe audit `audit.md:251`; current feedback thread. |
| Make carousels carry primary proof | Carousels hide important evidence and create more motion/focus burden. Proof should be visible in the grid first. | Stripe audit `audit.md:244`. |

## Deferred

| Idea | Reason | Revisit when |
|---|---|---|
| Desktop mega menu | Helpful only after ADVO has enough real routes and package taxonomy to justify it. | Product surfaces, package routes, and proof pages are live. |
| Client logo strip | Worth doing only with approved logos and honest claims. | Client permissions and metrics are available. |

---

Date: 2026-08-21 (carried onto main 2026-09-13 with the analytics port)
Scope: browser + user analytics (public site, client hub, staff accountability).

## Rejected

| Idea | Reason | Evidence |
|---|---|---|
| A third-party analytics SaaS (GA4 / Mixpanel / PostHog cloud) | ADVO self-hosts by choice, and this data includes named client staff at healthcare clients. A US processor adds a cross-border transfer question. The self-hosted event table reuses infrastructure already paid for. | `README.md` self-hosted stack; `docs/CUTOVER.md`. |
| Reuse `activity_log` as the event store | Wrong shape and wrong index: an audit table queried by entity, against high-volume events queried by period and session. It would make the audit trail unreadable and the analytics slow. | `apps/api/src/db/schema.ts` `activityLog`; migration `046` header. |
| Keystroke logging or periodic screen capture for staff | NPC Advisory Opinion 2018-084 struck this exact mechanism down as "excessive and disproportionate." Not on the roadmap in any tier. | `docs/MONITORING-POLICY.md` §3. |
| Consent as the lawful basis for staff monitoring | The employment power imbalance makes consent weak and contestable; NPC guidance points to a written policy plus notice under Sec 12(b)/12(f). Consent stays the basis for **visitor** tracking only. | NPC AO 2024-003; `docs/MONITORING-POLICY.md` §1. |
| Fingerprint as the sole visitor identity key | High-fidelity on Chrome, noised on Safari and Firefox strict/private, blocked on Brave. A single-key design drops those visitors silently and reads as a traffic decline. | `apps/web/src/lib/track.ts` `resolveIdentity`. |
| Raw event retention with no expiry | The production database is small. Unbounded events is the failure mode this feature would introduce. | `apps/api/src/services/retention.service.ts` `RETENTION_DAY`. |

## Deferred

| Idea | Reason | Revisit when |
|---|---|---|
| Session replay | The highest-resolution version of what AO 2018-084 refused, and it captures client data on hub pages too. | The event pipeline has run for a quarter and a specific question needs it. |
| Cross-device visitor stitching | Depends on identity that is already unreliable on a third of browsers. Stitching unreliable ids produces confident wrong answers. | The unidentified bucket is measured. |
| `/work` assigned-work page and member of the month (`mac/org-compat-t0` `ea56663`, migration `019_recognition`) | Not a dependency of analytics, so not ported. On main `/work/:slug` is now the public case-study route, so the Mac `/work` staff page would collide with it and needs a new path. | Someone asks for an assigned-work surface again. |
