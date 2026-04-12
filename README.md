# ADVO — Agency Platform

Landing site, client portal, and admin CMS for ADVO — a Philippine software agency. Dark minimal design, self-hosted stack.

**Live**: [advo.ph](https://advo.ph) · **API**: [api.advo.ph](https://api.advo.ph/api/health)

## Features

### Public Site (`/`)

- **Hero** — Full-bleed team photo with stagger-animated overlay text + stats row
- **Why Go Digital** — Benefits grid (numeral `01`)
- **Our Process** — Step-by-step methodology (numeral `02`)
- **TechTicker** — Scrolling brand logos from Simple Icons CDN
- **Services** — Core offerings (numeral `03`)
- **Portfolio** — Recent work grid (numeral `04`)
- **FAQ** — Centered accordion (numeral `05`)
- **ContactCTA** — Full-bleed orange ending with dual CTAs
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
- Button hover micro-transitions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + TypeScript |
| **Styling** | Tailwind CSS + Shadcn/UI + Geist font |
| **Animation** | Framer Motion (spring physics) |
| **API** | Hono (Node.js) + Drizzle ORM |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (access + refresh tokens, DB-backed sessions) |
| **Email** | Nodemailer (Resend SMTP or custom SMTP) |
| **State** | TanStack React Query v5 |
| **Integrations** | GitHub API (webhooks + polling), Simple Icons CDN, Puppeteer, Playwright |
| **Frontend Hosting** | Vercel (auto-deploy from `main`) |
| **API Hosting** | Contabo VPS (PM2 + Nginx + Let's Encrypt) |
| **DNS** | Namecheap |

## Quick Start

### 1. API

```bash
cd advo-api
cp .env.example .env     # Edit with your DB credentials
npm install
npm run db:push           # Create tables
npm run db:seed           # Seed defaults
npm run dev               # Starts on port 3000
```

### 2. Frontend

```bash
cd advo
npm install
npm run dev               # Starts on port 6400
```

Default login: `admin@advo.ph` / `changeme`

## Environment Variables

### Frontend (`advo/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | API base URL (`http://localhost:3000` or `https://api.advo.ph`) |
| `VITE_GITHUB_TOKEN` | No | GitHub PAT for commit history |

### API (`advo-api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | 32+ char random string |
| `JWT_REFRESH_SECRET` | Yes | 32+ char random string |
| `RESEND_API_KEY` | No | Resend API key for email |
| `GITHUB_TOKEN` | No | GitHub PAT (server-side) |
| `GITHUB_WEBHOOK_SECRET` | No | Webhook signature verification |

## Deployment

```bash
# Frontend (auto-deploys on push, or manual):
cd advo && npx vercel --prod

# API:
cd advo-api && ./deploy.sh root@217.216.72.28

# Database backup:
ssh root@217.216.72.28 "pg_dump -Fc advo > /var/backups/advo/advo_$(date +%Y%m%d).dump"
```

## Project Structure

```
advo/                          # Frontend (React/Vite)
├── src/
│   ├── components/
│   │   ├── admin/             # Admin panel components
│   │   ├── hub/               # Client dashboard components
│   │   ├── landing/           # Landing page sections
│   │   └── ui/                # Shadcn components
│   ├── pages/                 # Index, Login, Hub, Admin, Start, Team
│   ├── hooks/                 # Auth, data fetching, mutations
│   ├── lib/                   # api.ts, db.ts, github.ts, notifications.ts
│   └── test/                  # API wiring + E2E tests (69 tests)
├── public/team/               # Optimized team photos
└── docs/                      # SCHEMA, FEATURES, SETUP

advo-api/                      # Backend (Hono/Node)
├── src/
│   ├── db/                    # schema.ts, connection.ts, seed.ts
│   ├── middleware/            # auth, rbac, requestId
│   ├── routes/                # 13 route files (37 endpoints)
│   ├── services/              # auth, email
│   └── utils/                 # env, logger
├── deploy.sh                  # VPS deployment script
├── ecosystem.config.cjs       # PM2 config
├── nginx.conf                 # Nginx reverse proxy config
└── backup.sh                  # Daily DB backup script
```

## Tests

```bash
cd advo && npx vitest run src/test/    # 69 tests (64 pass, 5 rate-limited)
```

## Documentation

- [SETUP.md](./docs/SETUP.md) — Development setup, deployment, VPS transfer guide
- [SCHEMA.md](./docs/SCHEMA.md) — Full database schema (18 tables)
- [FEATURES.md](./docs/FEATURES.md) — Feature documentation, auth system, hooks reference

## License

Private — ADVO.ph
