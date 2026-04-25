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

## Field naming across the stack — strict

The DB and the frontend use different cases. The boundary is the API client; **mapping is mandatory**.

| Layer | Convention | Why |
|-------|-----------|-----|
| **DB columns** | `snake_case` (`portfolio_project_id`, `image_url`) | ADVO Standard — Postgres convention |
| **Drizzle schema (advo-api)** | `camelCase` JS field names mapped to snake_case columns | TypeScript/JS convention |
| **API responses** | `camelCase` (whatever Drizzle returns: `portfolioProjectId`, `imageUrl`) | Matches Drizzle output, no extra mapping in route handlers |
| **API request bodies (Zod)** | `camelCase` — **snake_case fields are silently dropped** by `zValidator` | Source of recent bugs; document mismatch upfront |
| **Frontend TS interfaces** | `snake_case` (matches DB shape, makes routes/hooks readable) | ADVO codebase legacy; consistent with `types/admin.ts` |
| **Frontend → API payload** | Map back to `camelCase` before send (`imageUrl`, `techStack`, `isFeatured`) | Match Zod schema |
| **API response → Frontend state** | Map response keys to `snake_case` in `fetchX()` or hook | Match interface shape; **avoid `setX(res.data)` directly** |

**Bug shape to watch for**: `setX(res.data)` directly → next edit's PATCH URL becomes `/api/x/undefined` → API parses `Number("undefined")` → `NaN` → Postgres rejects with `invalid input syntax for type bigint: "NaN"`.

## Data hooks — canonical shape (React Query)

Components are **pure UI**. No `useState` for server data, no manual `fetchX`/`useEffect`/refetch-after-mutate. One hook per resource, all using React Query v5.

Reference implementations: `useAdminPortfolio`, `useAdminSocial`, `useAdminTeam`, `useAdminAvailability`, `useInvoices`, `useNotifications`, `useSiteContent`.

```ts
// src/hooks/useAdminFoo.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface Foo { foo_id: number; image_url: string | null; /* ... */ }
export interface FooInput { image_url?: string; /* ... */ }

function mapFoo(r: Record<string, unknown>): Foo {
  return {
    foo_id: (r.fooId ?? r.foo_id) as number,
    image_url: (r.imageUrl ?? r.image_url ?? null) as string | null,
  };
}

function toApiPayload(input: FooInput) {
  return { imageUrl: input.image_url || undefined };
}

const QUERY_KEY = ["adminFoo"];

export function useAdminFoo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await get<Record<string, unknown>[]>("/api/foo"))
      .data?.map(mapFoo) ?? [],
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: FooInput) => {
      const res = await post<Record<string, unknown>>("/api/foo", toApiPayload(input));
      if (res.error) throw new Error(res.error);
      return mapFoo(res.data!);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Foo[]>(QUERY_KEY, (old = []) => [...old, created]);
      toast({ title: "Created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // updateMutation + deleteMutation follow the same shape with optimistic
  // updates: onMutate cancels in-flight, snapshots prev, applies optimistic
  // patch; onError restores prev; onSuccess swaps in server-truth.

  return {
    items,
    isLoading,
    createFoo: createMutation.mutateAsync,
    updateFoo: (id: number, input: FooInput) => updateMutation.mutateAsync({ id, input }),
    deleteFoo: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
```

Component consumers stay tiny:

```tsx
const { items, isLoading, createFoo, updateFoo, deleteFoo, isSaving } = useAdminFoo();
```

The hook owns all mapping at the API boundary so the component never sees camelCase.

## Database tables — singular, never plural

`client`, `project`, `team_member`, `portfolio_project` — **never** `clients`, `projects`. URL paths in REST routes (`/api/projects`) stay plural per REST convention; tables don't.

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
