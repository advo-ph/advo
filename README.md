# ADVO — Agency Platform

Landing site, client portal, and admin CMS for ADVO — a Philippine software agency. Dark minimal design, self-hosted stack.

**Live**: [advo.ph](https://advo.ph) · **API**: [api.advo.ph](https://api.advo.ph/api/health)

## Features

### Public Site (`/`)

- **Hero** — Full-bleed team photo with stagger-animated overlay text + stats row
- **Why Go Digital** — Benefits grid (numeral `01`)
- **Our Process** — Step-by-step methodology (numeral `02`)
- **TechTicker** — Scrolling brand logos from Simple Icons CDN
- **Infrastructure** — Isometric 3D scene (React Three Fiber) showing the Security / Frontend / Backend / Database pipeline with animated circuit traces. Responsive: vertical stack on mobile
- **Services** — Core offerings (numeral `03`)
- **Portfolio** — Recent work grid (numeral `04`)
- **FAQ** — Centered accordion (numeral `05`)
- **ContactCTA** — Animated organic orange blob gradient with grain texture, over the "Ready to digitalize?" CTA
- **Team page** — Editorial portrait cards with image fade into card

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

- Two-column numbered layout (matches `01`–`05` landing rhythm as `06`)
- Form: name, email, company, project type, budget, description
- Perks checklist + direct email + 24h response promise
- Success state personalized with first name

## Design System

All tokens in `src/index.css`, Tailwind config in `tailwind.config.ts`.

| Token | Value | Use |
|-------|-------|-----|
| `--background` | `hsl(0 0% 4%)` — `#0A0A0A` | Page background |
| `--foreground` | `hsl(0 0% 98%)` — `#FAFAFA` | Body text |
| `--card` | `hsl(0 0% 6%)` — `#0F0F0F` | Raised surfaces |
| `--secondary` | `hsl(0 0% 10%)` — `#1A1A1A` | Subtle fills |
| `--accent` | `hsl(19 77% 56%)` — `#E67A3A` | CTAs, highlights (warm orange) |
| `--border` | `hsl(0 0% 14%)` — `#242424` | Hairline dividers |
| `--radius` | `0.625rem` (10px) | Default rounding |

**Typography**: Geist (sans) + Geist Mono — both loaded from Google Fonts. Headings use `-0.02em` letter-spacing for tight display. Mono used for eyebrow labels, micro-info, and numerals (`01`, `02`…).

**Primitives** (`src/components/ui/section.tsx`):
- `<Section>` — standardized `py-24 px-6`, `max-w-6xl` container, optional `divided` (top border) and `narrow` (for centered text sections)
- `<SectionHeader>` — eyebrow + huge mono numeral + title + optional subtitle

**Animation philosophy**: zero scroll animations. Only kinetic surfaces are:
- `FloatingNav` pill morph using Framer Motion spring `{ stiffness: 380, damping: 38 }` + liquid glass backdrop filter
- Hero content stagger on page load
- `TechTicker` CSS keyframe marquee
- `InfrastructureDiagram` — animated circuit-trace pulses (dashOffset) + orthographic iso camera
- `ContactCTA` — 4 ambient blobs drifting on 22–28s cycles with SVG grain overlay
- Button hover micro-transitions

**Scrollbars**: overlay-style across macOS/Windows (no gutter reservation). `scrollbar-width: thin` + hover-only WebKit fallback. `#root` is the scroll container (body is fixed-height) — see [src/index.css](src/index.css).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + TypeScript |
| **Styling** | Tailwind CSS + Shadcn/UI + Geist font |
| **Animation** | Framer Motion (spring physics) + React Three Fiber (r3f) for the Infrastructure scene |
| **3D** | `three` + `@react-three/fiber` v8 + `@react-three/drei` v9 (React-18-compatible pins) |
| **API** | Hono (Node.js) + Drizzle ORM |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (access + refresh tokens, DB-backed sessions) |
| **Email** | Nodemailer (Resend SMTP or custom SMTP) |
| **State** | TanStack React Query v5 |
| **Integrations** | GitHub API (webhooks + polling), Simple Icons CDN, Puppeteer, Playwright |
| **Hosting** | Contabo VPS (Singapore): Nginx + PM2 + Let's Encrypt. Frontend served as static build from `/var/www/advo/dist`, API on `127.0.0.1:6407`. |
| **DNS** | Namecheap |

## Quick Start

```bash
cd advo
cp apps/api/.env.example apps/api/.env   # Edit with your DB credentials
npm install                              # Installs both workspaces
npm --workspace apps/api run db:push     # Create tables
npm --workspace apps/api run db:seed     # Seed defaults
npm run dev                              # Starts web (6400) + api (6407) together
```

Default login: `admin@advo.ph` / `changeme`

## Environment Variables

### Frontend (`apps/web/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | API base URL (`http://localhost:6407` or `https://api.advo.ph`) |
| `VITE_GITHUB_TOKEN` | No | GitHub PAT for commit history |

### API (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | 32+ char random string |
| `JWT_REFRESH_SECRET` | Yes | 32+ char random string |
| `RESEND_API_KEY` | No | Resend API key for email |
| `GITHUB_TOKEN` | No | GitHub PAT (server-side) |
| `GITHUB_WEBHOOK_SECRET` | No | Webhook signature verification |

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
- [SCOPE-PWA-MEETING.md](./docs/SCOPE-PWA-MEETING.md) — Mobile PWA + meeting record (not built yet)
- [SETUP.md](./docs/SETUP.md) — Development setup, deployment, VPS transfer guide
- [SCHEMA.md](./docs/SCHEMA.md) — Full database schema
- [FEATURES.md](./docs/FEATURES.md) — Feature documentation, auth system, hooks reference
- [ROADMAP.md](./docs/ROADMAP.md) — Product roadmap
- [HANDOFF.md](./docs/HANDOFF.md) — Session handoff / open items

## License

Private — ADVO.ph
