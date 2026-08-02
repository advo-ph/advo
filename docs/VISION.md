# ADVO — Vision & Strategy

> Direction set by Prince A. Wagan and Mar Angelo Revelo, 2026-08-01. This is the
> "why we build" doc. [FEATURES.md](./FEATURES.md) is the "what exists" doc.
> Public brand / startup-site feel: [MOODBOARD.md](./MOODBOARD.md).

## One-line

ADVO becomes the operating layer for Philippine businesses that have not been
digitalized yet — software plus commodity hardware, deployed vertical by
vertical, until we are infrastructure rather than a vendor.

## What kind of company this is

Not an AI agency. Not global SaaS. The category is **vertically-integrated
industry software** — sometimes called a *full-stack vertical* or an *industry
OS*. Operationally we are a **product engineering + systems integration**
company: we write the software, we specify and deploy the hardware it runs on,
and we own the uptime.

The distinction matters because it changes what we sell (an outcome, not a
seat), how we price (deployment + retainer, not per-user/month), and what we
hire for (field-capable engineers, not just web devs).

## The market thesis

**Do not compete in the global SaaS market.** Service oversaturation is driving
every horizontal category toward free or near-free. Price is set by whoever is
most desperate, and in a global market someone is always more desperate.

**Compete in the Philippines and comparable developing markets.** Three reasons:

1. **Digitalization is incomplete.** Whole industries still run on paper,
   Viber threads, and manual tally sheets. The addressable work is not
   "replace their software" — it is "give them software for the first time."
2. **Competition is thin.** Firms in the PH genuinely modernizing industry
   still number in the low hundreds. We are early, not late.
3. **Distribution is relational, not paid.** In this market, deals move through
   people who vouch for you. That is the part of our position a competitor
   cannot copy by cloning our product.

### Evidence we are tracking

- [Swarm — Philippine AI Report](https://www.swarm.work/philippine-ai-report) —
  survey data on how Filipino businesses and consumers perceive websites and AI.
  Useful for sizing readiness, not for sizing spend.
- Comparable local operator: a kiosk-software shop serving restaurants, ~8
  people, freelance dev bench, 7-figure (PHP) revenue off a handful of clients.
  Confirms the margin sits in industry access, not in the code.

## The moat: embeddedness

The defensibility is not features. Features get copied in a quarter.

The moat is that once a business runs its **daily operations** on our rails —
queueing, ordering, billing, parking, inventory — switching cost stops being
technical and becomes operational. Retraining staff, re-cutting workflows, and
risking a day of downtime is a cost no owner takes on for a marginally cheaper
competitor. Software that is merely *used* gets churned; software that is
*depended on* does not.

This compounds: each vertical we embed in produces reference customers inside
that vertical, and reference customers in a relationship-driven market are the
distribution channel.

### The cost of the moat — read this before committing

Embeddedness cuts both ways. The moment we are load-bearing in someone's
operations, **their outage is our emergency.** A receipt printer that dies at
8PM on a Saturday is now ADVO's problem, not the client's.

That is not a reason to avoid the strategy — it *is* the strategy — but it is a
real, recurring cost that has to be priced and staffed:

- Support coverage during the client's operating hours, not ours.
- Spare-hardware inventory and a swap policy.
- Explicit SLA terms in every contract, with the retainer sized to fund them.
- Offline-tolerant software: local-first state, queue-and-sync, degrade
  gracefully when the network drops. This is a hard architectural requirement,
  not a nice-to-have.

Vertical plays usually die on support burden long before they die on product.
Budget for it from the first deployment.

## Product shape: software + commodity hardware

We do not manufacture. Every early deployment should run on hardware that is
already cheap, already available locally, and already replaceable at a mall:

| Surface | Hardware | Reference pattern |
|---------|----------|-------------------|
| Table / queue display | Any TV with HDMI | Yakiniku-Like-style queueing |
| Modern POS | iPad or Android tablet | Shang-style tablet POS |
| Mobile ops terminal | Android phone + Bluetooth receipt printer | Blue Residence / Alfamart parking |

The constraint is deliberate: **no custom hardware until a vertical is proven.**
Custom hardware adds inventory, lead times, and capital risk to a business that
currently has none of those. Commodity hardware keeps deployment cost near zero
and failure recovery to "buy another one."

## Where we are heading

**8–9 figures (PHP) over the long run**, reached by landing progressively larger
clients within verticals we already have reference deployments in — not by
scaling seat count on a horizontal product.

The sequence:

1. **Deploy** into a vertical via an existing relationship.
2. **Embed** — become the system operations actually run on.
3. **Reference** — convert that deployment into credibility inside the vertical.
4. **Repeat** in that vertical until we are the default, then pick the next one.

## Near-term product bets

Two asks are already on the table from Prince. Both are scoped against the
current codebase in [SCOPE-PWA-MEETING.md](./SCOPE-PWA-MEETING.md).

- **Mobile PWA** — ship the existing hub and admin as an installable app.
  Directly on-strategy: the deployment surfaces above are tablets and phones,
  and a PWA is how we get onto them without app-store friction. It is also the
  forcing function for the offline-tolerance requirement noted above.
- **Meeting record in the hub** — client-visible meeting notes with Plaud
  transcript and AI summary attached. Turns a call into a durable project
  artifact and deepens the client's dependence on the hub as the single place
  the project lives.

## Open questions

- Which vertical do we commit to *first*, and who is the relationship that opens
  it? The strategy is inert until this is named.
- What does the standard retainer + SLA look like, and does it cover the support
  cost modelled above?
- Do we hire for field deployment now, or stay dev-only until vertical #1 has
  two live sites?
