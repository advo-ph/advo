# Lane admin

branch: `lane/admin`
worktree: `C:/Users/maran/Antigravity/advo-lane-admin`
port: `6442`
builder: `grok`

## Ships

Library, full-page project/client forms, collapsed Tools scrapers, /p/:token preview, controlled asset type, scraper history delete.

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6442/`.

## Item

- `library`
- `project-form`
- `client-form`
- `scraper-submenu`
- `preview-route`
- `r2-asset-select`
- `w7-scrape-delete`

## Owns

- `apps/web/src/pages/Admin.tsx`
- `apps/web/src/components/admin/AdminSidebar.tsx`
- `apps/web/src/components/admin/AdminProjects.tsx`
- `apps/web/src/components/admin/AdminClients.tsx`
- `apps/web/src/components/admin/AdminLibrary.tsx`
- `apps/web/src/components/admin/AdminBrandScraper.tsx`
- `apps/web/src/components/admin/AdminFacebookScraper.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/PreviewLink.tsx`
- `apps/web/src/hooks/usePreviewLink.ts`
- `apps/api/src/routes/library.routes.ts`
- `apps/api/migrations/011_library_item.sql`
- `apps/web/src/lib/library.ts`
- `apps/web/src/lib/project-form.ts`
- `apps/web/src/test/library.test.ts`
- `apps/web/src/test/preview-link.test.ts`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — library, project-form, client-form, scraper-submenu, preview-route, r2-asset-select, w7-scrape-delete PASS
