# Landing Design-System Acceptance Tasks

Date: 2026-06-16

## Required Checks

- `product-surfaces`: Services must become ADVO product surfaces: Website, Client Hub, Admin, Care Plan.
- `hero-product-system-offer`: Hero must present ADVO as a website plus client/admin/private-stack builder, not a generic agency intro.
- `proof-metrics`: Work/proof modules must include outcomes, before/after state, product-used labels, launch timeline data, and a non-empty system proof map.
- `mobile-drawer`: Mobile nav must be full-screen, expose `aria-expanded`, and bottom-pin Start a Project / Client Hub actions.
- `floating-nav-document-scroll`: Floating nav must track normal document scroll, not a stale root scroll container.
- `reduced-motion`: Landing animations must respect reduced-motion users.
- `docs-current-design`: README must describe the current grid/rail design and no longer describe stale 3D/orange blob work.
- `private-stack-product-narrative`: Self-hosted section must present Website, Client Hub, Admin, and Singapore VPS proof as a gridded product system instead of a generic infrastructure diagram.
- `why-system-not-generic-digital`: The first post-hero section must explain the website, client hub, admin, and private-stack offer instead of generic digital-transformation benefits.
- `raw-private-stack-strip`: The stack strip must be a quiet gridded map and avoid colorful external logo marquees or non-self-hosted platform claims.
- `build-room-cta`: Final CTA must show a concrete build room with response timing, preview target, task board, and handoff artifacts.
- `process-system-sequence`: Process defaults must describe the website, client hub, admin, and stack delivery sequence instead of generic agency phases.
- `tasteful-interaction-layer`: Hero, product, proof, private-stack, and build-room surfaces must share restrained hover treatment that is disabled under reduced motion.
- `footer-system-continuity`: Footer must continue the product-system story, include the project CTA and big wordmark, and avoid generic service/footer copy.
- `faq-product-system`: FAQ defaults must answer concrete product-system, client hub, admin, hosting, and timeline questions instead of generic agency questions.

## Promotion Criteria

The viewport gate must pass at:

- 360px mobile
- 390px mobile
- 768px tablet
- 1280px desktop
- 1440px desktop

Run it with:

```bash
node bench/roadmap/landing-stripe-audit/viewport-check.mjs
```

Visual checks fail on horizontal overflow, a collapsed document scroll height, clipped fixed header content, missing primary CTA visibility, missing hero system rail, missing product/proof sections, missing product labels, generic footer copy, a collapsed footer wordmark, a non-opaque mobile drawer panel, or unpinned mobile drawer actions.
