# Lane staff

branch: `lane/staff`
worktree: `C:/Users/maran/Antigravity/advo-lane-staff`
port: `6440`
builder: `grok`

## Ships

Admin can see per-member project capacity and assign a junior; calendar shows school blackout.

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6440/`.

## Item

- `capacity-view`
- `junior-assign`
- `blackout-calendar`

## Owns

- `apps/api/src/routes/projects.routes.ts`
- `apps/api/src/utils/project-capacity.ts`
- `apps/web/src/components/admin/AdminAvailability.tsx`
- `apps/web/src/components/admin/AdminCalendar.tsx`
- `apps/web/src/components/admin/ProjectCommandCenter.tsx`
- `apps/web/src/hooks/useOrgProjects.ts`
- `apps/web/src/lib/capacity.ts`
- `apps/web/src/lib/project-assign.ts`
- `apps/web/src/test/capacity.test.ts`
- `apps/web/src/test/project-assign.test.ts`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — capacity-view, junior-assign, blackout-calendar PASS
