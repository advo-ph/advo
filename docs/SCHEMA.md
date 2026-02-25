# ADVO Database Schema

The ADVO Standard: BIGINT IDs, singular naming, cents for currency.

## Tables

### client

Core client table for users with projects.

| Column            | Type         | Description                    |
| ----------------- | ------------ | ------------------------------ |
| `client_id`       | BIGINT       | Primary key (auto-generated)   |
| `user_id`         | UUID         | References auth.users          |
| `company_name`    | VARCHAR(100) | Company/client name            |
| `contact_email`   | VARCHAR(255) | Contact email                  |
| `github_org_name` | VARCHAR(100) | GitHub organization (optional) |
| `brand_color_hex` | CHAR(7)      | Brand color (#XXXXXX)          |
| `created_at`      | TIMESTAMPTZ  | Creation timestamp             |
| `updated_at`      | TIMESTAMPTZ  | Last update timestamp          |

### project

Individual projects belonging to clients.

| Column              | Type         | Description                                            |
| ------------------- | ------------ | ------------------------------------------------------ |
| `project_id`        | BIGINT       | Primary key                                            |
| `client_id`         | BIGINT       | References client                                      |
| `title`             | VARCHAR(255) | Project title                                          |
| `description`       | TEXT         | Project description                                    |
| `repository_name`   | VARCHAR(100) | GitHub repo name                                       |
| `preview_url`       | TEXT         | Live preview URL                                       |
| `project_status`    | ENUM         | discovery, architecture, development, testing, shipped |
| `total_value_cents` | BIGINT       | Total project value in cents                           |
| `amount_paid_cents` | BIGINT       | Amount paid in cents                                   |
| `is_active`         | BOOLEAN      | Active status                                          |
| `tech_stack`        | TEXT[]       | Array of technologies                                  |
| `created_at`        | TIMESTAMPTZ  | Creation timestamp                                     |
| `updated_at`        | TIMESTAMPTZ  | Last update timestamp                                  |

### progress_update

Progress updates/milestones for projects.

| Column                 | Type         | Description        |
| ---------------------- | ------------ | ------------------ |
| `progress_update_id`   | BIGINT       | Primary key        |
| `project_id`           | BIGINT       | References project |
| `update_title`         | VARCHAR(255) | Update title       |
| `update_body`          | TEXT         | Update details     |
| `commit_sha_reference` | VARCHAR(40)  | Git commit SHA     |
| `created_at`           | TIMESTAMPTZ  | Creation timestamp |

### portfolio_project

Public-facing portfolio projects (landing page).

| Column                 | Type         | Description         |
| ---------------------- | ------------ | ------------------- |
| `portfolio_project_id` | BIGINT       | Primary key         |
| `title`                | VARCHAR(255) | Project title       |
| `description`          | TEXT         | Project description |
| `preview_url`          | TEXT         | Live preview URL    |
| `image_url`            | TEXT         | Preview image       |
| `tech_stack`           | TEXT[]       | Technologies used   |
| `is_featured`          | BOOLEAN      | Featured on landing |
| `display_order`        | INT          | Sort order          |
| `created_at`           | TIMESTAMPTZ  | Creation timestamp  |

## Row Level Security (RLS)

All tables have RLS enabled:

- **client**: Users can only see/edit their own client record
- **project**: Users can only see projects linked to their client
- **progress_update**: Users can only see updates for their projects
- **portfolio_project**: Public read access (anonymous)

## Indices

```sql
CREATE INDEX idx_project_client_id ON project(client_id);
CREATE INDEX idx_project_status ON project(project_status);
CREATE INDEX idx_progress_project_id ON progress_update(project_id);
CREATE INDEX idx_client_user_id ON client(user_id);
```
