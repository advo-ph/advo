# Features Documentation

## Smart Dashboard Features

### 1. Progress Updates from Admin

Admins can post manual updates that appear alongside GitHub commits in the client's Engineering Feed.

**How it works:**

1. Navigate to `/admin`
2. Click "Post Update" on any project
3. Enter title, body, and optional commit reference
4. Update appears in client's dashboard

**Database:** `progress_update` table

```sql
- update_id (PK)
- project_id (FK)
- update_title
- update_body
- commit_sha_reference
- created_at
```

---

### 2. Client Onboarding Flow

Self-service inquiry form at `/start` for potential clients.

**Form Fields:**

- Name, Email (required)
- Company (optional)
- Project Type (dropdown)
- Budget Range (dropdown)
- Project Description (required)

**Implementation:**

- Leads stored in `localStorage` (key: `advo_leads`)
- Admin panel shows Leads tab with submissions
- Future: Edge function to create client records

---

### 3. Cloudflare Pages Deployment Status

Shows live deployment status badge next to the Live Preview button.

**States:**

- 🟢 Ready - Deployment successful
- 🟡 Building - Deployment in progress
- 🔴 Error - Deployment failed

**Setup:**

```bash
# Add to .env
VITE_CLOUDFLARE_TOKEN=your_cloudflare_api_token
VITE_CLOUDFLARE_ACCOUNT_ID=your_account_id
```

**Implementation:**

- `src/lib/cloudflare.ts` - API service
- Fetches from `api.cloudflare.com/client/v4`
- Extracts project name from \*.pages.dev URLs

---

### 4. Branch Support for GitHub

View commits from different branches in the Engineering Feed.

**Features:**

- Branch selector dropdown
- Defaults to `main`
- Shows protected branch indicator 🔒
- Commits refresh when branch changes

**Implementation:**

- `src/lib/github.ts` - `getBranches()`, updated `getCommits()`
- `src/hooks/useGitHub.ts` - Branch state management
- `src/components/hub/ProjectDashboard.tsx` - Branch selector UI

---

## Admin Panel Features

### Projects Tab

- View all projects with status, client, and value
- Create/Edit projects with full form
- Delete projects with confirmation
- Post updates to any project

### Leads Tab

- View inquiries from `/start` form
- Shows name, email, company, project type, budget
- Time since submission
- Clear/archive leads

### Stats Dashboard

- Total projects count
- Total clients count
- Active leads count
- Total revenue (from paid invoices)

---

## File Reference

| Feature           | Files                                                   |
| ----------------- | ------------------------------------------------------- |
| Progress Updates  | `Admin.tsx`, `progress_update` table                    |
| Client Onboarding | `Start.tsx`, `ContactCTA.tsx`                           |
| Cloudflare Status | `lib/cloudflare.ts`, `ProjectDashboard.tsx`             |
| Branch Support    | `lib/github.ts`, `useGitHub.ts`, `ProjectDashboard.tsx` |
