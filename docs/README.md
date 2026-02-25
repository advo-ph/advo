# ADVO Development Documentation

Welcome to the ADVO.ph development documentation. This folder contains all the guides and references needed for local development and deployment.

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (port 6900)
npm run dev

# Build for production
npm run build
```

## Documentation Index

| Document                     | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| [SETUP.md](./SETUP.md)       | Local development setup with OrbStack Supabase             |
| [FEATURES.md](./FEATURES.md) | Feature documentation (Progress Updates, Onboarding, etc.) |
| [SCHEMA.md](./SCHEMA.md)     | Database schema reference                                  |

## Project Structure

```
advo/
├── src/
│   ├── components/
│   │   ├── landing/   # Landing page components
│   │   ├── hub/       # Client dashboard (ProjectDashboard, etc.)
│   │   └── ui/        # Shadcn/UI components
│   ├── pages/
│   │   ├── Index.tsx  # Landing page
│   │   ├── Login.tsx  # Magic link auth
│   │   ├── Hub.tsx    # Client portal
│   │   ├── Admin.tsx  # Admin panel
│   │   └── Start.tsx  # Client onboarding form
│   ├── hooks/
│   │   ├── useAuth.ts    # Auth context
│   │   └── useGitHub.ts  # GitHub data hook
│   ├── lib/
│   │   ├── github.ts     # GitHub API service
│   │   └── cloudflare.ts # Cloudflare Pages API service
│   └── integrations/  # Supabase client
├── supabase/
│   └── migrations/    # Database migrations
└── docs/              # This folder
```

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS + Shadcn/UI
- **Animation**: Framer Motion
- **Backend**: Supabase (PostgreSQL + Auth)
- **Integrations**: GitHub API, Vercel API
- **Deployment**: Vercel

## Ports

| Service               | Port  |
| --------------------- | ----- |
| Vite Dev Server       | 6900  |
| Supabase API          | 54321 |
| Supabase Studio       | 54323 |
| Mailpit (local email) | 6901  |
