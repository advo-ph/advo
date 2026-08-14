# Lane hub

branch: `lane/hub`
worktree: `C:/Users/maran/Antigravity/advo-lane-hub`
port: `6444`
builder: `grok`

## Ships

A client can file a change-order from /hub.

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6444/`.

## Item

- `change-order-form`

## Owns

- `apps/web/src/pages/Hub.tsx`
- `apps/web/src/components/hub/ProjectDashboard.tsx`
- `apps/api/src/routes/change-order.routes.ts`
- `apps/api/migrations/009_change_order.sql`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — change-order-form PASS
