# Lane copy

branch: `lane/copy`
worktree: `C:/Users/maran/Antigravity/advo-lane-copy`
port: `6410`
builder: `grok`

## Ships

A visitor hitting `/` sees a title/OG that match the live landing, testimonials that are not invented, and social icons that go to real ADVO URLs.

Surface: `http://127.0.0.1:6410/`

## Item

- `title-meta` — `apps/web/index.html`
- `proof-copy` — testimonial block in `LandingPage.tsx` (Fourlinq is the only approved public client; or remove the block)
- `social-wire` — `.landing-social` in `LandingPage.tsx` (same `GET /api/settings/public` + defaults as `Footer.tsx`)

## Owns

- `apps/web/index.html`
- `apps/web/src/components/landing/LandingPage.tsx`

## Forbidden

- `apps/web/src/components/landing/landing-shell.tsx`
- `apps/web/src/pages/Start.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Team.tsx`
- `apps/web/src/pages/ProjectDetail.tsx`
- `README.md`
- `docs/FEATURES.md`
- `docs/HANDOFF.md`
- `docs/MOODBOARD.md`

`landing-page.css` is shared. Do not edit it unless a copy-only change is impossible without it; prefer not to.

## Done when

```bash
node bench/roadmap/landing-follow/scoring.mjs
```

`title-meta`, `proof-copy`, `social-wire` PASS. The other six ids may stay FAIL.
