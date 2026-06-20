# ADVO Database Schema

Convention: BIGINT IDs, singular table naming, cents for currency, camelCase in API responses.

Schema source of truth: [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts) (Drizzle ORM, post-monorepo restructure).

Convention reference: [.agents/workflows/advo-standard.md](../.agents/workflows/advo-standard.md) and [database-conventions skill](../../.claude/skills/database-conventions/SKILL.md).

Migration log: [`apps/api/migrations/`](../apps/api/migrations/) — raw SQL applied directly to prod; schema.ts kept in sync after.

## Tables

### user

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | BIGSERIAL (PK) | |
| `email` | VARCHAR(255) UNIQUE | |
| `password_hash` | VARCHAR(255) | Nullable (magic-link-only users) |
| `role` | ENUM | `admin`, `team`, `client` |
| `is_active` | BOOLEAN | Default `true` |
| `magic_token` | VARCHAR(255) | One-time magic link token |
| `magic_token_expires_at` | TIMESTAMPTZ | 15 min expiry |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### session

| Column | Type | Description |
|--------|------|-------------|
| `session_id` | BIGSERIAL (PK) | |
| `user_id` | BIGINT (FK) | → `user` |
| `refresh_token` | VARCHAR(255) UNIQUE | One-time use, rotated on refresh |
| `user_agent` | TEXT | |
| `ip_address` | VARCHAR(45) | |
| `expires_at` | TIMESTAMPTZ | 30-day expiry |
| `created_at` | TIMESTAMPTZ | |

### client

| Column | Type | Description |
|--------|------|-------------|
| `client_id` | BIGSERIAL (PK) | |
| `user_id` | BIGINT (FK) | → `user` ON DELETE SET NULL (nullable) |
| `company_name` | VARCHAR(255) | |
| `contact_email` | VARCHAR(255) | |
| `github_org_name` | VARCHAR(100) | |
| `brand_color_hex` | VARCHAR(7) | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### project

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | BIGSERIAL (PK) | |
| `client_id` | BIGINT (FK) | → `client` |
| `title` | VARCHAR(255) | |
| `description` | TEXT | |
| `repository_name` | VARCHAR(100) | GitHub repo name |
| `preview_url` | VARCHAR(500) | Live preview |
| `contract_url` | VARCHAR(500) | Contract PDF |
| `project_status` | ENUM | `discovery`, `architecture`, `development`, `testing`, `shipped` |
| `total_value_cents` | INTEGER | |
| `amount_paid_cents` | INTEGER | |
| `tech_stack` | TEXT[] | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### team_member

| Column | Type | Description |
|--------|------|-------------|
| `team_member_id` | BIGSERIAL (PK) | |
| `user_id` | BIGINT (FK) | → `user` ON DELETE SET NULL (nullable) |
| `name` | VARCHAR(255) | |
| `role` | VARCHAR(100) | Display role/title |
| `email` | VARCHAR(255) | |
| `avatar_url` | VARCHAR(500) | |
| `bio` | TEXT | |
| `linkedin_url` | VARCHAR(500) | |
| `github_url` | VARCHAR(500) | |
| `permission_role` | ENUM | `admin`, `developer`, `designer`, `manager` |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### project_access

| Column | Type | Description |
|--------|------|-------------|
| `project_access_id` | BIGSERIAL (PK) | |
| `team_member_id` | BIGINT (FK) | → `team_member` |
| `project_id` | BIGINT (FK) | → `project` |
| `permission_level` | ENUM | `read`, `write`, `admin` |
| `granted_at` | TIMESTAMPTZ | |

Unique constraint on (`team_member_id`, `project_id`).

### deliverable

| Column | Type | Description |
|--------|------|-------------|
| `deliverable_id` | BIGSERIAL (PK) | |
| `project_id` | BIGINT (FK) | → `project` |
| `assigned_to` | BIGINT (FK) | → `team_member` ON DELETE SET NULL (nullable) |
| `title` | VARCHAR(255) | |
| `description` | TEXT | |
| `priority` | INTEGER | 0-10 |
| `status` | ENUM | `not_started`, `in_progress`, `review`, `completed`, `blocked` |
| `due_date` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### invoice

| Column | Type | Description |
|--------|------|-------------|
| `invoice_id` | BIGSERIAL (PK) | |
| `project_id` | BIGINT (FK) | → `project` |
| `amount_cents` | INTEGER | |
| `label` | VARCHAR(255) | |
| `status` | ENUM | `unpaid`, `paid`, `overdue` |
| `due_date` | TIMESTAMPTZ | |
| `paid_at` | TIMESTAMPTZ | |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### lead

| Column | Type | Description |
|--------|------|-------------|
| `lead_id` | BIGSERIAL (PK) | |
| `name` | VARCHAR(255) | |
| `email` | VARCHAR(255) | |
| `company` | VARCHAR(255) | |
| `project_type` | VARCHAR(100) | |
| `budget` | VARCHAR(100) | |
| `description` | TEXT | |
| `status` | ENUM | `new`, `contacted`, `qualified`, `proposal_sent`, `closed_won`, `closed_lost` |
| `assigned_to` | BIGINT (FK) | → `team_member` ON DELETE SET NULL (nullable) |
| `notes` | TEXT | |
| `submitted_at` | TIMESTAMPTZ | |

### notification

| Column | Type | Description |
|--------|------|-------------|
| `notification_id` | BIGSERIAL (PK) | |
| `client_id` | BIGINT (FK) | → `client` ON DELETE CASCADE |
| `project_id` | BIGINT (FK) | → `project` ON DELETE CASCADE (nullable) |
| `type` | ENUM | `progress_update`, `invoice_issued`, `deliverable_completed`, `project_status_change`, `custom` |
| `title` | VARCHAR(255) | |
| `body` | TEXT | |
| `is_read` | BOOLEAN | |
| `sent_at` | TIMESTAMPTZ | |

### progress_update

| Column | Type | Description |
|--------|------|-------------|
| `progress_update_id` | BIGSERIAL (PK) | |
| `project_id` | BIGINT (FK) | → `project` |
| `update_title` | VARCHAR(255) | |
| `update_body` | TEXT | |
| `commit_sha_reference` | VARCHAR(40) | |
| `created_at` | TIMESTAMPTZ | |

### project_asset

| Column | Type | Description |
|--------|------|-------------|
| `project_asset_id` | BIGSERIAL (PK) | |
| `project_id` | BIGINT (FK) | → `project` |
| `asset_type` | ENUM | `progress_photo`, `completion_photo`, `document` |
| `url` | VARCHAR(500) | |
| `caption` | VARCHAR(255) | |
| `uploaded_at` | TIMESTAMPTZ | |

### site_content

| Column | Type | Description |
|--------|------|-------------|
| `section_id` | VARCHAR(100) (PK) | e.g. `hero`, `services`, `contact` |
| `label` | VARCHAR(255) | |
| `visible_public` | BOOLEAN | |
| `visible_client_portal` | BOOLEAN | |
| `content` | JSONB | Section-specific content |
| `created_at` | TIMESTAMPTZ | Added by migration `001_audit_tier1.sql` |
| `updated_at` | TIMESTAMPTZ | |

### portfolio_project

| Column | Type | Description |
|--------|------|-------------|
| `portfolio_project_id` | BIGSERIAL (PK) | |
| `title` | VARCHAR(255) | |
| `description` | TEXT | |
| `preview_url` | VARCHAR(500) | |
| `image_url` | VARCHAR(500) | |
| `image_urls` | TEXT[] | Multi-image support |
| `tech_stack` | TEXT[] | |
| `slug` | VARCHAR(100) UNIQUE | URL slug |
| `is_featured` | BOOLEAN | |
| `display_order` | INTEGER | |
| `case_study` | JSONB | `{ overview, challenge, solution, results[], github_url }` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### social_post

| Column | Type | Description |
|--------|------|-------------|
| `social_post_id` | BIGSERIAL (PK) | |
| `platform` | VARCHAR(50) | |
| `content` | TEXT | |
| `image_url` | VARCHAR(500) | |
| `scheduled_for` | TIMESTAMPTZ | |
| `is_published` | BOOLEAN | |
| `published_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

### site_config

Key-value config table. Most keys are admin-only via `/api/settings/*`. The allowlisted subset (`social_links`, `brand_name`, `team_order`) is also exposed anonymously via `GET /api/settings/public` for the landing footer + team-order rendering.

| Column | Type | Description |
|--------|------|-------------|
| `key` | VARCHAR(100) (PK) | e.g. `agency_name`, `accent_color`, `social_links`, `team_order` |
| `value` | JSONB | |
| `created_at` | TIMESTAMPTZ | Added by migration `001_audit_tier1.sql` |
| `updated_at` | TIMESTAMPTZ | |

### github_event

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | BIGSERIAL (PK) | |
| `project_id` | BIGINT (FK) | → `project` ON DELETE CASCADE (nullable) |
| `event_type` | VARCHAR(50) | `push`, `pull_request`, `deployment_status` |
| `payload` | JSONB | |
| `repo_name` | VARCHAR(100) | |
| `branch` | VARCHAR(100) | |
| `commit_sha` | VARCHAR(40) | |
| `author` | VARCHAR(100) | |
| `message` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

### activity_log

| Column | Type | Description |
|--------|------|-------------|
| `activity_id` | BIGSERIAL (PK) | |
| `user_id` | BIGINT (FK) | → `user` ON DELETE SET NULL (nullable) |
| `action` | VARCHAR(50) | `create`, `update`, `delete`, `login` |
| `entity_type` | VARCHAR(50) | `project`, `invoice`, `lead`, etc. |
| `entity_id` | BIGINT | |
| `metadata` | JSONB | |
| `created_at` | TIMESTAMPTZ | |

### availability_block

Per-member schedule blocks used by [`AdminAvailability`](../apps/web/src/components/admin/AdminAvailability.tsx) to track when each team member is in school / on break / available for work / unavailable.

| Column | Type | Description |
|--------|------|-------------|
| `block_id` | BIGSERIAL (PK) | |
| `team_member_id` | BIGINT (FK) | → `team_member` ON DELETE CASCADE |
| `day_of_week` | INTEGER | 0–6 (Sunday–Saturday) |
| `start_time` | TIME | |
| `end_time` | TIME | |
| `block_type` | ENUM | `school`, `break`, `work`, `unavailable` |
| `label` | VARCHAR(255) | Optional (e.g. "CS 101", "Lunch") |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### scrape_result

Output of the admin Brand Scraper + FB Scraper, keyed by URL. Append-only from the admin UIs.

**Retention:** keep latest 90 days, delete older. Retention script `scripts/scrape-result-retention.ts` is **not yet written** — see `apps/api/migrations/001_audit_tier1.sql` for the `COMMENT ON TABLE` documenting the policy intent.

| Column | Type | Description |
|--------|------|-------------|
| `scrape_result_id` | BIGSERIAL (PK) | |
| `url` | TEXT | Source URL scraped |
| `type` | VARCHAR(50) | `brand`, `brand-full`, `fb-page` |
| `data` | JSONB | Full scrape payload (colors, fonts, screenshots base64, etc.) |
| `scraped_by` | BIGINT (FK) | → `user` ON DELETE SET NULL (nullable, set when an admin triggered it) |
| `created_at` | TIMESTAMPTZ | |

---

## Migration log

Drizzle-kit `push` syncs `schema.ts` → Postgres. For schema changes that need explicit SQL (ON DELETE alterations, COMMENTs, conditional adds), a raw migration file lives in `apps/api/migrations/NNN_descriptive.sql` and is applied directly via `psql`, then mirrored back into `schema.ts`.

| Migration | Date | What it did |
|---|---|---|
| `001_audit_tier1.sql` | 2026-06-20 | Added 3 missing FK indexes (`idx_lead_assigned_to`, `idx_scrape_result_scraped_by`, `idx_notification_project_id`); added `created_at` to `site_config` + `site_content`; added retention COMMENT on `scrape_result`. Source: database-conventions audit (docs/ROADMAP.md). |
| `002_audit_tier2.sql` | 2026-06-20 | Set explicit `ON DELETE` on the 8 FKs that had drifted to `NO ACTION` (drizzle-kit `push` never alters existing FK actions). **CASCADE** (drift-repair, already declared in schema.ts): `github_event.project_id`, `notification.project_id`. **SET NULL** (detach, don't erase/block): `activity_log.user_id`, `deliverable.assigned_to`, `lead.assigned_to`, `scrape_result.scraped_by`, `client.user_id`, `team_member.user_id`. Unblocks `DELETE /api/team/:id` (was failing when a member had assigned deliverables/leads) and client-delete cascade through projects. Source: database-conventions audit Tier 2, per-FK policy confirmed with owner. |
