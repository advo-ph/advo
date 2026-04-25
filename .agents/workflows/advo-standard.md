---
description: ADVO coding standards and conventions
---

## Database Conventions (The ADVO Standard)

- **Primary keys**: `<table_name>_id BIGINT GENERATED ALWAYS AS IDENTITY`
- **Table naming**: Singular (`client`, `project`, not `clients`, `projects`)
- **Currency**: Always in cents (`amount_cents BIGINT`), format with `formatCurrency()` from `types/admin.ts`
- **Timestamps**: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Foreign keys**: `ON DELETE CASCADE` for child tables, `ON DELETE SET NULL` for optional refs
- **Enums**: PostgreSQL `CREATE TYPE` enums, defined in `advo-api/src/db/schema.ts` via Drizzle

## Auth & Authorization

- JWT access tokens (15min) + refresh tokens (30d) issued by `/api/auth/login` and `/api/auth/refresh`
- Refresh tokens persisted in `session` table (DB-backed); revoke by deleting the row
- Middleware: `requireAuth` (any logged-in user), `requireAdmin` (role check)
- No RLS — authorization is enforced in Hono route handlers

## React Patterns

- **Data fetching**: TanStack React Query v5 (`useQuery`, `useMutation`)
- **Optimistic updates**: Use `onMutate` → `cancelQueries` → `setQueryData` → return `{ previous }`
- **State management**: React Query cache is the source of truth
- **Components**: Functional components, named exports for hooks, default exports for components
- **Types**: Define interfaces in the hook file, export them. Shared types in `src/types/admin.ts`

## API Client (`src/lib/api.ts`)

- All requests envelope: `{ data, error }`
- Helpers: `get()`, `post()`, `patch()`, `del()`, `upload()`
- Auto-refreshes JWT on 401, retries the original request once
- `upload()` returns `{ url, filename, error }` (discriminated union — surface real API errors)
- Snake_case fields are silently dropped by Zod — **always send camelCase** (`imageUrl`, `techStack`, `isFeatured`)

## File Organization

- `src/hooks/use<Feature>.ts` — Data hooks with React Query
- `src/components/admin/Admin<Feature>.tsx` — Admin panel sections
- `src/components/hub/<Component>.tsx` — Client portal components
- `src/components/landing/<Section>.tsx` — Public site sections
- `src/components/ui/section.tsx` — `<Section>` + `<SectionHeader>` primitives
- `src/lib/<service>.ts` — Utility/service modules (api, db, github, notifications)
- `advo-api/src/routes/<feature>.routes.ts` — Hono route files
- `advo-api/src/db/schema.ts` — Drizzle schema (single file)

## Notifications

- Helper: `triggerNotification()` from `lib/notifications.ts`
- Fire-and-forget: never block the caller's flow
- Per-event toggles in `site_content.client_dashboard` JSONB
- Email transport via Nodemailer (Resend SMTP or custom)

## Design System

- Dark, monochrome with a single warm orange accent (`#E67A3A`)
- Geist font (sans + mono); mono used for eyebrow labels and numerals (`01`, `02`…)
- No `whileInView` scroll animations — only Hero stagger on mount, nav pill morph, TechTicker marquee, ContactCTA blobs
- Use `<Section>` + `<SectionHeader>` for any new landing/admin section
- Tokens defined in `src/index.css` `@layer base :root`
