# Lane docs

branch: `lane/docs`
worktree: `C:/Users/maran/Antigravity/advo-lane-docs`
port: `6430` (preview optional)
builder: `grok`

## Ships

A new agent reading `README.md` and `docs/ROADMAP.md` is told the truth: `/` is the shipped Codex `LandingPage`, not the old 3D/TechTicker/orange-blob page, and the landing is not "in-progress".

Surface: the files themselves. `README.md` Features → Public Site, `docs/ROADMAP.md` intro.

## Item

- `readme-state` — rewrite the public-site / design-system bits of `README.md` to the live `LandingPage`. Drop 3D R3F, Simple Icons ticker, and orange blob CTA as current `/`.
- `docs-current` — `docs/ROADMAP.md` is **shared**: edit only the intro sentence that still says the Codex landing is in-progress / only a hero+services copy port. Then add a 2026-08-15 HANDOFF entry and fix stale type/look rows in `docs/MOODBOARD.md` / landing section of `docs/FEATURES.md`.

Do not invent features the copy/route lanes have not merged yet. You may say satellite routes are being aligned (they are in-flight on `lane/route`).

## Owns

- `README.md`
- `docs/FEATURES.md`
- `docs/HANDOFF.md`
- `docs/MOODBOARD.md`

## Forbidden

- `apps/web/index.html`
- `apps/web/src/components/landing/LandingPage.tsx`
- `apps/web/src/components/landing/landing-shell.tsx`
- `apps/web/src/pages/Start.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Team.tsx`
- `apps/web/src/pages/ProjectDetail.tsx`

## Done when

```bash
node bench/roadmap/landing-follow/scoring.mjs
```

`readme-state`, `docs-current` PASS. Product ids may stay FAIL.
