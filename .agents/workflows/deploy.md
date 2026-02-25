---
description: How to deploy ADVO to production
---

## Deploy Steps

// turbo-all

1. Build and verify locally:

```bash
cd /Users/angelonrevelo/Antigravity/advo && npm run build
```

2. Stage, commit, and push:

```bash
cd /Users/angelonrevelo/Antigravity/advo && git add -A && git status
```

3. Commit with descriptive message:

```bash
cd /Users/angelonrevelo/Antigravity/advo && git commit -m "feat: <description>"
```

4. Push to GitHub (auto-deploys to Vercel):

```bash
cd /Users/angelonrevelo/Antigravity/advo && git push origin main
```

5. If there are new database migrations, push them:

```bash
cd /Users/angelonrevelo/Antigravity/advo && npx supabase db push -p '3Hv?%scd_Qz7yP4' --yes
```

6. If the edge function was modified, redeploy:

```bash
cd /Users/angelonrevelo/Antigravity/advo && npx supabase functions deploy send-notification
```

## Verify

- Vercel dashboard: https://vercel.com/gelos-projects-0b0c312c/advo
- Production URL: https://advo.ph
- Supabase: https://supabase.com/dashboard/project/cxtreuwqrnrfpwvunjqm
