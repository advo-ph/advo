# Features Documentation

## Client Portal (`/hub`)

### Engineering Feed

Live GitHub commits merged with admin-posted progress updates. Supports branch switching.

**Files**: `ProjectDashboard.tsx`, `useOrgProjects.ts`, `lib/github.ts`

### Invoice Tracker

View issued invoices with amount, status (unpaid/paid/overdue), due dates. API enforces clients only see their own project invoices.

**Files**: `ProjectDashboard.tsx`, `useClientData.ts`

### Contract Section

"View Contract" button linking to contract PDF, or "Contract pending" if not yet set.

**Files**: `ProjectDashboard.tsx` → reads `project.contract_url`

### Progress Photos

Grid of admin-uploaded progress photos with captions and upload dates.

**Files**: `ProjectDashboard.tsx` → reads `project_asset` via API

### Team Contacts

Displays assigned team members with avatar, name, role, email, and LinkedIn link.

**Files**: `ProjectDashboard.tsx` → reads `project_access` → `team_member` via API

### Notification Bell

Unread count badge on bell icon. Dropdown shows last 10 notifications with mark-as-read.

**Files**: `Hub.tsx`, `useNotifications.ts` (`useClientNotifications`)

---

## Admin Panel (`/admin`)

### Dashboard

KPI cards: total projects, active clients, total revenue, active leads.

**Files**: `AdminDashboard.tsx`, `useAdminData.ts`

### Projects

Full CRUD. Form includes: client, title, description, GitHub repo, preview URL, contract URL, status, value/paid, tech stack. Edit mode shows asset upload. Auto-notifies client on project status change.

**Files**: `AdminProjects.tsx`, `useOrgProjects.ts`, `db.ts`

### Clients

Client management with company name, contact email, GitHub org, brand color. **Invite button** on each card — creates auth account and sends welcome email. **Search bar** filters by company name or email.

**Files**: `AdminClients.tsx`, `useAdminData.ts`

### Team

Team member profiles with name, role, email, bio, social links (LinkedIn, GitHub). Avatar upload (max 5MB). **Drag-to-reorder** — order persists via `team_order` site config key. Applied on landing page + team page.

**Files**: `AdminTeam.tsx`

### Deliverables (Schedule)

List of deliverables per project with status badges, priority, due dates, assignee.

**Files**: `AdminSchedule.tsx`

### Finance

Invoice management with create/edit/delete. Status toggle (unpaid → paid → overdue). Auto-triggers email notification on create.

**Files**: `AdminFinance.tsx`, `useInvoices.ts`

### Notifications

Compose notifications to single client or broadcast to all. Auto-notification on project status change.

**Files**: `AdminNotifications.tsx`, `useNotifications.ts`

### Content Studio

CMS for landing page sections. Toggle visibility (public/client portal). **Form-based editing** for 11 sections: hero, services, pricing, testimonials, contact, client dashboard, FAQ, process steps, why digital, team heading, portfolio heading.

**Files**: `AdminContentStudio.tsx`, `useSiteContent.ts`

### Portfolio

Manage public portfolio projects. Multi-image upload. Toggle featured. Full CRUD with case study.

**Files**: `AdminPortfolio.tsx`

### Leads

Pipeline view of inquiries. Status: new → contacted → qualified → proposal → won/lost.
- **Search + filter** by text and status
- **Bulk actions** — select multiple leads, bulk set status or assign
- **Convert to Client** button — creates user account + client + project, sends welcome email
- **Notes** per lead with auto-save on blur

**Files**: `AdminLeads.tsx`, `useLeads.ts`

### Settings

- **Domain & Branding**: agency name, domain URL, accent color, logo
- **Social Links Editor**: add/edit/remove, saved to `site_config.social_links`, displayed in footer
- **Security**: Change password dialog
- **Admin Users**: manage admin email list
- **Integrations**: API + Vercel connection status

**Files**: `AdminSettings.tsx`

### Brand Scraper

Paste any URL → extracts branding intelligence via stealth Puppeteer:
- Colors (hex, frequency, CSS variables, theme color)
- Fonts (Google Fonts, CSS declarations)
- Logos & favicons (img, SVG inline, apple-touch-icon)
- Tech stack (React, Next.js, WordPress, Tailwind, Stripe, analytics, etc.)
- Features detected (search, auth, dark mode, lazy loading, chat, forms, etc.)
- Page structure (heading hierarchy, sections, CTAs, buttons, inputs)
- Navigation links + social media profiles
- All images with previews
- Auto-saves to DB, load past scrapes from history

**Files**: `AdminBrandScraper.tsx`, `advo-api/src/routes/scrape.routes.ts`

### Facebook Scraper

Paste a Facebook page URL → extracts company data via authenticated Playwright:
- Company info (name, category, followers, likes)
- Contact details (website, phone, email, social links, address)
- **All posts** (100+) with full text, engagement metrics, and images per post
- Photos gallery
- Uses blead's saved Facebook session for authenticated access
- SSR `<script>` tag parsing + DOM fallback + infinite scroll
- Auto-saves to DB, load past scrapes from history

**Files**: `AdminFacebookScraper.tsx`, `advo-api/src/routes/fb-scrape.routes.ts`, `advo-api/src/routes/scrape.routes.ts`

---

## Email Notifications

Handled by the ADVO API email service (`advo-api/src/services/email.service.ts`).

Uses Nodemailer with either Resend SMTP or custom SMTP transport.

**Templates**: Magic link, notification, welcome, invoice

**Auto-Triggers**:

| Event | Type |
|-------|------|
| Progress update posted | `progress_update` |
| Invoice created | `invoice_issued` |
| Deliverable completed | `deliverable_completed` |
| Project status changed | `project_status_change` |

---

## Auth System

JWT-based authentication via ADVO API.

- **Access token**: 15 min expiry, HS256 signed
- **Refresh token**: 30-day expiry, DB-backed (`session` table), one-time use with rotation
- **Magic link**: Token emailed, 15 min expiry, one-time use
- **Password change**: Authenticated endpoint, bcrypt verification
- **Roles**: `admin`, `team`, `client` — enforced via RBAC middleware

**Files**: `useAuth.tsx`, `lib/api.ts`, `advo-api/src/services/auth.service.ts`

---

## Scrape History

Both brand and Facebook scrapes auto-save to `scrape_result` table. Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scrape/save` | Save scrape result |
| GET | `/api/scrape/history` | List saved scrapes (optional `?type=brand\|facebook`) |
| GET | `/api/scrape/history/:id` | Get single saved scrape with full data |
| DELETE | `/api/scrape/history/:id` | Delete a saved scrape |

---

## Hooks Reference

| Hook | Purpose |
|------|---------|
| `useAuth` | JWT auth state, login, magic link, password change, sign out |
| `useAdminData` | Fetch admin dashboard data (projects, clients, leads, stats) |
| `useOrgProjects` | Fetch projects with GitHub enrichment (commits, PRs, tech stack) |
| `useClientData` | Client-side: projects, deliverables, invoices, assets, contacts |
| `useInvoices` | Invoice CRUD with optimistic updates |
| `useNotifications` | Admin: fetch all + send/broadcast. Client: fetch + mark-read |
| `useLeads` | Lead management with status updates, assignment, bulk actions, conversion |
| `useSiteContent` | CMS sections: toggle visibility, update content |
| `useRoles` | Permission role from JWT token |
| `useGitHub` | GitHub commits and branches (via `lib/github.ts`) |
