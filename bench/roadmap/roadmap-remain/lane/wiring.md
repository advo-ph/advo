# Lane wiring

branch: `lane/wiring`
worktree: `C:/Users/maran/Antigravity/advo-lane-wiring`
port: `6443`
builder: `grok`

## Ships

Settings branding hydrates; Add Admin creates a user; notify rules work or are labeled; dashboard activity is real; social stats are not fake live; team reorder/order are correct.

Surface: see each item in `task.md`. Preview `http://127.0.0.1:6443/`.

## Item

- `w1-branding`
- `w2-admin-user`
- `w3-notify-rule`
- `w4-activity`
- `w5-social-stats`
- `r3-team-reorder`
- `r4-team-order`

## Owns

- `apps/web/src/components/admin/AdminSettings.tsx`
- `apps/web/src/components/admin/AdminNotifications.tsx`
- `apps/web/src/components/admin/AdminDashboard.tsx`
- `apps/web/src/components/admin/AdminSocial.tsx`
- `apps/web/src/components/admin/AdminTeam.tsx`
- `apps/web/src/lib/db.ts`
- `apps/web/src/hooks/useAdminTeam.ts`
- `apps/api/src/routes/team.routes.ts`
- `apps/api/src/routes/notifications.routes.ts`
- `apps/api/src/services/email.service.ts`

## Forbidden

Every file owned by the other seven lanes (see `plan.json`). Shared: `schema.ts`, `apps/api/src/index.ts` (your route line only), `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/HANDOFF.md`.

## Done when

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

node bench/roadmap/roadmap-remain/scoring.mjs — w1-branding, w2-admin-user, w3-notify-rule, w4-activity, w5-social-stats, r3-team-reorder, r4-team-order PASS
