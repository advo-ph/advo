# Gates: tasks board ordering and bounded columns

OWNS: apps/web/src/components/admin/AdminTasks.tsx, apps/web/src/hooks/useAdminDeliverables.ts, apps/api/src/routes/deliverables.routes.ts, apps/api/src/db/schema.ts, apps/api/migrations/048_deliverable_sort_order.sql, apps/web/src/test/tasks-board.test.ts

Scope: make the Tasks board default to My Tasks, give each status list its own viewport-height scroll area, support team-wide drag reordering with durable shared order, preserve order across edits/deletes, and place new tasks at the top.

- [x] G1: the web application typechecks after the task-board change
  CHECK: npm --workspace apps/web run typecheck && printf 'tasks board typecheck passed\n'
  EXPECT: tasks board typecheck passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=f9c46e28a7f5/27 entries; output=> tsc --noEmit -p tsconfig.app.json | tasks board typecheck passed

- [x] G2: the web lint suite passes after the task-board change
  CHECK: npm --workspace apps/web run lint && printf 'tasks board lint passed\n'
  EXPECT: tasks board lint passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=f9c46e28a7f5/27 entries; output=✖ 18 problems (0 errors, 18 warnings) | tasks board lint passed

- [x] G3: the task-board ordering regression tests pass
  CHECK: npm --workspace apps/web run test -- --run src/test/tasks-board.test.ts && printf 'tasks board tests passed\n'
  EXPECT: tasks board tests passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=f9c46e28a7f5/27 entries; output=Duration  340ms (transform 13ms, setup 40ms, collect 8ms, tests 1ms, environment 202ms, prepare 27ms) | tasks board tests passed

- [x] G4: the production web build passes after the task-board change
  CHECK: npm --workspace apps/web run build && printf 'tasks board build passed\n'
  EXPECT: tasks board build passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=f9c46e28a7f5/27 entries; output=- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks | - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

- [x] G5: the API application typechecks after the task-board change
  CHECK: npm --workspace apps/api run build && printf 'tasks board API build passed\n'
  EXPECT: tasks board API build passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; path=f9c46e28a7f5/27 entries; output=> tsc | tasks board API build passed

- [x] G6: the rendered Tasks board has bounded, independently scrollable columns and the requested ordering interactions work in a real browser
  EVIDENCE: Playwright verification at 1440x900 and 390x844 in /tmp/ui-verify/tasks-round-3/: desktop columns stayed 664px tall with independent overflow, mobile stayed viewport-bounded with a 560px scroll area, document overflow was absent, and drag, edit, delete, create-top, and reload persistence checks passed with no console/API errors.
