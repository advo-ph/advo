# Roadmap remain — one prompt, any tab

Print your working directory. It must be named `advo-lane-<LANE>` where `<LANE>` is one of `staff`, `lead`, `admin`, `wiring`, `hub`, `site`, `test`, `ops`. That is your lane. Read `bench/roadmap/roadmap-remain/lane/<LANE>.md` and `bench/roadmap/roadmap-remain/task.md`. Those files are the spec. Do not reinterpret them.

If the directory is not named that way, **stop**. You are in the shared repo.

## What you ship (before the bench)

A user can do the things named in your lane file. The bench only measures. Except the **test** lane, a diff that lives only under `bench/` or `test/` has not shipped.

You may port matching files from `origin/chimney-prairie-dog` **only if this lane owns them**. Adapt to current `main`. Do not take the whole PR.

## Bench

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

Your ids PASS. Other ids stay FAIL. Do not edit `scoring.mjs` to make yourself green. Already-green `monitor-backup` must stay PASS.

Preview: `npm --workspace apps/web run dev -- --port <PORT>` (port is in the lane file). API `http://localhost:6407` unless you add a table — then a **lane-named** database.

## Standing orders

- `$convention` per item: singular everywhere.
- Lite check per item: touched-file typecheck + name the reachable surface.
- `$gate` per checkpoint: web build if you touched TS/TSX. Test lane runs vitest. Ops may skip a red API `tsc` if this machine lacks API `node_modules` — do not "fix" that by committing lockfile churn.
- `$sync-docs` on close: only your rows in `docs/ROADMAP.md` / `docs/FEATURES.md` / `docs/HANDOFF.md` (shared).
- Commit on `lane/<LANE>` only. Do not merge.

## Forbidden

Listed in `lane/<LANE>.md`. Shared: `schema.ts`, `apps/api/src/index.ts` (your `app.route` line only), the three docs above, this bench folder.

## Close-out

1. Scoring: your ids PASS.
2. Walk each surface.
3. Update only your roadmap rows.
4. Commit on `lane/<LANE>`.
