# ADVO Landing Design Roadmap

Date: 2026-06-16
Scope: Stripe landing audit -> ADVO public landing, navigation, proof, and design-system follow-through.

> **Status 2026-08-23 — this tier is closed, and its prose is stale.** Every item
> below is implemented, but the shipped landing was rebuilt after this cut: the
> sections described here (product surfaces, proof cards, private stack, build
> room) are not the sections `LandingPage.tsx` renders today. The **benchmark**
> was retargeted to the shipped surface on 2026-08-18 and is current — the
> **prose was not**. Read the bench, not this table, when you need to know what
> the landing does.
>
> Live landing work is now tracked in
> [docs/ROADMAP.md → Acceptance — web-aug parcel](docs/ROADMAP.md#acceptance--web-aug-parcel-paymongo-compliance--offer-truth),
> with two red benches: `npm run bench:paymongo` and `npm run bench:offer`.
> Note that `engagement-cta` in this tier's bench asserts the landing carries
> peso figures — the 2026-08-21 instruction is to remove them, so that check is
> scheduled to be re-authored by lane `offer`.

## Discovery Summary

Signals used:

- Stripe audit recommendations in `audits/stripe-landing-audit-2026-06-16/audit.md`.
- Current ADVO landing code in `apps/web/src/components/landing`.
- Current design tokens and rail primitives in `apps/web/src/index.css` and `apps/web/src/components/ui/section.tsx`.
- Current docs in `README.md`.

Counts:

- Discovered candidates: 9
- Validated roadmap items: 6
- Triage items: 2
- Rejected items: 4

Honest gaps:

- This pass was intentionally scoped to the Stripe audit document and the local ADVO repo. I did not perform a broad GitHub sibling-repo crawl.
- The canonical Piper benchmark path mentioned by the roadmap skill was not present on this machine, so this repo uses a local quarantined benchmark under `bench/roadmap/landing-stripe-audit`.

## Benchmark

The benchmark suite is quarantined from `npm test`:

```bash
node bench/roadmap/landing-stripe-audit/scoring.mjs
node bench/roadmap/landing-stripe-audit/viewport-check.mjs
```

It converts this roadmap into a falsifiable design contract so design changes can be promoted only when the corresponding check turns green. Baseline output is stored in `bench/roadmap/landing-stripe-audit/runs/2026-06-16-baseline.json`; the latest viewport run is stored in `bench/roadmap/landing-stripe-audit/runs/2026-06-16-viewport-check.json`.

## P0 - Make Taste Measurable

| Item | What it closes | Effort | Benchmark | Status |
|---|---|---:|---|---|
| Quarantined landing design benchmark | Stops design iteration from relying only on subjective screenshots. Creates a scoreboard for the Stripe audit translation. | S | `bench/roadmap/landing-stripe-audit/scoring.mjs` and `bench/roadmap/landing-stripe-audit/viewport-check.mjs` must stay green while remaining outside normal test gates. | Implemented + verified |
| Restore normal landing-page document scroll | The global shell no longer locks `html/body` to one viewport with `#root` as the only scroll container, so full-page capture, native browser scroll, and section QA work normally. | S | `document-scrolls-full-landing` viewport check is green at 360/390/768/1280/1440. | Implemented + verified |
| Retarget floating nav to document scroll | The floating header compact state now follows `window.scrollY` after restoring native page scrolling, instead of reading a stale root scroll container. | S | `floating-nav-document-scroll` source check is green. | Implemented + verified |

## P1 - Product Truth Before Decoration

| Item | What it closes | Effort | Benchmark | Status |
|---|---|---:|---|---|
| Replace abstract service cards with ADVO product surfaces | The old services section described generic agency services. It now presents Website, Client Hub, Admin, and Care Plan as ADVO product surfaces with compact UI previews. | M | `product-surfaces` check is green. Browser-measured at 1440px, 390px, and 360px with no horizontal overflow. | Implemented + verified |
| Upgrade portfolio into proof-rich case studies | Portfolio cards now show an outcome metric, products used, launch timeline, before/after proof visual, result bullets, and internal ADVO proof fallbacks when local portfolio data is empty. Admin case studies can save the richer proof fields. | M | `proof-metrics` check is green. Browser-measured at 1440px, 390px, and 360px with no horizontal overflow. | Implemented + verified |
| Make proof visuals feel like systems, not placeholders | Proof cards no longer rely on mostly-empty before/after rectangles; fallback cards now show a visible before/after system map with client hub, admin console, and VPS handoff rows. | S | `proof-metrics` requires `proof-system-map` plus Client Hub, Admin Console, and VPS Handoff rows. | Implemented + verified |
| Make mobile nav a full-screen route drawer | The old mobile nav was a small floating popover. It now uses a full-viewport drawer with large route rows, `aria-expanded`, Escape close, and bottom-pinned Start a Project / Client Hub actions. | S | `mobile-drawer` check is green. Browser-measured at 390px and 360px with no horizontal overflow and verified bottom-pinned actions. | Implemented + verified |

## P2 - Controlled Wow Factor

| Item | What it closes | Effort | Benchmark | Status |
|---|---|---:|---|---|
| Add reduced-motion and focus-state resilience for animated sections | Hero, nav, contact/build-room, and private-stack motion now respect reduced-motion paths; CSS marquee, bounce, spin, and press feedback are disabled under `prefers-reduced-motion: reduce`. | S | `reduced-motion` check is green. Build verifies the Framer reduced-motion paths compile. | Implemented |
| Sync README with the current Linear/Stripe-inspired design system | README now documents the current Linear-inspired rails/grid direction, product surfaces, proof cards, full-screen mobile drawer, reduced-motion policy, and current token/animation conventions. | S | `docs-current-design` check is green. Stale 3D/orange/zero-scroll-animation claims are removed. | Implemented |
| Promote source checks into visual viewport checks | The Stripe audit explicitly recommends testing 360, 390, 768, 1280, and 1440 widths before shipping visual changes. | M | `viewport-check.mjs` captures 360/390/768/1280/1440 screenshots and fails on horizontal overflow, clipped fixed elements, missing CTA visibility, missing product/proof sections, non-opaque mobile drawer, unpinned drawer actions, or collapsed footer wordmark. | Implemented + verified |
| Rework private-stack and build-room sections | The old self-hosted diagram and generic launch CTA now read as gridded product surfaces: Website, Client Hub, Admin, Singapore VPS proof, build board, response timing, preview target, and handoff artifacts. | M | `private-stack-product-narrative` and `build-room-cta` checks are green; viewport gate checks mobile/desktop overflow and CTA visibility. | Implemented + verified |
| Replace generic post-hero narrative | The old “why go digital,” colorful logo ticker, and generic FAQ now become a product-system story: public offer, client workspace, team controls, raw private stack, and concrete build questions. | M | `why-system-not-generic-digital`, `raw-private-stack-strip`, and `faq-product-system` checks are green; source benchmark rejects generic digital-transformation copy and external logo ticker markup. | Implemented + verified |
| Tighten above-the-fold product offer | The hero now preserves the full-bleed team photo while positioning ADVO as a website + client hub + admin + private stack builder, with a first-viewport system rail and sharper page metadata. | M | `hero-product-system-offer` check is green; viewport gate requires the primary CTA and hero system rail to render at 360/390/768/1280/1440. | Implemented + verified |
| Remove stale generic process/contact copy | Process and final CTA defaults now describe the website, client hub, admin, and private-stack delivery path, and guard against old “digitalize” / “How We Work” content from the API. | S | `process-system-sequence` and `build-room-cta` checks are green; stale generic defaults are rejected by the source benchmark. | Implemented + verified |
| Add restrained interaction layer | Hero rail cells, product cards, proof cards, private-stack layers, and the build-room panel now share a subtle hover lift/light treatment that stays quiet and disables motion under reduced-motion settings. | S | `tasteful-interaction-layer` check is green; build verifies the CSS utility and reduced-motion path compile. | Implemented + verified |
| Tighten footer and transition continuity | Footer now continues the website + client system story with a project CTA, proof chips, product-system sitemap, and oversized ADVO wordmark instead of generic agency/service copy. | S | `footer-system-continuity` check is green; viewport gate requires system footer copy and a non-collapsed wordmark at all checked widths. | Implemented + verified |

## Landing merge — best of both worlds (2026-09-04)

Grounded in a blind A/B of the two landing forks (main vs `revised`) judged by grok as two personas across desktop and phone: the 60-year-old end user chose `revised` (bigger readable hero, video, plain use-cases, shorter), the 35-year-old buyer chose `main` (named-client proof, quotation path, depth). The A/B numbers are the grounding: main hero h1 46px vs revised 59px; main 8 sections / 3,795 chars vs revised 4 / 2,762; main mobile had 25 horizontal-overflow elements vs 0. These three items take main's proof-rich shell and fold in revised's readability. Benchmarks are Tier 3 (written, measured with the landing profile probe `scripts/`-style capture that reports h1FontPx, video count, heroContrastRatio, sectionCount, docChars); they are red until built and live under `bench/roadmap/landing-merge/` (gate-excluded, promote-on-build).

| Item | What it closes | Surface | Effort | Benchmark | Status |
|---|---|---|---:|---|---|
| Video hero with a big headline on main's shell | Main's hero is a static `hero.jpg` with a 46px display headline (`LandingPage.tsx:212`, `--landing-text-display: clamp(34px,3.2vw,46px)`), which the 60-year-old found too small. Ports revised's autoplay-video-with-poster hero (`revised LandingPage.tsx:467`) and larger type onto main's existing `landing-shell` + `LandingNav overlayHero` + parallax + marquee. | `/` hero renders `<video autoplay muted loop playsInline poster>` full-bleed behind main's shell; `--landing-text-display` ≥ `clamp(40px,5vw,60px)`. **Blocker:** copy `hero-building.mp4` (+ mobile variant + poster) from `advo-revised/apps/web/public/landing/` into `apps/web/public/landing/`. | M | At 1440px: hero has ≥1 autoplay video, h1 computed font-size ≥ 56px, hero contrast ≥ 4.5, AND main's shell/nav/marquee still render. Measure with the landing profile probe (video count, `h1FontPx`, `heroContrastRatio`). Red today: static img at 46px. | Implemented + verified (`bench:landing-merge` 12/12) |
| Shorter landing with the examples integrated | Main runs 7 `<section>`s / 3,795 chars (`LandingPage.tsx`, work grid at `:408` via `WorkMedia`); the 60-year-old found it long, but the client proof is what the buyer valued, so it must survive the cut. Consolidates the work/examples into one tight section, each client's screenshot beside a link to their live site. | `/` shows one consolidated work section; each work card renders the client logo/name and an outbound link to that client's live URL; total landing `<section>` count ≤ 5. | M | At 1440px: `sectionCount` ≤ 5 AND `docChars` < 3,200 AND every work card still shows a client name/logo AND links to the client's live site (an `href` to the client domain). Red today: 7 sections / 3,795 chars. | Implemented + verified (`bench:landing-merge` 12/12) |
| Compliant business-identity footer | Footer (`landing-footer.tsx`) has policy links + email + a copyright line but no registered business name, registration body, address, or phone — the identity a DTI-registered PH business is expected to publish, and the same fields PayMongo review needs. Adds an identity block sourced from `data/legal-identity.json`, rendering only fields that are real so no placeholder ships. | Footer renders `legal_name` + "Registered with the Department of Trade and Industry (DTI)" + `support_email` always; `registration_number`, `business_address`, `support_phone` render only when their value is not `"TBD"`. Same source as `bench:paymongo`, so filling the TBDs greens both. | S | Footer DOM contains "ADVO Web Development Services" and "Department of Trade and Industry", never the literal string "TBD", and the four policy links (`/terms`, `/privacy`, `/refund`, `/dispute`) resolve. Red today: no identity block. | Implemented + verified (`bench:landing-merge` 12/12) |


**Built 2026-09-04 (branch `feat/landing-merge`).** All three green: `bench:landing-merge` 12/12, and the existing `bench:landing` stays green (24/24 viewport, 15/15 source) after retiring two checks the merge superseded — `engagement-cta` and `faq-product-system`, which asserted the now-removed standalone engagement band and FAQ sections. Hero video assets copied from the `revised` tree into `apps/web/public/landing/`. Address/registration-no./phone still render nothing until `data/legal-identity.json` leaves "TBD".

**New problems surfaced during validation (not from the request):**
- The hero video assets exist only in the `revised` tree; item 1 cannot ship until they are copied into main's `public/landing/`.
- Business address and phone are absent site-wide, not just in the footer; `data/legal-identity.json` holds them as `"TBD"` and, per the never-invent-legal-identity rule, they stay literal `"TBD"` until Prince supplies them. Item 3 is built to render nothing for a `"TBD"` field, so it is compliant the moment the file is filled — no second edit.
- The existing Triage row "Client logos / industry proof strip" is now partly resolved: main already renders real client marks lifted from each client repo (`LandingPage.tsx:133`), so item 2 extends approved logos rather than introducing placeholders.

## Triage

| Item | Why not now | Trigger to revisit |
|---|---|---|
| Desktop mega menu | ADVO currently has a shallow IA. A Stripe-level mega menu could add complexity before packages, case studies, and routes are ready. | Revisit after product surfaces and packages exist. |
| Client logos / industry proof strip | High-value, but only if the logos and claims are real and approved. Placeholder logos would reduce trust. | Revisit when client permission and proof data are available. |

## What We Are Not Going To Do

- Copy Stripe's page length, density, or exact visual language.
- Add decorative gradients as the main source of "wow" without real product evidence.
- Restore a generic 3D infrastructure diagram as the centerpiece of the self-hosted section.
- Hide the strongest proof inside carousels where users may never see it.

## Next Cut

1. Decide whether the remaining team/about route should inherit the landing rail system or stay separate.
2. Review remaining non-landing surfaces for consistency once the public landing is accepted.
