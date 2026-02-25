# Development & Deployment Setup

## Prerequisites

- Node.js 18+
- npm
- Supabase CLI (`npm install -g supabase`)

## Local Development

```bash
cd /path/to/Antigravity/advo
npm install
npm run dev            # Starts on port 6900
```

Open http://localhost:6900

## Environment

The Supabase credentials are configured in `src/integrations/supabase/client.ts` (hardcoded for the ADVO project). No `.env` setup needed for the base app.

Optional env vars for integrations:

```env
VITE_GITHUB_TOKEN=ghp_...          # GitHub PAT for commit history
VITE_VERCEL_TOKEN=...              # Vercel deploy status
VITE_CLOUDFLARE_TOKEN=...         # Cloudflare deploy status
VITE_CLOUDFLARE_ACCOUNT_ID=...    # Cloudflare account
```

## Database Migrations

```bash
# Push pending migrations to remote Supabase
npx supabase db push -p '<db_password>'

# Check migration status
npx supabase migration list
```

Migrations are in `supabase/migrations/` and numbered chronologically.

## Edge Functions

```bash
# Deploy the notification function
npx supabase functions deploy send-notification

# Set secrets
npx supabase secrets set RESEND_API_KEY=re_xxxxx
```

## Deploy to Production

The project auto-deploys to Vercel when you push to `main`:

```bash
git add -A
git commit -m "feat: description"
git push origin main
```

**Manual deploy** (if needed):

```bash
npx vercel --prod --yes
```

## Infrastructure

| Service                | URL                                                                         |
| ---------------------- | --------------------------------------------------------------------------- |
| **Production**         | [advo.ph](https://advo.ph)                                                  |
| **Vercel Dashboard**   | [vercel.com](https://vercel.com/gelos-projects-0b0c312c/advo)               |
| **Supabase Dashboard** | [supabase.com](https://supabase.com/dashboard/project/cxtreuwqrnrfpwvunjqm) |
| **GitHub Repo**        | [github.com/advo-ph/advo](https://github.com/advo-ph/advo)                  |
| **DNS**                | Cloudflare                                                                  |

## Troubleshooting

### Port 6900 in use

```bash
lsof -ti :6900 | xargs kill -9
```

### Migration errors

```bash
# Check remote migration status
npx supabase migration list
# Repair if needed
npx supabase migration repair --status applied <version>
```

### Edge function logs

```bash
npx supabase functions logs send-notification
```
