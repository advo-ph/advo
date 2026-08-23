# ADVO Database Schema

Convention: BIGINT IDs, singular table naming, cents for currency, camelCase in API responses.

Schema source of truth: [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts) (Drizzle ORM, post-monorepo restructure).

Convention reference: [.agents/workflows/advo-standard.md](../.agents/workflows/advo-standard.md) and [database-conventions skill](../../.claude/skills/database-conventions/SKILL.md).

Migration log: [`apps/api/migrations/`](../apps/api/migrations/) — raw SQL applied directly to prod; schema.ts kept in sync after.

## Tables

### user

| Column                   | Type                | Description                      |
| ------------------------ | ------------------- | -------------------------------- |
| `user_id`                | BIGSERIAL (PK)      |                                  |
| `email`                  | VARCHAR(255) UNIQUE |                                  |
| `password_hash`          | VARCHAR(255)        | Nullable (magic-link-only users) |
| `role`                   | ENUM                | `admin`, `team`, `client`        |
| `is_active`              | BOOLEAN             | Default `true`                   |
| `magic_token`            | VARCHAR(255)        | One-time magic link token        |
| `magic_token_expires_at` | TIMESTAMPTZ         | 15 min expiry                    |
| `created_at`             | TIMESTAMPTZ         |                                  |
| `updated_at`             | TIMESTAMPTZ         |                                  |

### session

| Column          | Type                | Description                      |
| --------------- | ------------------- | -------------------------------- |
| `session_id`    | BIGSERIAL (PK)      |                                  |
| `user_id`       | BIGINT (FK)         | → `user`                         |
| `refresh_token` | VARCHAR(255) UNIQUE | One-time use, rotated on refresh |
| `user_agent`    | TEXT                |                                  |
| `ip_address`    | VARCHAR(45)         |                                  |
| `expires_at`    | TIMESTAMPTZ         | 30-day expiry                    |
| `created_at`    | TIMESTAMPTZ         |                                  |

### client

| Column            | Type           | Description                            |
| ----------------- | -------------- | -------------------------------------- |
| `client_id`       | BIGSERIAL (PK) |                                        |
| `user_id`         | BIGINT (FK)    | → `user` ON DELETE SET NULL (nullable) |
| `company_name`    | VARCHAR(255)   |                                        |
| `contact_email`   | VARCHAR(255)   |                                        |
| `github_org_name` | VARCHAR(100)   |                                        |
| `brand_color_hex` | VARCHAR(7)     |                                        |
| `created_at`      | TIMESTAMPTZ    |                                        |
| `updated_at`      | TIMESTAMPTZ    |                                        |

### project

| Column              | Type           | Description                                                      |
| ------------------- | -------------- | ---------------------------------------------------------------- |
| `project_id`        | BIGSERIAL (PK) |                                                                  |
| `client_id`         | BIGINT (FK)    | → `client`                                                       |
| `title`             | VARCHAR(255)   |                                                                  |
| `description`       | TEXT           |                                                                  |
| `repository_name`   | VARCHAR(100)   | GitHub repo name                                                 |
| `preview_url`       | VARCHAR(500)   | Live preview                                                     |
| `contract_url`      | VARCHAR(500)   | Contract PDF                                                     |
| `project_status`    | ENUM           | `discovery`, `architecture`, `development`, `testing`, `shipped` |
| `total_value_cents` | INTEGER        |                                                                  |
| `amount_paid_cents` | INTEGER        |                                                                  |
| `tech_stack`        | TEXT[]         |                                                                  |
| `created_at`        | TIMESTAMPTZ    |                                                                  |
| `updated_at`        | TIMESTAMPTZ    |                                                                  |

### team_member

| Column                 | Type           | Description                                                                                          |
| ---------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| `team_member_id`       | BIGSERIAL (PK) |                                                                                                      |
| `user_id`              | BIGINT (FK)    | → `user` ON DELETE SET NULL (nullable)                                                               |
| `name`                 | VARCHAR(255)   |                                                                                                      |
| `role`                 | VARCHAR(100)   | Display role/title                                                                                   |
| `email`                | VARCHAR(255)   |                                                                                                      |
| `avatar_url`           | VARCHAR(500)   |                                                                                                      |
| `bio`                  | TEXT           |                                                                                                      |
| `linkedin_url`         | VARCHAR(500)   |                                                                                                      |
| `github_url`           | VARCHAR(500)   |                                                                                                      |
| `permission_role`      | ENUM           | `admin`, `developer`, `designer`, `manager`                                                          |
| `is_active`            | BOOLEAN        |                                                                                                      |
| `penalty_point_count`  | INTEGER        | NOT NULL DEFAULT 0. Manual tally (P11). Admin `PATCH /api/team/:id` `penaltyPointCount`. **Auto-accrual deferred** — rules open; no event hooks yet. |
| `created_at`           | TIMESTAMPTZ    |                                                                                                      |
| `updated_at`           | TIMESTAMPTZ    |                                                                                                      |

### project_access

| Column              | Type           | Description              |
| ------------------- | -------------- | ------------------------ |
| `project_access_id` | BIGSERIAL (PK) |                          |
| `team_member_id`    | BIGINT (FK)    | → `team_member`          |
| `project_id`        | BIGINT (FK)    | → `project`              |
| `permission_level`  | ENUM           | `read`, `write`, `admin` |
| `granted_at`        | TIMESTAMPTZ    |                          |

Unique constraint on (`team_member_id`, `project_id`).

### deliverable

| Column           | Type           | Description                                                    |
| ---------------- | -------------- | -------------------------------------------------------------- |
| `deliverable_id` | BIGSERIAL (PK) |                                                                |
| `project_id`     | BIGINT (FK)    | → `project`                                                    |
| `assigned_to`    | BIGINT (FK)    | → `team_member` ON DELETE SET NULL (nullable)                  |
| `title`          | VARCHAR(255)   |                                                                |
| `description`    | TEXT           |                                                                |
| `priority`       | INTEGER        | 0-10                                                           |
| `status`         | ENUM           | `not_started`, `in_progress`, `review`, `completed`, `blocked` |
| `due_date`       | TIMESTAMPTZ    |                                                                |
| `completed_at`   | TIMESTAMPTZ    |                                                                |
| `verified_at`    | TIMESTAMPTZ    | Team QA sign-off; null = unverified (migration `007`)          |
| `created_at`     | TIMESTAMPTZ    |                                                                |
| `updated_at`     | TIMESTAMPTZ    |                                                                |

### invoice

| Column         | Type           | Description                 |
| -------------- | -------------- | --------------------------- |
| `invoice_id`   | BIGSERIAL (PK) |                             |
| `project_id`   | BIGINT (FK)    | → `project`                 |
| `amount_cents` | INTEGER        |                             |
| `label`        | VARCHAR(255)   |                             |
| `status`       | ENUM           | `unpaid`, `paid`, `overdue` |
| `due_date`     | TIMESTAMPTZ    |                             |
| `paid_at`      | TIMESTAMPTZ    |                             |
| `notes`        | TEXT           |                             |
| `recurring_fee_id` | BIGINT (FK) | → `recurring_fee` `ON DELETE SET NULL`. **NULL = an ordinary one-shot milestone invoice** (every invoice before migration 017). Non-NULL = generated by a recurring fee — excluded from project contract-value / collection aggregates. |
| `period_start_on`  | DATE        | The billing period this row settles. NULL for one-shot invoices. Half of the double-bill guard. |
| `created_at`   | TIMESTAMPTZ    |                             |
| `updated_at`   | TIMESTAMPTZ    |                             |

Partial indexes (migration `017`): UNIQUE `(recurring_fee_id, period_start_on) WHERE recurring_fee_id IS NOT NULL` — the double-bill guard — and `(recurring_fee_id) WHERE recurring_fee_id IS NOT NULL`.

### recurring_fee

Per-project recurring infrastructure/retainer fee (migration `017`). Generates real `invoice` rows on a monthly anchor — **there is no parallel billing table**. FourlinQ MOA: ₱3,000.00/month, billed on the 1st, 15-day grace before suspension is justified.

| Column | Type | Description |
| ------ | ---- | ----------- |
| `recurring_fee_id` | BIGSERIAL (PK) | |
| `project_id` | BIGINT (FK) | → `project` `ON DELETE CASCADE` |
| `label` | VARCHAR(255) | Copied verbatim into `invoice.label` |
| `amount_cents` | INTEGER | Integer CENTS. FourlinQ = `300000`. CHECK `>= 0`. The flat fee only — penalty interest is not modelled. |
| `billing_interval` | VARCHAR(20) | App-validated growable set: `monthly` / `quarterly` / `annual` |
| `billing_day_of_month` | INTEGER | Default 1. CHECK `BETWEEN 1 AND 28` so February and 30-day months never skip a period. |
| `grace_day_count` | INTEGER | Default 15. **Calendar** days past due before suspension is justified (hosting clause). The payment clause elsewhere says 15 *business* days — confirm before the first infra invoice. |
| `status` | ENUM | `recurring_fee_status`: `active` / `paused` / `cancelled` |
| `starts_on` | DATE | First billable period |
| `ends_on` | DATE | Nullable. Set when the client transfers hosting away. CHECK `>= starts_on`. |
| `next_run_on` | DATE | Generator idempotency anchor. Advanced forward only, never rewound by the update API. |
| `last_generated_on` | DATE | Last period actually invoiced |
| `is_suspension_enabled` | BOOLEAN | Some clients are contractually exempt from the remedy |
| `suspended_at` | TIMESTAMPTZ | Written **only** by an explicit human `POST /:id/suspend`, which 409s while suspension is unjustified. Justified != done. |
| `note` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Indexes: `(project_id)`, and `(next_run_on) WHERE status = 'active'` (the generator's only scan).

**Never stored**: `isSuspensionJustified`, `daySinceDue`, `graceDayRemaining`, `outstandingCents` — all derived at read time from the generated invoices, so the ops view and any client-facing view can never disagree.

### commission_plan

How ONE project's value is split among the people who earned it (migration `018`). Prince, 2026-06-19: **60% developer / 25% staff / 15% company**. The staff quarter sub-splits **28% referral / 24% marketing / 24% accounting / 24% management**. Every prior money model in this repo points outward at a client; this is the first that models how ADVO pays itself.

| Column | Type | Description |
| ------ | ---- | ----------- |
| `commission_plan_id` | BIGSERIAL (PK) | |
| `project_id` | BIGINT (FK) | → `project` `ON DELETE CASCADE` |
| `basis_cents` | INTEGER | Integer CENTS being split. Seeded from `project.total_value_cents` at draft time, then independently editable. CHECK `>= 0`. |
| `basis_note` | TEXT | Why the basis differs from the contract value, when it does |
| `developer_bps` | INTEGER | Basis points, default `6000` (60%) |
| `staff_bps` | INTEGER | Default `2500` |
| `company_bps` | INTEGER | Default `1500`. CHECK: the three **sum to exactly 10000**. |
| `referral_bps` | INTEGER | Basis points **of the staff pool**, default `2800` (= 7% of the project) |
| `marketing_bps` / `accounting_bps` / `management_bps` | INTEGER | Default `2400` each. CHECK: the four **sum to exactly 10000**. |
| `status` | VARCHAR(20) | App-validated growable set: `draft` / `finalized` / `void`. CHECK `(status = 'finalized') = (finalized_at IS NOT NULL)`. |
| `finalized_at` | TIMESTAMPTZ | **THE stamp.** NULL = draft, every amount derived and every weight editable. Non-NULL = frozen forever. |
| `finalized_by` | BIGINT (FK) | → `user` `ON DELETE SET NULL` |
| `note` / `created_by` / `created_at` / `updated_at` | | |

Indexes: `(project_id)`, `(status)`, `(finalized_at DESC)`, and a partial UNIQUE `(project_id) WHERE status <> 'void'` — a project can never hold two competing answers to "who gets paid what".

**Why the percentages are columns, not constants**: they are snapshotted per plan. When the structure is renegotiated, an already-finalized plan must keep paying what it promised. A constant in a `.ts` file would silently rewrite history; a column cannot.

### commission_share

The ledger: one row per person per role, **plus exactly one memberless company-reserve row** so the ledger sums to the basis with no residue hiding anywhere.

| Column | Type | Description |
| ------ | ---- | ----------- |
| `commission_share_id` | BIGSERIAL (PK) | |
| `commission_plan_id` | BIGINT (FK) | → `commission_plan` `ON DELETE CASCADE` |
| `team_member_id` | BIGINT (FK) | → `team_member` **`ON DELETE RESTRICT`** (deliberately not the house CASCADE — deleting a member must not erase a compensation record they agreed to; deactivate via `is_active` instead). NULL for exactly one row: the company reserve. |
| `role` | VARCHAR(30) | App-validated growable set: `main_developer` / `assistant_developer` / `referral` / `marketing` / `accounting` / `management` / `company` |
| `contribution_bps` | INTEGER | Relative weight **within this role's pool**, not a share of the project. `60/40` and `6000/4000` allocate identically. CHECK `>= 0`. |
| `is_agreed` | BOOLEAN | Prince: the split "must be mutually agreed on by the devs upon project completion". Finalize refuses while any person-held share is false. Editing a weight resets it. |
| `agreed_at` | TIMESTAMPTZ | CHECK-paired with `is_agreed` |
| `amount_cents` | INTEGER | Integer CENTS. **NULL while the plan is draft** — derived on every read, so an edited contribution can never leave a stale peso behind. Written once at finalize and immutable after. |
| `note` / `created_at` / `updated_at` | | |

CHECK `(role = 'company' AND team_member_id IS NULL) OR (role <> 'company' AND team_member_id IS NOT NULL)`.

Indexes: `(commission_plan_id)`, `(team_member_id)`, UNIQUE `(commission_plan_id, role, team_member_id) WHERE team_member_id IS NOT NULL` (a person may hold two roles, never the same role twice), and three partial UNIQUEs on `(commission_plan_id)` for `role = 'main_developer'`, `'assistant_developer'` and `'company'` — Prince's "1 main developer, 1 assistant dev" enforced by the database, not by application care.

**The rounding rule**: largest-remainder (Hamilton) apportionment, applied recursively at every level (basis → pool, staff pool → role, role → person). Each level floors the exact share, then hands the leftover centavos out one at a time to the largest fractional remainder, ties broken by ledger order so a recompute is byte-identical. `sum(share) = basis_cents` **exactly**, at every level. ₱1.00 across three equal devs is `34 + 33 + 33`, never `33 + 33 + 33`.

**Never stored**: pool amounts, `unallocatedCents`, `isFinalizeReady` and the finalize `blocker` list — all derived at read time by one allocator in `commission.service.ts`, so the admin panel and the write-path gate can never disagree. Cents belonging to a role nobody holds are reported as `unallocatedCents` and **block finalize**; they are never absorbed into the company reserve.

### lead

| Column         | Type           | Description                                                                   |
| -------------- | -------------- | ----------------------------------------------------------------------------- |
| `lead_id`      | BIGSERIAL (PK) |                                                                               |
| `name`         | VARCHAR(255)   |                                                                               |
| `email`        | VARCHAR(255)   |                                                                               |
| `company`      | VARCHAR(255)   |                                                                               |
| `project_type` | VARCHAR(100)   |                                                                               |
| `budget`       | VARCHAR(100)   |                                                                               |
| `description`  | TEXT           |                                                                               |
| `status`       | ENUM           | `new`, `contacted`, `qualified`, `proposal_sent`, `closed_won`, `closed_lost` |
| `assigned_to`  | BIGINT (FK)    | → `team_member` ON DELETE SET NULL (nullable)                                 |
| `notes`        | TEXT           |                                                                               |
| `submitted_at` | TIMESTAMPTZ    |                                                                               |

### notification

| Column            | Type           | Description                                                                                     |
| ----------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `notification_id` | BIGSERIAL (PK) |                                                                                                 |
| `client_id`       | BIGINT (FK)    | → `client` ON DELETE CASCADE                                                                    |
| `project_id`      | BIGINT (FK)    | → `project` ON DELETE CASCADE (nullable)                                                        |
| `type`            | ENUM           | `progress_update`, `invoice_issued`, `deliverable_completed`, `project_status_change`, `custom` |
| `title`           | VARCHAR(255)   |                                                                                                 |
| `body`            | TEXT           |                                                                                                 |
| `is_read`         | BOOLEAN        |                                                                                                 |
| `sent_at`         | TIMESTAMPTZ    |                                                                                                 |

### progress_update

| Column                 | Type           | Description |
| ---------------------- | -------------- | ----------- |
| `progress_update_id`   | BIGSERIAL (PK) |             |
| `project_id`           | BIGINT (FK)    | → `project` |
| `update_title`         | VARCHAR(255)   |             |
| `update_body`          | TEXT           |             |
| `commit_sha_reference` | VARCHAR(40)    |             |
| `created_at`           | TIMESTAMPTZ    |             |

### project_asset

| Column             | Type           | Description                                      |
| ------------------ | -------------- | ------------------------------------------------ |
| `project_asset_id` | BIGSERIAL (PK) |                                                  |
| `project_id`       | BIGINT (FK)    | → `project`                                      |
| `asset_type`       | ENUM           | `progress_photo`, `completion_photo`, `document` |
| `url`              | VARCHAR(500)   |                                                  |
| `caption`          | VARCHAR(255)   |                                                  |
| `uploaded_at`      | TIMESTAMPTZ    |                                                  |

### site_content

| Column                  | Type              | Description                              |
| ----------------------- | ----------------- | ---------------------------------------- |
| `section_id`            | VARCHAR(100) (PK) | e.g. `hero`, `services`, `contact`       |
| `label`                 | VARCHAR(255)      |                                          |
| `visible_public`        | BOOLEAN           |                                          |
| `visible_client_portal` | BOOLEAN           |                                          |
| `content`               | JSONB             | Section-specific content                 |
| `created_at`            | TIMESTAMPTZ       | Added by migration `001_audit_tier1.sql` |
| `updated_at`            | TIMESTAMPTZ       |                                          |

### portfolio_project

| Column                 | Type                | Description                                                |
| ---------------------- | ------------------- | ---------------------------------------------------------- |
| `portfolio_project_id` | BIGSERIAL (PK)      |                                                            |
| `title`                | VARCHAR(255)        |                                                            |
| `description`          | TEXT                |                                                            |
| `preview_url`          | VARCHAR(500)        |                                                            |
| `image_url`            | VARCHAR(500)        |                                                            |
| `image_urls`           | TEXT[]              | Multi-image support                                        |
| `tech_stack`           | TEXT[]              |                                                            |
| `slug`                 | VARCHAR(100) UNIQUE | URL slug                                                   |
| `is_featured`          | BOOLEAN             |                                                            |
| `display_order`        | INTEGER             |                                                            |
| `case_study`           | JSONB               | `{ overview, challenge, solution, results[], github_url }` |
| `created_at`           | TIMESTAMPTZ         |                                                            |
| `updated_at`           | TIMESTAMPTZ         |                                                            |

### social_post

| Column           | Type           | Description |
| ---------------- | -------------- | ----------- |
| `social_post_id` | BIGSERIAL (PK) |             |
| `platform`       | VARCHAR(50)    |             |
| `content`        | TEXT           |             |
| `image_url`      | VARCHAR(500)   |             |
| `scheduled_for`  | TIMESTAMPTZ    |             |
| `is_published`   | BOOLEAN        |             |
| `published_at`   | TIMESTAMPTZ    |             |
| `created_at`     | TIMESTAMPTZ    |             |

### site_config

Key-value config table. Most keys are admin-only via `/api/settings/*`. The allowlisted subset (`social_links`, `brand_name`, `team_order`) is also exposed anonymously via `GET /api/settings/public` for the landing footer + team-order rendering.

| Column       | Type              | Description                                                      |
| ------------ | ----------------- | ---------------------------------------------------------------- |
| `key`        | VARCHAR(100) (PK) | e.g. `agency_name`, `accent_color`, `social_links`, `team_order` |
| `value`      | JSONB             |                                                                  |
| `created_at` | TIMESTAMPTZ       | Added by migration `001_audit_tier1.sql`                         |
| `updated_at` | TIMESTAMPTZ       |                                                                  |

### github_event

| Column       | Type           | Description                                 |
| ------------ | -------------- | ------------------------------------------- |
| `event_id`   | BIGSERIAL (PK) |                                             |
| `project_id` | BIGINT (FK)    | → `project` ON DELETE CASCADE (nullable)    |
| `event_type` | VARCHAR(50)    | `push`, `pull_request`, `deployment_status` |
| `payload`    | JSONB          |                                             |
| `repo_name`  | VARCHAR(100)   |                                             |
| `branch`     | VARCHAR(100)   |                                             |
| `commit_sha` | VARCHAR(40)    |                                             |
| `author`     | VARCHAR(100)   |                                             |
| `message`    | TEXT           |                                             |
| `created_at` | TIMESTAMPTZ    |                                             |

### activity_log

| Column        | Type           | Description                                                                                             |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `activity_id` | BIGSERIAL (PK) |                                                                                                         |
| `user_id`     | BIGINT (FK)    | → `user` ON DELETE SET NULL (nullable)                                                                  |
| `action`      | VARCHAR(50)    | `create`, `update`, `delete`, `login`, `preview_requested` (client asked for a Show-Client-Now preview), `timeline_suggested` (team ran `POST /api/projects/:id/suggest-timeline`; suggestion is response-primary, not stored on project) |
| `entity_type` | VARCHAR(50)    | `project`, `invoice`, `lead`, etc.                                                                      |
| `entity_id`   | BIGINT         |                                                                                                         |
| `metadata`    | JSONB          |                                                                                                         |
| `created_at`  | TIMESTAMPTZ    |                                                                                                         |

### availability_block

Per-member schedule blocks used by [`AdminAvailability`](../apps/web/src/components/admin/AdminAvailability.tsx) to track when each team member is in school / on break / available for work / unavailable.

| Column           | Type           | Description                              |
| ---------------- | -------------- | ---------------------------------------- |
| `block_id`       | BIGSERIAL (PK) |                                          |
| `team_member_id` | BIGINT (FK)    | → `team_member` ON DELETE CASCADE        |
| `day_of_week`    | INTEGER        | 0–6 (Sunday–Saturday)                    |
| `start_time`     | TIME           |                                          |
| `end_time`       | TIME           |                                          |
| `block_type`     | ENUM           | `school`, `break`, `work`, `unavailable` |
| `label`          | VARCHAR(255)   | Optional (e.g. "CS 101", "Lunch")        |
| `created_at`     | TIMESTAMPTZ    |                                          |
| `updated_at`     | TIMESTAMPTZ    |                                          |

### scrape_result

Output of the admin Brand Scraper + FB Scraper, keyed by URL. Append-only from the admin UIs.

**Retention:** keep latest 90 days, delete older. Retention script `scripts/scrape-result-retention.ts` is **not yet written** — see `apps/api/migrations/001_audit_tier1.sql` for the `COMMENT ON TABLE` documenting the policy intent.

| Column             | Type           | Description                                                            |
| ------------------ | -------------- | ---------------------------------------------------------------------- |
| `scrape_result_id` | BIGSERIAL (PK) |                                                                        |
| `url`              | TEXT           | Source URL scraped                                                     |
| `type`             | VARCHAR(50)    | `brand`, `brand-full`, `fb-page`                                       |
| `data`             | JSONB          | Full scrape payload (colors, fonts, screenshots base64, etc.)          |
| `scraped_by`       | BIGINT (FK)    | → `user` ON DELETE SET NULL (nullable, set when an admin triggered it) |
| `created_at`       | TIMESTAMPTZ    |                                                                        |

### calendar_event

Backs the ADVO records calendar (migration `003`). **Manual events only** — derived events (deliverable due dates, invoice due/paid, project kickoffs) are computed at read time in `GET /api/calendar`, not stored here.

| Column              | Type           | Description                                                                                                                                     |
| ------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar_event_id` | BIGSERIAL (PK) |                                                                                                                                                 |
| `project_id`        | INTEGER (FK)   | → `project` ON DELETE SET NULL (nullable, optional link)                                                                                        |
| `title`             | VARCHAR(255)   |                                                                                                                                                 |
| `category`          | VARCHAR(50)    | `meeting`/`deadline`/`moa`/`bir`/`content`/`social`/`cold_email`/`event` — varchar (set grows → app-validated, not a DB enum). Default `event`. |
| `description`       | TEXT           |                                                                                                                                                 |
| `location`          | VARCHAR(255)   |                                                                                                                                                 |
| `starts_at`         | TIMESTAMPTZ    |                                                                                                                                                 |
| `ends_at`           | TIMESTAMPTZ    | Nullable                                                                                                                                        |
| `is_all_day`        | BOOLEAN        | Default `false`                                                                                                                                 |
| `created_at`        | TIMESTAMPTZ    |                                                                                                                                                 |
| `updated_at`        | TIMESTAMPTZ    |                                                                                                                                                 |

### contract

First-class contracts / MOAs / SOWs / NDAs / retainers (migration `004`). Replaces the bare `project.contract_url` string. `signed_at`/`expires_at` derive into `GET /api/calendar` at read time (`contract_signed` / `contract_expires` events), not stored in `calendar_event`. CRUD at `/api/contracts` (team-only).

| Column          | Type           | Description                                                                                           |
| --------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `contract_id`   | BIGSERIAL (PK) |                                                                                                       |
| `client_id`     | INTEGER (FK)   | → `client` ON DELETE CASCADE (the counterparty; required)                                             |
| `project_id`    | INTEGER (FK)   | → `project` ON DELETE SET NULL (nullable, optional link)                                              |
| `title`         | VARCHAR(255)   |                                                                                                       |
| `contract_type` | VARCHAR(50)    | `contract`/`moa`/`sow`/`nda`/`retainer` — varchar (growable set → app-validated). Default `contract`. |
| `status`        | VARCHAR(50)    | `draft`/`sent`/`signed`/`active`/`expired`/`terminated` — app-validated. Default `draft`.             |
| `value_cents`   | INTEGER        | Integer cents (matches `project.total_value_cents`). Default `0`.                                     |
| `signed_at`     | TIMESTAMPTZ    | Nullable — derives a `contract_signed` calendar event                                                 |
| `expires_at`    | TIMESTAMPTZ    | Nullable — derives a `contract_expires` calendar event                                                |
| `document_url`  | VARCHAR(500)   | Nullable — link to the executed PDF                                                                   |
| `notes`         | TEXT           |                                                                                                       |
| `created_at`    | TIMESTAMPTZ    |                                                                                                       |
| `updated_at`    | TIMESTAMPTZ    |                                                                                                       |

Client-safe list: `GET /api/contracts/mine` (auth). Clients join via `client.user_id`; notes/value not returned on that path.

### expense

Agency expense ledger (migration `005`). Integer-cents money; **`is_reimbursable` is not a column** — derived at read time as `(receipt_url IS NOT NULL AND length > 0)`.

| Column          | Type           | Description                                                                                                                                  |
| --------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `expense_id`    | BIGSERIAL (PK) |                                                                                                                                              |
| `project_id`    | INTEGER (FK)   | → `project` ON DELETE SET NULL (nullable — agency overhead vs project-tied)                                                                  |
| `purpose`       | TEXT           | Required                                                                                                                                     |
| `authorized_by` | VARCHAR(255)   | Who authorized the purchase                                                                                                                  |
| `amount_cents`  | INTEGER        | Integer cents (matches invoice/contract)                                                                                                     |
| `location`      | VARCHAR(255)   | Nullable — where the spend happened                                                                                                          |
| `receipt_url`   | VARCHAR(500)   | Nullable — no receipt ⇒ not reimbursable                                                                                                     |
| `category`      | VARCHAR(50)    | App-validated: `ai_usage`/`media`/`subscription`/`outside_payment`/travel/meals/software/hardware/marketing/office/`other`. Default `other`. |
| `created_by`    | INTEGER (FK)   | → `user` ON DELETE SET NULL                                                                                                                  |
| `created_at`    | TIMESTAMPTZ    |                                                                                                                                              |
| `updated_at`    | TIMESTAMPTZ    |                                                                                                                                              |

CRUD: `GET/POST/DELETE /api/expense` (requireTeam).

### project_signoff

The **client-facing final-delivery document** (migration `016`). A project can hold several — FourlinQ Tier 1 "Core Attendance System" then Tier 2 "Advanced Integrated Management System" — so it hangs off `project_id` and names its own scope rather than being a column on `project`.

**Never conflate this with `deliverable.verified_at`** (migration `007`), which is INTERNAL team QA. This is the artifact the client signs. `deliverable_snapshot` deliberately COPIES `verified_at` into frozen jsonb rather than referencing it, and the client read path strips the snapshot entirely — no UI can wire the client card to internal QA state.

Signing is the single event that stamps `signed_at`, starts the final-payment clock, opens the 6-month unused-revision window, and closes further free pre-sign-off revisions. Everything downstream of that stamp is **derived at read time, never stored**: `paymentDueAt`, `revisionWindowEndsAt`, `freeRevisionUsedCount`, `freeRevisionRemainingCount`, `isFreeRevisionOpen`, `isRevisionWindowOpen`, `isPaymentOverdue` (same precedent as `expense.is_reimbursable`).

| Column | Type | Description |
| --- | --- | --- |
| `project_signoff_id` | BIGSERIAL (PK) | |
| `project_id` | INTEGER (FK) | → `project` ON DELETE CASCADE |
| `contract_id` | INTEGER (FK) | → `contract` ON DELETE SET NULL — the MOA this closes out; nullable |
| `invoice_id` | INTEGER (FK) | → `invoice` ON DELETE SET NULL — the final-payment invoice minted AT SIGN TIME; NULL until signed |
| `title` | VARCHAR(255) | The commissioned system, e.g. `Phase 1: Core Attendance System` |
| `scope_summary` | TEXT | What is being accepted as delivered; snapshot prose written at draft time |
| `status` | VARCHAR(50) | App-validated growable set: `draft`/`issued`/`signed`/`void`. Default `draft`. Not a DB enum (`change_order`/`contract` precedent) |
| `final_payment_cents` | INTEGER | Integer CENTS due on signing. Tier 1 = `2250000`, Tier 2 = `3500000`. Default `0` |
| `payment_due_day_count` | INTEGER | Contract: 7 days from signing to pay. Default `7` |
| `revision_window_month_count` | INTEGER | Contract: unused rounds invocable 6 months after signing. Default `6` |
| `free_revision_total_count` | INTEGER | The ALLOWANCE only (contract: 5 rounds). Default `5`. **used/remaining are counted from `signoff_revision`, never stored** |
| `deliverable_snapshot` | JSONB | Frozen `[{deliverableId,title,status,verifiedAt}]` captured at ISSUE time. Team evidence only |
| `document_url` | VARCHAR(500) | Nullable — the executed PDF (mirrors `contract.document_url`) |
| `issued_at` | TIMESTAMPTZ | When the team released it to /hub; NULL while draft |
| `signed_at` | TIMESTAMPTZ | **THE stamp.** NULL = unsigned. Every clock derives from it |
| `signed_by` | INTEGER (FK) | → `user` ON DELETE SET NULL — the client user; NULL for deemed/offline |
| `signed_name` | VARCHAR(255) | The legal name typed at signature time, verbatim |
| `signed_method` | VARCHAR(20) | App-validated: `client`/`deemed`/`offline`. Default `client` |
| `signed_ip` | VARCHAR(45) | Signature evidence (width matches `session.ip_address`) |
| `signed_user_agent` | TEXT | Signature evidence |
| `note` | TEXT | Internal team note — **not returned on the client path** |
| `created_by` | INTEGER (FK) | → `user` ON DELETE SET NULL |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

CHECKs: `final_payment_cents >= 0`; `free_revision_total_count >= 0`; `payment_due_day_count > 0 AND revision_window_month_count > 0`; `(status = 'signed') = (signed_at IS NOT NULL)`; `signed_at IS NULL OR issued_at IS NOT NULL`.

Indexes: `project_id`, `contract_id`, `invoice_id`, `status`, `signed_at DESC`. Two **partial unique** indexes: `idx_project_signoff_open` on `(project_id) WHERE status = 'issued'` (at most one document awaiting signature per project) and `idx_project_signoff_title` on `(project_id, lower(title)) WHERE status <> 'void'` (the same system cannot be issued twice).

Retention: a signed row is a **legal artifact** — never hard-delete it. `ON DELETE CASCADE` from `project` is kept for house consistency, so `DELETE /api/projects/:id` should refuse (or archive) when a signed sign-off exists — flagged, not yet enforced.

### signoff_revision

Ledger of complementary revision rounds consumed against a sign-off (migration `016`). A **ledger, not a counter**: used/remaining are COUNTED from here so the tally cannot drift from the paper trail.

| Column | Type | Description |
| --- | --- | --- |
| `signoff_revision_id` | BIGSERIAL (PK) | |
| `project_signoff_id` | INTEGER (FK) | → `project_signoff` ON DELETE CASCADE |
| `deliverable_id` | INTEGER (FK) | → `deliverable` ON DELETE SET NULL — the "Client revision" task; detaches rather than erasing the ledger row |
| `round_number` | INTEGER | 1..`free_revision_total_count`, assigned inside the transaction under `SELECT ... FOR UPDATE` |
| `note` | TEXT | The client's batched feedback list, verbatim |
| `is_post_signoff` | BOOLEAN | True when invoked inside the 6-month post-signature window — the column that proves the contract clause was honoured. Default `false` |
| `requested_by` | INTEGER (FK) | → `user` ON DELETE SET NULL |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

CHECK `round_number > 0`. **UNIQUE `(project_signoff_id, round_number)`** — the double-spend guard, enforced by the DB rather than by application care.

API: `GET/POST /api/project-signoff`, `GET/PATCH /api/project-signoff/:id`, `POST /api/project-signoff/:id/issue|sign|revision|void`.

---

### schema_migration

One row per migration file a database has applied. Written by `019_schema_ledger.sql` and by every migration after it; read by `scripts/migration-drift.mjs`. **No API route touches it** — the app has no business editing its own deploy history.

| Column                | Type           | Description                                                                                                    |
| --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `schema_migration_id` | BIGSERIAL (PK) |                                                                                                                  |
| `filename`            | VARCHAR(255)   | Exactly as named in `apps/api/migrations`, e.g. `005_expense.sql`. UNIQUE.                                        |
| `applied_at`          | TIMESTAMPTZ    | On a backfilled row this is when the ledger was created, **not** when the migration ran — read as "known applied by". |
| `is_backfilled`       | BOOLEAN        | True when inferred from a sentinel object rather than written as the migration ran.                              |
| `created_at`          | TIMESTAMPTZ    |                                                                                                                  |

The ordinal in `filename` is data, not order: a database can hold 018 and not 005, and that hole is the whole reason the table exists.

---

## Migration log

Drizzle-kit `push` syncs `schema.ts` → Postgres. For schema changes that need explicit SQL (ON DELETE alterations, COMMENTs, conditional adds), a raw migration file lives in `apps/api/migrations/NNN_descriptive.sql` and is applied directly via `psql`, then mirrored back into `schema.ts`.

| Migration                | Date       | What it did                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_audit_tier1.sql`    | 2026-06-20 | Added 3 missing FK indexes (`idx_lead_assigned_to`, `idx_scrape_result_scraped_by`, `idx_notification_project_id`); added `created_at` to `site_config` + `site_content`; added retention COMMENT on `scrape_result`. Source: database-conventions audit (docs/ROADMAP.md).                                                                                                                                                                                                                                                                                                                                                                                |
| `002_audit_tier2.sql`    | 2026-06-20 | Set explicit `ON DELETE` on the 8 FKs that had drifted to `NO ACTION` (drizzle-kit `push` never alters existing FK actions). **CASCADE** (drift-repair, already declared in schema.ts): `github_event.project_id`, `notification.project_id`. **SET NULL** (detach, don't erase/block): `activity_log.user_id`, `deliverable.assigned_to`, `lead.assigned_to`, `scrape_result.scraped_by`, `client.user_id`, `team_member.user_id`. Unblocks `DELETE /api/team/:id` (was failing when a member had assigned deliverables/leads) and client-delete cascade through projects. Source: database-conventions audit Tier 2, per-FK policy confirmed with owner. |
| `003_calendar_event.sql` | 2026-06-20 | Created `calendar_event` (manual ADVO calendar events — meetings, MOAs, BIR deadlines, content/social posts, cold-email cadence). bigserial PK, `project_id` FK `ON DELETE SET NULL`, `category` varchar (growable set → app-validated, not an enum), `is_all_day` predicate boolean, TIMESTAMPTZ, `COMMENT ON TABLE`, indexes on `starts_at` + FK — per database-conventions. Applied to prod as the app DB user (so the app owns + can read it). Backs `GET /api/calendar`; derived events (deliverables/invoices/projects) are computed at read time, not stored.                                                                                       |
| `004_contract.sql`       | 2026-06-20 | Created `contract` (first-class contracts/MOAs/SOWs/NDAs/retainers — Phase 2 calendar layer). bigserial PK, `client_id` FK `ON DELETE CASCADE`, `project_id` FK `ON DELETE SET NULL`, `contract_type`/`status` varchar (growable → app-validated), `value_cents` integer cents, `signed_at`/`expires_at` TIMESTAMPTZ, `COMMENT ON TABLE`, indexes on both FKs + `expires_at` — per database-conventions. CRUD at `/api/contracts`; `signed_at`/`expires_at` derive into `GET /api/calendar` at read time. Apply to prod as the app DB user.                                                                                                                |
| `005_expense.sql`        | 2026-07-31 | Created `expense` (agency expense ledger — Plaud 07-30 CP1). bigserial PK, optional `project_id` FK `ON DELETE SET NULL`, `purpose`/`authorized_by`/`amount_cents` required, `location`/`receipt_url` nullable, `category` varchar app-validated, `created_by` → `user` SET NULL. **No `is_reimbursable` column** — derived from receipt presence. Indexes on project, created_by, created_at. Apply to each env before shipping expense API.                                                                                                                                                                                                              |
| `007_deliverable_verified_at.sql` | 2026-07-31 | Added nullable `verified_at` TIMESTAMPTZ on `deliverable` for team QA sign-off (P7). Independent of `status`/`completed_at`; set/clear via `PATCH /api/deliverables/:id` body `verifiedAt`. No penalty points. |
| `008_team_member_penalty_point_count.sql` | 2026-07-31 | Added `penalty_point_count` INTEGER NOT NULL DEFAULT 0 on `team_member` (P11). Admin displays count; adjusts via `PATCH /api/team/:id` body `penaltyPointCount` (requireAdmin). **Automatic accrual deferred** — rules still open. |
| `012_meeting_plaud_import.sql` | 2026-08-16 | `meeting.summary` (Plaud AI note), `meeting.plaud_file_id` (unique when set), `plaud_share_key` widened to 500. Idempotent re-import updates the same row. |
| `013_meeting_is_visible_client.sql` | 2026-08-16 | `meeting.is_visible_client` NOT NULL DEFAULT false. Import/paste stay unpublished until Publish. Partial index on `project_id` where visible. |
| `016_project_signoff.sql` | 2026-08-19 | Created `project_signoff` + `signoff_revision` — the CLIENT-FACING final-delivery document the FourlinQ MOA names 5 times (final payment due on signing with 7 days to pay; all free revisions used before signing; unused rounds invocable 6 months after). Distinct from `deliverable.verified_at` (internal QA). `status`/`signed_method` app-validated varchar, money in integer cents, two partial unique indexes (one open sign-off per project; no duplicate title), UNIQUE `(project_signoff_id, round_number)` as the revision double-spend guard. used/remaining and every clock are DERIVED at read time. Signing is one transaction guarded by `UPDATE ... WHERE signed_at IS NULL RETURNING`, which mints the final-payment invoice exactly once. |
| `017_recurring_fee.sql` | 2026-08-19 | Created `recurring_fee` + `recurring_fee_status` ENUM and ALTERed `invoice` with two nullable columns (`recurring_fee_id` SET NULL, `period_start_on` DATE) — the FIRST recurring money in the repo, backing the FourlinQ MOA ₱3,000.00/month infrastructure fee billed on the 1st with a 15-day suspension window. **No parallel billing system** and **no new `invoice_status` value**: the generated charge IS an `invoice` row. Every billing anchor is DATE (Asia/Manila), never timestamptz. Double-billing is blocked by the partial UNIQUE `(recurring_fee_id, period_start_on) WHERE recurring_fee_id IS NOT NULL` plus `onConflictDoNothing`; catch-up is bounded by `MAX_CATCHUP_PERIOD = 24`. `billing_day_of_month` CHECKed 1..28 so no month skips. Suspension is DERIVED at read time — `suspended_at` is written only by an explicit admin POST that 409s when unjustified, and nothing auto-suspends hosting. `DELETE /api/invoices/:id` now 409s for a generated invoice so a billed period cannot be orphaned. |
| `018_commission_split.sql` | 2026-08-19 | Created `commission_plan` + `commission_share` — the FIRST model of how ADVO pays itself (Prince, 2026-06-19: 60% developer / 25% staff / 15% company; staff sub-split 28/24/24/24 referral/marketing/accounting/management). Every percentage is integer BASIS POINTS stored **as columns on the plan**, snapshotted per project, so renegotiating the structure can never rewrite an already-finalized plan. The 15% company reserve is a real share row with `team_member_id` NULL, which is what makes `SUM(share.amount_cents) = plan.basis_cents` provable with no residue. Rounding is largest-remainder (Hamilton) applied recursively and exact at every level — no centavo is lost, invented, or absorbed; cents belonging to an unheld role surface as `unallocatedCents` and block finalize. `amount_cents` is NULL while draft (derived on read) and frozen at finalize, which is atomic and single-shot via `UPDATE ... WHERE finalized_at IS NULL RETURNING`. Cardinality (1 main developer, 1 assistant, 1 company reserve, 1 live plan per project) is enforced by partial unique indexes. `team_member_id` is `ON DELETE RESTRICT`, diverging from the house CASCADE on purpose. **No payout, no disbursement, no scheduler** — a finalized plan states who is owed what; moving the money is a separate human act. |
| `019_schema_ledger.sql` | 2026-08-23 | Created `schema_migration` — the first record this repo keeps of what a database has actually seen. Prod's health payload carried `relation "expense" does not exist` on 2026-08-19 while 012–015 were on the box: `005_expense.sql` had been skipped and nothing could say so, because migrations are applied by hand and the only evidence one ran was the schema it left behind. **The backfill is deliberately not a blanket insert** — each of the 18 prior rows is gated on a SENTINEL (the table, column or FK action that migration creates), so a database missing `expense` gets no 005 row and reports the gap instead of being handed a clean bill. `is_backfilled` marks an inferred row, whose `applied_at` means "known applied by", never "applied at". Mirrored into `schema.ts` because `db:push` drops what that file does not declare. Checked by `npm run migration:drift`. |

### Which migration has this database seen?

```bash
npm run migration:drift                          # target: apps/api/.env DATABASE_URL
npm run migration:drift -- --url postgres://…    # target: an explicit database
npm run migration:drift -- --json                # machine-readable, for a deploy gate
```

Exit `0` clean · `1` drift · `2` could not check. Three findings, and the distinction matters:

- **GAP** — unapplied, but a *later* migration is applied. The database moved past it. This is prod's `005_expense.sql`, and it is the alarming one.
- **UNAPPLIED** — nothing later is applied either; an ordinary not-yet-deployed migration.
- **ORPHAN** — recorded applied but no longer in the tree; a deleted or renamed migration.

On a database that predates the ledger the detector reports no-ledger and exits `1`. Apply `019_schema_ledger.sql` first — its backfill is guarded, so it is safe on an existing box.
