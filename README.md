# ADVO — Client Project Portal

A transparent client portal for tracking project progress, powered by real-time GitHub integration and Supabase.

**Live**: [advo.ph](https://advo.ph) · **Repo**: `advo-ph/advo`

## Features

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

- **Dashboard** — KPI cards (projects, clients, revenue, leads)
- **Projects** — Full CRUD, contract URL, asset upload (photos/docs)
- **Clients** — Client management with contact info
- **Team** — Team member profiles (bio, LinkedIn, permissions)
- **Deliverables** — Kanban-style schedule with status tracking
- **Availability** — Team capacity management
- **Social** — Social media post management
- **Content Studio** — CMS for landing page sections
- **Portfolio** — Public portfolio management
- **Finance** — Invoice CRUD with status toggles
- **Notifications** — Compose + send to clients, auto-notification toggles
- **Leads** — Inquiry pipeline with status tracking
- **Settings** — System configuration

### Client Onboarding (`/start`)

- Self-service project inquiry form
- Captures name, email, company, budget, description
- Creates lead records in database for admin review

### Email Notifications

- ADVO-branded email delivery via Resend API
- Auto-triggers on: progress update posted, invoice created
- Configurable toggles per notification type
- Supabase Edge Function (`send-notification`)

## Tech Stack

| Layer            | Technology                                    |
| ---------------- | --------------------------------------------- |
| **Frontend**     | React 18 + Vite + TypeScript                  |
| **Styling**      | Tailwind CSS + Shadcn/UI                      |
| **Animation**    | Framer Motion                                 |
| **Backend**      | Supabase (PostgreSQL + Auth + Edge Functions) |
| **Email**        | Resend API                                    |
| **State**        | TanStack React Query v5                       |
| **Integrations** | GitHub API, Cloudflare Pages API              |
| **Hosting**      | Vercel (auto-deploy from `main`)              |
| **DNS**          | Cloudflare                                    |

## Quick Start

```bash
npm install
npm run dev          # Starts on port 6900
```

## Environment Variables

| Variable                 | Required | Description                    |
| ------------------------ | -------- | ------------------------------ |
| `VITE_SUPABASE_URL`      | Yes      | Supabase project URL           |
| `VITE_SUPABASE_ANON_KEY` | Yes      | Supabase anonymous key         |
| `VITE_GITHUB_TOKEN`      | No       | GitHub PAT for commit history  |
| `VITE_VERCEL_TOKEN`      | No       | Vercel token for deploy status |

**Supabase Secrets** (set via `npx supabase secrets set`):

| Secret           | Description                            |
| ---------------- | -------------------------------------- |
| `RESEND_API_KEY` | Resend API key for email notifications |

## Deployment

```bash
git push origin main       # Auto-deploys to Vercel → advo.ph
npx supabase db push       # Push new migrations
npx supabase functions deploy send-notification  # Deploy edge function
```

## Project Structure

```
advo/
├── src/
│   ├── components/
│   │   ├── admin/       # 14 admin panel components
│   │   ├── hub/         # Client dashboard components
│   │   ├── landing/     # Landing page sections
│   │   └── ui/          # Shadcn components
│   ├── pages/           # Index, Login, Hub, Admin, Start, Team
│   ├── hooks/           # 12 custom hooks (auth, data, mutations)
│   ├── lib/             # db.ts, github.ts, cloudflare.ts, notifications.ts
│   └── integrations/    # Supabase client + types
├── supabase/
│   ├── migrations/      # 16 SQL migrations
│   └── functions/       # Edge functions (send-notification)
└── docs/                # SCHEMA, FEATURES, SETUP
```

## Documentation

- [SCHEMA.md](./docs/SCHEMA.md) — Full database schema reference
- [FEATURES.md](./docs/FEATURES.md) — Feature documentation
- [SETUP.md](./docs/SETUP.md) — Development setup guide

## License

Private — ADVO.ph
