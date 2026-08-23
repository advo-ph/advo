# ADVO — Agency Platform

Landing site, client portal, and admin CMS for ADVO — a Philippine software agency. Editorial public `/` (`LandingPage`); Linear dark admin/hub. Self-hosted stack.

**Live**: [advo.ph](https://advo.ph) · **API**: [api.advo.ph](https://api.advo.ph/api/health)

## Features

### Public Site (`/`)

Shipped [`LandingPage`](apps/web/src/components/landing/LandingPage.tsx) + [`landing-page.css`](apps/web/src/components/landing/landing-page.css). Routed from [`Index.tsx`](apps/web/src/pages/Index.tsx). Public `/` is one white ground, one bounded type scale, one vertical-rhythm token, and media doing the talking — editorial grid, cinematic hero, dense black footer. Not the old dark 3D / ticker / blob landing.

- **Nav** — fixed blur chrome. Product / Services mega-panels + Work / Process / Quotation. Ghost Team + Log in. Dark Start a project. Hamburger on small viewports.
- **Hero** — cinematic floor still; headline "We digitalize it for you."  Light Get Started.
- **Capability** — Strategy / Design / Development / Support as a quiet icon row
- **Vision** — the mission statement verbatim: infrastructure of the technological layer for Philippine industries
- **Showcase** — mock workspace shell (overview, tasks, approvals, open quotations)
- **Work** (`#work`) — the sites we have already shipped, read live from `portfolio_project` via `GET /api/content/portfolio` ([`usePortfolio.ts`](apps/web/src/hooks/usePortfolio.ts)). One large screenshot, one line clamped to 120 characters, a link to the live site. An empty table renders no section — never invented client work.
- **Process** — Discover → Design → Build → Review → Launch → Support with before/after stills
- **Integrations** — name marquee (Gmail, Calendar, Notion, Slack, Trello, Drive, Zoom, Asana, Teams)
- **Surfaces** — Client Hub / Admin / Public site / Hardware as paginated cards
- **Workflow** — Inquiry → Scope → Build → Review → Launch as node cards
- **Engagement** — Project / Retainer / Hourly / Enterprise, each routed to a quotation request. **No price is published on the site** — pricing is a quotation conversation.
- **FAQ** — website-vs-system, client hub, admin console, self-hosted VPS stack, hardware, after-launch
- **Footer** — off-black; system-continuity lede + "Start the system" CTA, four system columns, oversized wordmark, social from `GET /api/settings/public`

Proof on `/` is the portfolio database — real shipped sites only, no testimonials. Title/OG match the hero ("ADVO. We digitalize it for you."). The footer is one shared component (`landing/landing-footer.tsx`) mounted by both `LandingPage` and `landing-shell`, so the two can't drift; social icons use `GET /api/settings/public` plus real defaults. `/start`, `/login`, `/team`, `/project/:slug`, and `/404` share `landing-shell`. `/hub` stays on the June Linear language (`FloatingNav`).

### Client Hub (`/hub`)

- **Smart Dashboard** — Project overview with status, progress bars, and billing
- **Engineering Feed** — Live GitHub commits merged with admin progress updates
- **Branch Selector** — View commits from different Git branches
- **Invoice Tracker** — View issued invoices, amounts, and payment status
- **Contract Section** — View/download project contract PDF
- **Progress Photos** — Photo grid from admin-uploaded project assets
- **Team Contacts** — Assigned team members with avatar, email, LinkedIn
- **Notification Bell** — Unread count badge with dropdown, mark-as-read

### Admin Panel (`/admin`)

- **Dashboard** — Time-aware greeting, KPI cards, project pipeline bars, cash flow snapshot, 3-column feeds (activity / deadlines / leads)
- **Projects** — Full CRUD, contract URL, asset upload (photos/docs)
- **Clients** — Client management with invite flow (creates auth account + sends welcome email)
- **Team** — Team member profiles (bio, LinkedIn, avatar upload)
- **Deliverables** — Schedule with status tracking and assignment
- **Meetings** — Plaud import / ADVO-folder watch / Ask Plaud → preview → confirm deliverable
- **Availability** — Team capacity management
- **Social** — Social media post management
- **Content Studio** — CMS with monochrome visibility toggles (public / hub)
- **Portfolio** — Public portfolio with case studies
- **Finance** — Invoice CRUD with status toggles
- **Notifications** — Send to individual clients or broadcast to all
- **Leads** — Inquiry pipeline with lead-to-client conversion
- **Brand Scraper** — Full-spectrum site analysis (screenshots, colors, SEO, a11y, perf, animations)
- **FB Scraper** — Facebook page + posts extraction (authenticated Playwright)
- **Settings** — System configuration (persisted to DB)
- **Mobile**: hamburger overlay sidebar + full-width content

### Client Onboarding (`/start`)

- Lead form: name, email, company, project type, budget, description
- Perks checklist + direct email + 24h response promise
- Success state personalized with first name
- White `landing-shell` chrome (shared with `/login`, `/team`, `/project/:slug`)

## Design System

Two languages. Public `/` is the editorial `LandingPage` (white ground, cinematic stills, dense black footer). Admin + hub stay on the June Linear dark chrome.

### Public landing (`apps/web/src/components/landing/landing-page.css`)

Every colour and every font-size in `landing-page.css` derives from the `:root` block at the top of that file. A one-off literal in a section rule is the thing the block exists to stop, and `npm run bench:visual` fails the build past 12 hex literals or 10 distinct `font-size` values.

| Token | Value | Use |
|-------|-------|-----|
| `--landing-ground` | `#ffffff` | The one ground |
| `--landing-ground-soft` | `#fafafa` | Raised panels, hero button |
| `--landing-ground-tint` | `#f2f2f4` | Quiet fills |
| `--landing-ink` | `#0c0c0c` | Body text, off-black footer |
| `--landing-ink-soft` | `#5f6673` | Secondary copy (`--landing-muted`) |
| `--landing-ink-mute` | `#9a9aa0` | Tertiary labels |
| `--landing-line` | `#e4e5e6` | Hairline |
| `--landing-line-soft` | `#eef1f5` | Ghost buttons (`--landing-ghost`) |
| `--landing-dark` | `#1a1a1a` | Primary CTA |
| `--landing-deep` | `#000000` | Media wells |

**Type**: Inter on `.landing-page`. Eight steps and no one-off sizes — `--landing-text-micro` `-small` `-body` `-lead` `-title` `-heading` `-display` `-wordmark`. The hero's phone step is a `--landing-text-display` override inside the 680px query, not a ninth size. Tight display tracking, weight 400 on headlines, no mono numerals.

**Rhythm**: every section pads on `--landing-section-rhythm` (`clamp(64px, 7vw, 112px)`). No per-section magic numbers.

**Motion**: name marquee + work-card hover, both under the `prefers-reduced-motion` path. No 3D scene, no blob CTA, no decorative gradient.

### Admin + hub (`apps/web/src/index.css`)

| Token | Value | Use |
|-------|-------|-----|
| `--background` | `hsl(0 0% 4%)` — `#0A0A0A` | Page background |
| `--foreground` | `hsl(0 0% 98%)` — `#FAFAFA` | Body text |
| `--card` | `hsl(0 0% 6%)` — `#0F0F0F` | Raised surfaces |
| `--secondary` | `hsl(0 0% 10%)` — `#1A1A1A` | Subtle fills |
| `--accent` | `hsl(19 77% 56%)` — `#E67A3A` | CTAs, highlights (warm orange) |
| `--border` | `hsl(0 0% 14%)` — `#242424` | Hairline dividers |
| `--radius` | `0.625rem` (10px) | Default rounding |

**Type**: Hanken Grotesk (Tailwind `sans`). Dense tables, no mono.

**Primitives** (`src/components/ui/section.tsx`) still exist for leftover satellite pages; `/` does not use them.

**Animation (product chrome)**: `FloatingNav` pill morph (Framer spring) stays on `/hub`. Button hover micro-transitions.

**Scrollbars**: overlay-style across macOS/Windows (no gutter reservation). `scrollbar-width: thin` + hover-only WebKit fallback. See [src/index.css](apps/web/src/index.css).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + TypeScript |
| **Styling** | Tailwind CSS + Shadcn/UI + Hanken Grotesk (admin/hub); `landing-page.css` + Inter (public `/`) |
| **Animation** | Framer Motion (landing reveals + hub `FloatingNav` spring) |
| **API** | Hono (Node.js) + Drizzle ORM |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (access + refresh tokens, DB-backed sessions) |
| **Email** | Nodemailer (Resend SMTP or custom SMTP) |
| **State** | TanStack React Query v5 |
| **Integrations** | GitHub API (webhooks + polling), Puppeteer, Playwright |
| **Hosting** | Contabo VPS (Singapore): Nginx + PM2 + Let's Encrypt. Frontend served as static build from `/var/www/advo/dist`, API on `127.0.0.1:6407`. |
| **DNS** | Namecheap |

## Quick Start

```bash
cd advo
cp apps/api/.env.example apps/api/.env   # Edit with your DB credentials
npm install                              # Installs both workspaces
npm --workspace apps/api run db:push     # Create tables
npm --workspace apps/api run db:seed     # Seed defaults
npm --workspace apps/api run dev         # API :6407
npm --workspace apps/web run dev         # Vite :6447, proxies /api → :6407
```

Default login: `admin@advo.ph` / `changeme`

## Environment Variables

### Frontend (`apps/web/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | API base URL (`http://localhost:6407` or `https://api.advo.ph`). In Vite dev, requests go to `/api` and the proxy forwards to :6407. |

### API (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | 32+ char random string |
| `JWT_REFRESH_SECRET` | Yes | 32+ char random string |
| `RESEND_API_KEY` | No | Resend API key for email |
| `GITHUB_TOKEN` | No | GitHub PAT (server-side) |
| `GITHUB_WEBHOOK_SECRET` | No | Webhook signature verification |
| `PRAUD_IMPORT_SECRET` | No | Shared secret for `POST /api/meeting/import/praud` |
| `ADVO_INBOX_PROJECT_ID` | No | Fallback project for praud imports (else auto Inbox) |
| `PLAUD_TOKEN` | No | Plaud consumer JWT for file-id import, folder watch, and Ask Plaud. Share-URL import works without it. |
| `PLAUD_AUTH_FILE` | No | Alternate path to `{ token }` JSON (default `~/.piper/plaud-auth.json`). |
| `PLAUD_API_HOST` | No | Plaud API host (default `https://api-apse1.plaud.ai`). |
| `PLAUD_POLL_SECOND` | No | Seconds between ADVO-folder probes (default 60). `0` disables. |

## Deployment

Host: `advo`. Remote: `/opt/advo`. PM2: `advo-api` (`/opt/advo/apps/api`). Web: `/var/www/advo/dist`.

```bash
./deploy.sh                 # API + frontend (default SSH alias: advo)
./deploy.sh --api-only
./deploy.sh --frontend-only

# Manual DB backup (automated nightly at 3am via cron):
ssh advo "sudo -u postgres pg_dump -Fc advo > /var/backups/advo/advo_$(date +%Y%m%d).dump"
```

> `advo` is the SSH alias for this VPS (`62.146.237.12`). Add `Host advo` to `~/.ssh/config` — see [docs/SETUP.md](./docs/SETUP.md).

## Project Structure

```
advo/                          # Monorepo root (npm workspaces)
├── deploy.sh                  # VPS deploy (host advo; --api-only / --frontend-only)
├── apps/
│   ├── web/                   # Frontend (React/Vite)
│   │   ├── src/
│   │   │   ├── components/{admin,hub,landing,ui}/
│   │   │   ├── pages/         # Index, Login, Hub, Admin, Start, Team
│   │   │   ├── hooks/         # React Query data hooks (one per resource)
│   │   │   ├── lib/           # api.ts, github.ts, notifications.ts
│   │   │   └── test/          # 68 integration tests
│   │   └── public/team/       # Optimized team photos
│   └── api/                   # Backend (Hono/Node)
│       ├── src/
│       │   ├── db/            # schema.ts, connection.ts, seed.ts (Drizzle)
│       │   ├── middleware/    # auth, rbac, requestId
│       │   ├── routes/        # 13 route files (37 endpoints)
│       │   ├── services/      # auth, email
│       │   ├── vendor/        # easydiv-detector.js (component scanner)
│       │   └── utils/         # env, logger
│       ├── deploy.sh          # Forwards to root deploy.sh --api-only
│       ├── ecosystem.config.cjs  # PM2 config
│       ├── nginx.conf         # Nginx reverse proxy config
│       └── backup.sh          # Daily DB backup script
├── docs/                      # SCHEMA, FEATURES, SETUP — shared docs
├── scripts/                   # test-local.sh, combine-media.sh
└── package.json               # Workspace root
```

## Data Architecture

**One hook per resource, all using TanStack React Query v5.** Components are pure UI — no `useState` for server data, no manual `fetch` + `refetch` plumbing. Each admin CRUD hook returns the canonical shape:

```ts
const { items, isLoading, createItem, updateItem, deleteItem, isSaving } = useAdminFoo();
```

Shared cache means the projects list shows up cached when navigating between admin sections. Optimistic updates with rollback on error (drag-reorder, delete, status toggle).

**Cross-stack field naming convention** (strict — see [.agents/workflows/advo-standard.md](.agents/workflows/advo-standard.md)):

| Layer | Convention |
|-------|-----------|
| Postgres columns | `snake_case` |
| Drizzle JS schema | `camelCase` mapped to snake_case columns |
| API I/O (Zod-validated) | `camelCase` — **snake_case fields are silently dropped** |
| Frontend interfaces & state | `snake_case` (matches DB shape) |
| Mapping layer | Inside each hook (`mapX(camelCase) → snake_case` on read; `toApiPayload(snake_case) → camelCase` on write) |

## Tests

68 integration tests across two files (`src/test/api-wiring.test.ts` + `src/test/e2e-flow.test.ts`) hit the live API. Two ways to run:

```bash
npm run test:local      # auto-boots advo-api on :6407, runs full suite, cleans up — 68/68
npm run test            # runs vitest against whatever VITE_API_URL points at
```

The local script (`scripts/test-local.sh`) reuses an existing API on `:6407` if you already have one running.

## CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push to `main` and every PR:

| Job | Steps | Time |
|-----|-------|------|
| **Verify** | `npm ci` → `tsc --noEmit` → `eslint` → `vite build` | ~32s |
| **Audit** | `npm audit --audit-level=high` (non-blocking) | ~7s |

Concurrency cancels superseded runs per branch — no wasted minutes when you push twice in a row. Integration tests are not in CI (would need a Postgres + API service step) — run them locally before merging.

## Documentation

- [VISION.md](./docs/VISION.md) — Strategy: PH-first vertical software + hardware
- [MOODBOARD.md](./docs/MOODBOARD.md) — Brand / startup-site direction + [visual board](./docs/moodboard/index.html)
- [SCOPE-PWA-MEETING.md](./docs/SCOPE-PWA-MEETING.md) — Original PWA + meeting scope (PWA Tier 1 + meeting CRUD/import shipped; attendee/action-item tables still open)
- [SETUP.md](./docs/SETUP.md) — Development setup, deployment, VPS transfer guide
- [SCHEMA.md](./docs/SCHEMA.md) — Full database schema
- [FEATURES.md](./docs/FEATURES.md) — Feature documentation, auth system, hooks reference
- [ROADMAP.md](./docs/ROADMAP.md) — Product roadmap
- [HANDOFF.md](./docs/HANDOFF.md) — Session handoff / open items

## License

Private — ADVO.ph
