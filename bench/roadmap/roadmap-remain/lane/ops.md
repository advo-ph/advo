# Lane ops

branch: `lane/ops`
worktree: `C:/Users/maran/Antigravity/advo-lane-ops`
port: `6447`
builder: `grok`

## Ships

Vertex brand-analysis is gone; PWA is installable; backup docs stay green.

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6447/`.

## Item

- `brand-analysis-gone`
- `monitor-backup`
- `pwa-install`

## Owns

- `apps/api/src/routes/brand-analysis.routes.ts`
- `apps/api/src/services/brand-analysis.service.ts`
- `apps/web/src/test/brand-analysis-decommission.test.ts`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/public/manifest.webmanifest`
- `docs/SETUP.md`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — brand-analysis-gone, monitor-backup, pwa-install PASS
