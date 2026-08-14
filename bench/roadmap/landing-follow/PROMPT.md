# Landing follow-through — one prompt, any tab

Print your working directory. It must be named `advo-lane-<LANE>` where `<LANE>` is `copy`, `route`, or `docs`. That is your lane. Then read `bench/roadmap/landing-follow/lane/<LANE>.md` and `bench/roadmap/landing-follow/task.md`. Those files are the spec. Do not reinterpret them.

If the directory is not named that way, **stop**. You are in the shared repo.

## What you ship (before the bench)

A user on the public marketing site sees one white editorial ADVO language. Your lane's surfaces (named in the lane file) are the proof. The bench only measures; it is not the deliverable. A diff that lives only under `bench/` or `test/` has not shipped.

## Bench

```bash
node bench/roadmap/landing-follow/scoring.mjs
```

Green for **your** ids only. Other ids stay red until their lane lands. Do not edit `scoring.mjs` to make yourself green.

Preview (do not edit `vite.config.ts`):

```bash
npm --workspace apps/web run dev -- --port <PORT>
```

`<PORT>` is 6410 (copy), 6420 (route), 6430 (docs). API is the existing `http://localhost:6407`.

## Standing orders

- `$convention` per item: singular everywhere (`landing-shell.tsx`, not `landing-shells`; `socialLink`, not `socialLinks` as a key).
- Lite check per item: touched-file typecheck + name the reachable surface.
- `$gate` per checkpoint (end of your lane): `npm --workspace apps/web run build` and `npm --workspace apps/web run test` if you touched TS/TSX. Docs lane: scoring ids green is enough; do not churn a web build for markdown.
- `$sync-docs` on close: edit **only** your own doc rows. `docs/ROADMAP.md` is shared — update only the rows for your item ids.
- Commit in this repo's voice, on `lane/<LANE>` only.

## Forbidden

The other lanes' owned files. Listed in `lane/<LANE>.md`. If you need one, you are out of bounds — stop.

Do not touch `/admin`, `/hub`, `FloatingNav.tsx` (hub still uses it), `vite.config.ts`, `package-lock.json`, or `bench/roadmap/landing-stripe-audit`.

Do not invent testimonials, a newsletter API, or client logos.

## Close-out

1. Re-run the scoring command. Your ids PASS.
2. Walk each surface you own in the browser.
3. Update only your rows in `docs/ROADMAP.md`.
4. Commit on `lane/<LANE>`. Do not merge.
