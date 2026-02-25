# ADVO Database Schema

The ADVO Standard: BIGINT IDs, singular table naming, cents for currency.

## Tables

### client

| Column            | Type         | Description             |
| ----------------- | ------------ | ----------------------- |
| `client_id`       | BIGINT (PK)  | Auto-generated          |
| `user_id`         | UUID         | References `auth.users` |
| `company_name`    | VARCHAR(100) | Company/client name     |
| `contact_email`   | VARCHAR(255) | Contact email           |
| `github_org_name` | VARCHAR(100) | GitHub org (optional)   |
| `brand_color_hex` | CHAR(7)      | Brand color `#XXXXXX`   |
| `created_at`      | TIMESTAMPTZ  |                         |
| `updated_at`      | TIMESTAMPTZ  |                         |

### project

| Column              | Type         | Description                                                      |
| ------------------- | ------------ | ---------------------------------------------------------------- |
| `project_id`        | BIGINT (PK)  | Auto-generated                                                   |
| `client_id`         | BIGINT (FK)  | → `client`                                                       |
| `title`             | VARCHAR(255) |                                                                  |
| `description`       | TEXT         |                                                                  |
| `repository_name`   | VARCHAR(100) | GitHub repo name                                                 |
| `preview_url`       | TEXT         | Live preview URL                                                 |
| `contract_url`      | TEXT         | Contract PDF link                                                |
| `project_status`    | ENUM         | `discovery`, `architecture`, `development`, `testing`, `shipped` |
| `total_value_cents` | BIGINT       | In PHP cents                                                     |
| `amount_paid_cents` | BIGINT       | In PHP cents                                                     |
| `is_active`         | BOOLEAN      |                                                                  |
| `tech_stack`        | TEXT[]       | Array of technologies                                            |
| `created_at`        | TIMESTAMPTZ  |                                                                  |
| `updated_at`        | TIMESTAMPTZ  |                                                                  |

### progress_update

| Column                 | Type         | Description |
| ---------------------- | ------------ | ----------- |
| `progress_update_id`   | BIGINT (PK)  |             |
| `project_id`           | BIGINT (FK)  | → `project` |
| `update_title`         | VARCHAR(255) |             |
| `update_body`          | TEXT         |             |
| `commit_sha_reference` | VARCHAR(40)  | Git SHA     |
| `created_at`           | TIMESTAMPTZ  |             |

### deliverable

| Column           | Type         | Description                                                    |
| ---------------- | ------------ | -------------------------------------------------------------- |
| `deliverable_id` | BIGINT (PK)  |                                                                |
| `project_id`     | BIGINT (FK)  | → `project`                                                    |
| `title`          | VARCHAR(255) |                                                                |
| `description`    | TEXT         |                                                                |
| `status`         | ENUM         | `not_started`, `in_progress`, `review`, `completed`, `blocked` |
| `priority`       | INT          | Sort order                                                     |
| `due_date`       | DATE         |                                                                |
| `team_member_id` | BIGINT (FK)  | → `team_member` (assignee)                                     |
| `created_at`     | TIMESTAMPTZ  |                                                                |

### invoice

| Column         | Type         | Description                 |
| -------------- | ------------ | --------------------------- |
| `invoice_id`   | BIGINT (PK)  |                             |
| `project_id`   | BIGINT (FK)  | → `project`                 |
| `label`        | VARCHAR(255) | Invoice name/description    |
| `amount_cents` | BIGINT       | In PHP cents                |
| `status`       | ENUM         | `unpaid`, `paid`, `overdue` |
| `due_date`     | DATE         |                             |
| `paid_at`      | TIMESTAMPTZ  |                             |
| `notes`        | TEXT         |                             |
| `created_at`   | TIMESTAMPTZ  |                             |

### team_member

| Column            | Type         | Description                 |
| ----------------- | ------------ | --------------------------- |
| `team_member_id`  | BIGINT (PK)  |                             |
| `name`            | VARCHAR(100) |                             |
| `role`            | VARCHAR(100) | Job title                   |
| `email`           | VARCHAR(255) |                             |
| `avatar_url`      | TEXT         |                             |
| `bio`             | TEXT         |                             |
| `linkedin_url`    | TEXT         |                             |
| `is_active`       | BOOLEAN      |                             |
| `user_id`         | UUID         | → `auth.users`              |
| `permission_role` | ENUM         | `admin`, `editor`, `viewer` |
| `created_at`      | TIMESTAMPTZ  |                             |

### project_access

| Column              | Type        | Description                 |
| ------------------- | ----------- | --------------------------- |
| `project_access_id` | BIGINT (PK) |                             |
| `team_member_id`    | BIGINT (FK) | → `team_member`             |
| `project_id`        | BIGINT (FK) | → `project`                 |
| `permission_level`  | ENUM        | `owner`, `editor`, `viewer` |
| `granted_at`        | TIMESTAMPTZ |                             |

### notification

| Column            | Type        | Description                                                                                     |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `notification_id` | BIGINT (PK) |                                                                                                 |
| `client_id`       | BIGINT (FK) | → `client`                                                                                      |
| `project_id`      | BIGINT (FK) | → `project` (nullable)                                                                          |
| `type`            | ENUM        | `progress_update`, `invoice_issued`, `deliverable_completed`, `project_status_change`, `custom` |
| `title`           | TEXT        |                                                                                                 |
| `body`            | TEXT        |                                                                                                 |
| `is_read`         | BOOLEAN     | Default `false`                                                                                 |
| `sent_at`         | TIMESTAMPTZ |                                                                                                 |

### project_asset

| Column             | Type        | Description                                      |
| ------------------ | ----------- | ------------------------------------------------ |
| `project_asset_id` | BIGINT (PK) |                                                  |
| `project_id`       | BIGINT (FK) | → `project`                                      |
| `asset_type`       | ENUM        | `progress_photo`, `completion_photo`, `document` |
| `url`              | TEXT        | Asset URL                                        |
| `caption`          | TEXT        |                                                  |
| `uploaded_at`      | TIMESTAMPTZ |                                                  |

### portfolio_project

| Column                 | Type         | Description                          |
| ---------------------- | ------------ | ------------------------------------ |
| `portfolio_project_id` | BIGINT (PK)  |                                      |
| `title`                | VARCHAR(255) |                                      |
| `description`          | TEXT         |                                      |
| `preview_url`          | TEXT         |                                      |
| `image_url`            | TEXT         | Legacy single image (first of array) |
| `image_urls`           | TEXT[]       | Multi-image gallery, first = thumb   |
| `tech_stack`           | TEXT[]       |                                      |
| `is_featured`          | BOOLEAN      |                                      |
| `display_order`        | INT          |                                      |
| `created_at`           | TIMESTAMPTZ  |                                      |

### site_content

| Column                  | Type         | Description                                 |
| ----------------------- | ------------ | ------------------------------------------- |
| `section_id`            | VARCHAR (PK) | e.g. `hero`, `services`, `client_dashboard` |
| `label`                 | VARCHAR      | Display name                                |
| `visible_public`        | BOOLEAN      | Show on landing page                        |
| `visible_client_portal` | BOOLEAN      | Show in client hub                          |
| `content`               | JSONB        | Flexible content payload                    |
| `updated_at`            | TIMESTAMPTZ  |                                             |

### lead

| Column         | Type         | Description                                                |
| -------------- | ------------ | ---------------------------------------------------------- |
| `lead_id`      | BIGINT (PK)  |                                                            |
| `full_name`    | VARCHAR(100) |                                                            |
| `email`        | VARCHAR(255) |                                                            |
| `company`      | VARCHAR(100) |                                                            |
| `project_type` | VARCHAR(50)  |                                                            |
| `budget_range` | VARCHAR(50)  |                                                            |
| `description`  | TEXT         |                                                            |
| `status`       | ENUM         | `new`, `contacted`, `qualified`, `proposal`, `won`, `lost` |
| `created_at`   | TIMESTAMPTZ  |                                                            |

## Enums

| Enum                       | Values                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `project_status`           | `discovery`, `architecture`, `development`, `testing`, `shipped`                                |
| `deliverable_status`       | `not_started`, `in_progress`, `review`, `completed`, `blocked`                                  |
| `invoice_status`           | `unpaid`, `paid`, `overdue`                                                                     |
| `notification_type`        | `progress_update`, `invoice_issued`, `deliverable_completed`, `project_status_change`, `custom` |
| `project_asset_type`       | `progress_photo`, `completion_photo`, `document`                                                |
| `team_permission_role`     | `admin`, `editor`, `viewer`                                                                     |
| `project_permission_level` | `owner`, `editor`, `viewer`                                                                     |
| `lead_status`              | `new`, `contacted`, `qualified`, `proposal`, `won`, `lost`                                      |

## Row Level Security

| Table               | Admin | Client              | Public               |
| ------------------- | ----- | ------------------- | -------------------- |
| `client`            | ALL   | SELECT own          | —                    |
| `project`           | ALL   | SELECT own          | —                    |
| `progress_update`   | ALL   | SELECT own          | —                    |
| `deliverable`       | ALL   | SELECT own          | —                    |
| `invoice`           | ALL   | SELECT own          | —                    |
| `team_member`       | ALL   | SELECT              | SELECT (public page) |
| `project_access`    | ALL   | SELECT own          | —                    |
| `notification`      | ALL   | SELECT + UPDATE own | —                    |
| `project_asset`     | ALL   | SELECT own          | —                    |
| `portfolio_project` | ALL   | —                   | SELECT               |
| `site_content`      | ALL   | SELECT              | SELECT               |
| `lead`              | ALL   | INSERT              | INSERT               |

## Storage Buckets

| Bucket      | Public | Purpose                          |
| ----------- | ------ | -------------------------------- |
| `avatars`   | Yes    | Team member profile pictures     |
| `portfolio` | Yes    | Portfolio project gallery images |

**RLS**: Authenticated users can upload/update/delete. Anyone can view (public buckets).

## Edge Functions

| Function            | Trigger       | Description                                                    |
| ------------------- | ------------- | -------------------------------------------------------------- |
| `send-notification` | Manual / auto | Inserts notification row + sends ADVO-branded email via Resend |
