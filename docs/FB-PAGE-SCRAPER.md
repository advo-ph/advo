# Facebook page scraper

Code: `apps/api/src/scrapers/fb-page/` · API: `POST /api/scrape/facebook-page` (+ `GET …/:id`) · tests: `apps/api/src/test/fb-page.test.ts`

## Rules
- **Attach-only.** It drives an already-signed-in Chrome over CDP (`FB_CDP_URL`). It never logs in, never launches a browser, never touches a profile dir. Logged out ⇒ it stops (`stop=logged-out`) instead of scraping a login wall.
- **One job at a time** (one account). Page loads are budgeted per hour (`page_load_per_hour`, default 120) and gated on host load (`FB_MAX_LOAD_PER_CPU`, default 4).

## Layers (all feed one ledger)
SSR script blobs → `/api/graphql` responses while scrolling → rendered permalinks → per-post permalink visit (comments; skipped when the captured count already meets Facebook's).

## Acceptance gate (`audit`)
authenticated · no-rate-limit · nonempty · unique-id · no-content-duplicate · dated · engagement-present · comment-coverage (≥80% of commented posts) · comment-not-overcount · chronological · converged.
Comment counts are advisory, not equality: Facebook's counter includes comments it refuses to render (hidden/spam/filtered replies).

## Storage (migration 062)
`fb_page` · `fb_scrape_run` · `fb_post` · `fb_post_snapshot` · `fb_comment`. The API job persists its result itself (`persistRun`, one transaction). A finished CLI directory is loaded with:
```
node --env-file=.env --import tsx src/scrapers/fb-page/import.ts <out-dir> <page-url> [--client <client_id>]
```
Re-importing is idempotent for posts/comments and adds one run + one snapshot per post (that is the growth history). Production DB: apply `migrations/022_fb_page.sql` first.

## CLI
```
npx tsx src/scrapers/fb-page/cli.ts <page-url> --cdp http://127.0.0.1:<port> --out <dir> [--no-deep] [--skip-feed] [--about-only] [--max-round N]
npx tsx src/scrapers/fb-page/cli.ts <url> --offline <saved.html|json> --out <dir>
```
Writes `post.json`, `page.json`, `analysis.json`, `audit.json`, `brand-debrief.md`, and a resumable `checkpoint.json`.

## Known limits
- Replies/comments Facebook does not render to the viewer are not capturable; expect ~80% of the raw counter.
- Page like count and exact follower count are not exposed (header shows "3.2K").
- Legacy routes `/facebook-full` and `/facebook-stream` (`fb-scrape.routes.ts`) are unchanged: they launch their own browser from a session file.
