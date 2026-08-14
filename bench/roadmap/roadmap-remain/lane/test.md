# Lane test

branch: `lane/test`
worktree: `C:/Users/maran/Antigravity/advo-lane-test`
port: `6446`
builder: `grok`

## Ships

The open coverage table has automated tests (this lane's deliverable is the tests).

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6446/`.

## Item

- `settings-public-test`
- `asset-delete-test`
- `lead-email-test`
- `ai-contract-test`
- `proof-card-test`
- `wiring-method-test`

## Owns

- `apps/web/src/test/api-wiring.test.ts`
- `apps/web/src/test/e2e-flow.test.ts`
- `apps/web/src/test/proof-card.test.ts`
- `apps/web/src/test/contract-ai.test.ts`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — settings-public-test, asset-delete-test, lead-email-test, ai-contract-test, proof-card-test, wiring-method-test PASS
