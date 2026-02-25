# Features Documentation

## Client Portal (`/hub`)

### Engineering Feed

Live GitHub commits merged with admin-posted progress updates. Supports branch switching.

**Files**: `ProjectDashboard.tsx`, `useGitHub.ts`, `lib/github.ts`

### Invoice Tracker

View issued invoices with amount, status (unpaid/paid/overdue), due dates. RLS ensures clients only see their own.

**Files**: `ProjectDashboard.tsx`, `useClientData.ts`

### Contract Section

"View Contract" button linking to contract PDF, or "Contract pending" if not yet set.

**Files**: `ProjectDashboard.tsx` → reads `project.contract_url`

### Progress Photos

Grid of admin-uploaded progress photos with captions and upload dates. Clickable to view full image.

**Files**: `ProjectDashboard.tsx` → reads `project_asset` table (filtered by `progress_photo` type)

### Team Contacts

Displays assigned team members with avatar, name, role, email, and LinkedIn link.

**Files**: `ProjectDashboard.tsx` → reads `project_access` → `team_member` join

### Notification Bell

Unread count badge on bell icon. Dropdown shows last 10 notifications with mark-as-read.

**Files**: `Hub.tsx`, `useNotifications.ts` (`useClientNotifications`)

---

## Admin Panel (`/admin`)

### Dashboard

KPI cards: total projects, active clients, total revenue, active leads.

**Files**: `AdminDashboard.tsx`, `useAdminData.ts`

### Projects

Full CRUD. Form includes: client, title, description, GitHub repo, preview URL, **contract URL**, status, value/paid, tech stack. Edit mode shows **asset upload** (URL + caption + type selector).

**Files**: `AdminProjects.tsx`, `useOrgProjects.ts`, `db.ts`

### Clients

Client management with company name, contact email, GitHub org, brand color.

**Files**: `AdminClients.tsx`, `useAdminData.ts`

### Team

Team member profiles with name, role, email, avatar, bio, LinkedIn, permission role toggling.

**Files**: `AdminTeam.tsx`, `useAdminData.ts`

### Deliverables (Schedule)

List of deliverables per project with status badges, priority, due dates, assignee.

**Files**: `AdminSchedule.tsx`, `useOrgProjects.ts`

### Finance

Invoice management with create/edit/delete. Status toggle (unpaid → paid → overdue). Auto-triggers email notification on create.

**Files**: `AdminFinance.tsx`, `useInvoices.ts`

### Notifications

Compose notifications to single client or all clients. Auto-notification toggles stored in `site_content.client_dashboard`:

- On progress update
- On invoice issued
- On deliverable completed

Sent notifications grouped by client with type badges and time-ago.

**Files**: `AdminNotifications.tsx`, `useNotifications.ts` (`useAdminNotifications`), `useSiteContent.ts`

### Content Studio

CMS for landing page sections. Toggle visibility (public/client portal). Edit JSONB content.

**Files**: `AdminContentStudio.tsx`, `useSiteContent.ts`

### Portfolio

Manage public portfolio projects. Drag to reorder, toggle featured, full CRUD.

**Files**: `AdminPortfolio.tsx`, `db.ts`

### Leads

Pipeline view of inquiries from `/start`. Status tracking: new → contacted → qualified → proposal → won/lost.

**Files**: `AdminLeads.tsx`, `useLeads.ts`

### Settings

System configuration panel.

**Files**: `AdminSettings.tsx`

---

## Email Notifications (Edge Function)

**Function**: `supabase/functions/send-notification/index.ts`

1. Receives `{ client_id, project_id?, title, body, type }`
2. Inserts `notification` row in DB
3. Checks auto-toggle config from `site_content.client_dashboard`
4. If enabled, sends branded ADVO email via Resend API
5. Email from: `ADVO <hello@advo.ph>`

**Auto-Triggers**:

| Event                  | Where                                         | Type              |
| ---------------------- | --------------------------------------------- | ----------------- |
| Progress update posted | `db.ts` → `createProgressUpdate()`            | `progress_update` |
| Invoice created        | `useInvoices.ts` → `createMutation.onSuccess` | `invoice_issued`  |

**Helper**: `lib/notifications.ts` — fire-and-forget `triggerNotification()`

---

## Hooks Reference

| Hook               | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `useAuth`          | Supabase auth state, sign in/out, role detection                |
| `useAdminData`     | Fetch admin dashboard data (projects, clients, team, stats)     |
| `useOrgProjects`   | Fetch projects with deliverables, progress updates              |
| `useClientData`    | Client-side: projects, deliverables, invoices, assets, contacts |
| `useInvoices`      | Invoice CRUD with optimistic updates                            |
| `useNotifications` | Admin: fetch all + send. Client: fetch 10 + mark-read           |
| `useLeads`         | Lead management with status updates                             |
| `useSiteContent`   | CMS sections: toggle visibility, update content                 |
| `useRoles`         | Permission role management                                      |
| `useGitHub`        | GitHub commits and branches                                     |
