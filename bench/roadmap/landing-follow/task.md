# Landing follow-through

Date: 2026-08-15
Scope: leftover work after the Codex `LandingPage` already on `main` (`278a65a`). Not a new redesign.

Spec pointers (read these; do not restate or fork them):

- Live landing: `apps/web/src/components/landing/LandingPage.tsx` + `landing-page.css`
- QA that already passed the Codex regions: `audits/landing-design-qa.md`
- Fidelity notes (mix-and-match, not 1:1): `audits/landing-fidelity-audit.md`
- Next cut already named by the repo: root `ROADMAP.md` → **Next Cut** (team/about inherit the landing language; remaining public surfaces)
- Canonical product roadmap: `docs/ROADMAP.md`
- Brand direction: `docs/VISION.md`, `docs/MOODBOARD.md`
- Naming: `~/.agents/skills/convention/SKILL.md` — singular everywhere

## What a user gets when this tier is live

Public marketing routes (`/`, `/start`, `/login`, `/team`, `/project/:slug`) read as one white editorial ADVO site. Title/meta match the page. Testimonials are not invented. Social icons go somewhere real. Docs describe the shipped landing, not the old black Lovable/3D page.

## In-scope item

| id | Behavior | Surface | Bench id |
|---|---|---|---|
| `title-meta` | Document title + Open Graph match the live landing offer, not "We Digitalize It For You". | load `/` → `<title>` / `og:title` | `title-meta` |
| `proof-copy` | Testimonial block uses only approved real proof (Fourlinq is the shipped public client) or is removed. No invented people/companies. | `/` testimonials | `proof-copy` |
| `social-wire` | Footer social icons are real URLs (same source as the old Footer: `GET /api/settings/public` + existing defaults). No `href="#"`. | `/` footer social row | `social-wire` |
| `start-shell` | `/start` uses the white landing chrome, not `FloatingNav`. | `/start` | `start-shell` |
| `login-shell` | `/login` uses the white landing chrome, not `FloatingNav`. | `/login` | `login-shell` |
| `team-shell` | `/team` uses the white landing chrome, not `FloatingNav` / old `Footer`. | `/team` | `team-shell` |
| `project-shell` | `/project/:slug` uses the white landing chrome, not `FloatingNav` / old `Footer`. | `/project/fourlinq` (or any slug) | `project-shell` |
| `readme-state` | `README.md` describes the shipped `LandingPage`, not 3D R3F / TechTicker / orange blob CTA as current `/`. | `README.md` | `readme-state` |
| `docs-current` | `docs/ROADMAP.md` no longer claims the Codex landing is in-progress or only a hero/services copy port. | `docs/ROADMAP.md` intro | `docs-current` |

## Not in this tier (do not build)

| id | Why |
|---|---|
| `dashboard-redesign` | Original Codex half-2 (admin/hub for every role). No approved spec. Hub/admin stay on the June Linear language. |
| `newsletter-api` | Landing newsletter is local-only; there is no subscribe endpoint. Do not invent one. |
| `client-logo-strip` | Root `ROADMAP.md` triage: needs real permission. Placeholder logos are rejected. |
| `hub-chrome` | `/hub` is a product surface. Leave `FloatingNav` there. |

## Rejected approaches

- Do not restore the 3D infrastructure scene or generic "digitalize" hero.
- Do not invent testimonials, metrics, or client names.
- Do not restyle `/admin` or `/hub` in this tier.
- Do not edit another lane's owned files.
- Do not "fix" the old Stripe-landing bench (`bench/roadmap/landing-stripe-audit`) — it scores the previous landing.

## Bench

```bash
node bench/roadmap/landing-follow/scoring.mjs
```

A check is green only when its source assertion holds. The instrument is not the deliverable: a lane whose whole diff is under `bench/` has not shipped.

## Ports (preview only — do not edit `vite.config.ts`)

| lane | web |
|---|---|
| copy | `npm --workspace apps/web run dev -- --port 6410` |
| route | `npm --workspace apps/web run dev -- --port 6420` |
| docs | `npm --workspace apps/web run dev -- --port 6430` (only if you need to eyeball copy) |

API stays `http://localhost:6407` (`VITE_API_URL`). Do not stand up a second database.
