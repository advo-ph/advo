# Lane route

branch: `lane/route`
worktree: `C:/Users/maran/Antigravity/advo-lane-route`
port: `6420`
builder: `grok`

## Ships

`/start`, `/login`, `/team`, and `/project/:slug` wear the white landing chrome. They no longer mount `FloatingNav` or the old dark `Footer`. `/hub` is untouched.

Surface: `http://127.0.0.1:6420/start`, `/login`, `/team`, `/project/:slug`

## Item

- `start-shell`
- `login-shell`
- `team-shell`
- `project-shell`

Add `apps/web/src/components/landing/landing-shell.tsx` (singular) and swap those four pages onto it. Reuse classes from `landing-page.css`. You may **add** classes to `landing-page.css` (shared). Do not rewrite `LandingPage.tsx`.

Keep the existing form/auth/team/case-study behavior. This is chrome, not a rewrite of start/login logic.

## Owns

- `apps/web/src/components/landing/landing-shell.tsx`
- `apps/web/src/pages/Start.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Team.tsx`
- `apps/web/src/pages/ProjectDetail.tsx`

## Forbidden

- `apps/web/index.html`
- `apps/web/src/components/landing/LandingPage.tsx`
- `README.md`
- `docs/FEATURES.md`
- `docs/HANDOFF.md`
- `docs/MOODBOARD.md`

Do not edit `FloatingNav.tsx` or `Footer.tsx` — `/hub` still imports them.

## Done when

```bash
node bench/roadmap/landing-follow/scoring.mjs
```

`start-shell`, `login-shell`, `team-shell`, `project-shell` PASS. Copy/docs ids may stay FAIL.
