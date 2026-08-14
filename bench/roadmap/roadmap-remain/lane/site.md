# Lane site

branch: `lane/site`
worktree: `C:/Users/maran/Antigravity/advo-lane-site`
port: `6445`
builder: `grok`

## Ships

Public marketing routes share one reduced-motion white shell; destinationFor is tested.

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6445/`.

## Item

- `reduced-motion-site`
- `viewport-site`
- `shell-interior`
- `destination-test`

## Owns

- `apps/web/src/components/landing/LandingPage.tsx`
- `apps/web/src/components/landing/landing-page.css`
- `apps/web/src/components/landing/landing-shell.tsx`
- `apps/web/src/pages/Start.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Team.tsx`
- `apps/web/src/pages/ProjectDetail.tsx`
- `apps/web/src/lib/destination.ts`
- `apps/web/src/test/destination.test.ts`
- `bench/roadmap/roadmap-remain/viewport-site.mjs`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — reduced-motion-site, viewport-site, shell-interior, destination-test PASS
