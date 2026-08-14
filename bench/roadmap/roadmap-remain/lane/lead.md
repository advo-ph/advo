# Lane lead

branch: `lane/lead`
worktree: `C:/Users/maran/Antigravity/advo-lane-lead`
port: `6441`
builder: `grok`

## Ships

Clinic leads can be imported (sample fixture), filtered by outdated systems, and turned into tracked template proposals.

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6441/`.

## Item

- `lead-import`
- `targeting-rule`
- `proposal-tracker`
- `proposal-pdf`

## Owns

- `apps/web/src/components/admin/AdminLeads.tsx`
- `apps/web/src/components/admin/AdminProposals.tsx`
- `apps/api/src/routes/leads.routes.ts`
- `apps/api/src/routes/proposal.routes.ts`
- `apps/api/src/services/proposal.service.ts`
- `apps/api/migrations/010_proposal.sql`
- `apps/web/src/lib/targeting.ts`
- `apps/web/src/lib/proposal-tracker.ts`
- `scripts/import-clinic-lead.ts`
- `data/clinic-lead/sample.json`
- `apps/web/src/test/targeting.test.ts`
- `apps/web/src/test/proposal-tracker.test.ts`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — lead-import, targeting-rule, proposal-tracker, proposal-pdf PASS
