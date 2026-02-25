# Local Development Setup

## Prerequisites

- Node.js 18+
- OrbStack (for local Supabase)
- npm or bun

## 1. Clone and Install

```bash
cd /path/to/Antigravity/advo
npm install
```

## 2. Start Local Supabase (OrbStack)

If you haven't already set up a local Supabase instance:

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase (runs on port 54321)
supabase start
```

This will output your local credentials:

```
API URL: http://localhost:54321
anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
```

## 3. Configure Environment

Update `.env` with your local Supabase credentials:

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<your-local-anon-key>
```

## 4. Apply Migrations

```bash
# Apply the ADVO schema migrations
supabase db push
```

Or manually via Studio at `http://localhost:54323`:

1. Go to SQL Editor
2. Run the contents of `supabase/migrations/*.sql`

## 5. Start Development Server

```bash
npm run dev
```

Open http://localhost:6900 in your browser.

## Troubleshooting

### Port 6900 Already in Use

```bash
# Find and kill process on port 6900
lsof -ti :6900 | xargs kill -9
```

### Supabase Connection Issues

1. Verify OrbStack Supabase is running: `supabase status`
2. Check `.env` has correct URL and key
3. Ensure no firewall blocking localhost:54321
