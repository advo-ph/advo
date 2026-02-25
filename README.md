# ADVO - Client Project Portal

A transparent client portal for tracking project progress, powered by real-time GitHub integration.

## Features

### Client Hub

- **Smart Dashboard** - Project overview with status, progress, and billing
- **Engineering Feed** - Live GitHub commits merged with admin updates
- **Branch Selector** - View commits from different Git branches
- **Cloudflare Status** - Live deployment status badge
- **Invoicing** - Track payments and project value

### Admin Panel (`/admin`)

- **Project Management** - Full CRUD for projects
- **Post Updates** - Manual progress updates visible to clients
- **Leads Dashboard** - View client inquiries from `/start` form
- **Stats Overview** - Projects, clients, revenue metrics

### Client Onboarding (`/start`)

- Self-service project inquiry form
- Captures name, email, company, budget, description
- Creates lead records for admin review

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS + Shadcn/UI
- **Animation**: Framer Motion
- **Backend**: Supabase (PostgreSQL + Auth)
- **Integrations**: GitHub API, Cloudflare Pages API
- **Deployment**: Vercel

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# Optional: VITE_GITHUB_TOKEN, VITE_CLOUDFLARE_TOKEN, VITE_CLOUDFLARE_ACCOUNT_ID

# Start dev server (port 6900)
npm run dev
```

## Environment Variables

| Variable                 | Required | Description                    |
| ------------------------ | -------- | ------------------------------ |
| `VITE_SUPABASE_URL`      | Yes      | Supabase project URL           |
| `VITE_SUPABASE_ANON_KEY` | Yes      | Supabase anon key              |
| `VITE_GITHUB_TOKEN`      | No       | GitHub PAT for commit history  |
| `VITE_VERCEL_TOKEN`      | No       | Vercel token for deploy status |

## Documentation

See [docs/](./docs/) for detailed setup guides:

- [SETUP.md](./docs/SETUP.md) - Local development with OrbStack
- [SCHEMA.md](./docs/SCHEMA.md) - Database schema reference
- [FEATURES.md](./docs/FEATURES.md) - Feature documentation

## Project Structure

```
advo/
├── src/
│   ├── components/
│   │   ├── landing/    # Landing page
│   │   ├── hub/        # Client dashboard
│   │   └── ui/         # Shadcn components
│   ├── pages/
│   │   ├── Index.tsx   # Landing
│   │   ├── Login.tsx   # Magic link auth
│   │   ├── Hub.tsx     # Client portal
│   │   ├── Admin.tsx   # Admin panel
│   │   └── Start.tsx   # Client onboarding
│   ├── hooks/          # useAuth, useGitHub
│   ├── lib/            # github.ts, cloudflare.ts
│   └── integrations/   # Supabase client
├── supabase/
│   └── migrations/     # Database migrations
└── docs/               # Documentation
```

## License

Private - ADVO.ph
