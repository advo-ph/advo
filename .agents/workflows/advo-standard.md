---
description: ADVO coding standards and conventions
---

## Database Conventions (The ADVO Standard)

- **Primary keys**: `<table_name>_id BIGINT GENERATED ALWAYS AS IDENTITY`
- **Table naming**: Singular (`client`, `project`, not `clients`, `projects`)
- **Currency**: Always in cents (`amount_cents BIGINT`), format with `formatCurrency()` from `types/admin.ts`
- **Timestamps**: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Foreign keys**: `ON DELETE CASCADE` for child tables, `ON DELETE SET NULL` for optional refs
- **Enums**: `CREATE TYPE public.<name> AS ENUM (...)` — always in migration files

## RLS Rules

- Every table has RLS enabled
- Admin policy: `auth.uid() IN (SELECT user_id FROM team_member WHERE permission_role = 'admin')`
- Client policy: chain through `client.user_id = auth.uid()`
- Public tables (portfolio, site_content): anon SELECT

## React Patterns

- **Data fetching**: TanStack React Query v5 (`useQuery`, `useMutation`)
- **Optimistic updates**: Use `onMutate` → `cancelQueries` → `setQueryData` → return `{ previous }`
- **State management**: React Query cache is the source of truth
- **Components**: Functional components, named exports for hooks, default exports for components
- **Types**: Define interfaces in the hook file, export them. Use Supabase types from `integrations/supabase/types.ts`

## File Organization

- `src/hooks/use<Feature>.ts` — Data hooks with RQ
- `src/components/admin/Admin<Feature>.tsx` — Admin panel sections
- `src/components/hub/<Component>.tsx` — Client portal components
- `src/lib/<service>.ts` — Utility/service modules
- `supabase/migrations/<date>_<name>.sql` — Sequential migrations
- `supabase/functions/<name>/index.ts` — Edge functions (Deno)

## Supabase Edge Functions

- Runtime: Deno (not Node)
- Import from `https://esm.sh/` (not npm)
- Use `Deno.serve()` handler pattern
- Always handle CORS with `OPTIONS` preflight
- Use `SUPABASE_SERVICE_ROLE_KEY` for admin DB operations

## Notifications

- Helper: `triggerNotification()` from `lib/notifications.ts`
- Fire-and-forget: never block the caller's flow
- Auto-toggle config stored in `site_content.client_dashboard` JSONB
