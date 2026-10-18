# iOS App — Final Integration Verification (18-10-26)

Scope: merge `feat/ios-app` worktree output into the `main` tree alongside the already-merged
chat+MCP integration, fix the two native-only bugs flagged from the worktree's own screenshots,
and re-verify end to end. Umbrella: `process/general-plans/active/integration_UMBRELLA_PLAN_18-10-26.md`
§4 item 5(c)/8.

Plan: `process/features/ios-app/active/ios-app_PLAN_18-10-26.md`
Prior worktree evidence: `process/features/ios-app/reports/ios-app-execute-verification-18-10-26.md`

## 1. Dependency reconciliation

`package-lock.json` was the one file both the chat+MCP integration pass and the iOS worktree
touched independently. `npm install --no-audit --no-fund` at the repo root (151 initial packages,
then full reconcile) produced a lockfile that includes both the `@modelcontextprotocol/sdk`
(MCP) and the full `@capacitor/*` + `@capgo/capacitor-updater` (iOS) dependency trees —
`node_modules/@capacitor/{app,assets,cli,core,ios,splash-screen,status-bar}` and
`node_modules/@capgo/capacitor-updater` all present; `node_modules/@modelcontextprotocol/sdk`
unaffected. `git diff package-lock.json` is purely additive (2883 insertions / 37 deletions, the
deletions being lockfile metadata churn, not package removal).

## 2. Dev servers

- API (port 6407, PID unchanged, `tsx watch`) was already running current source — `tsx watch`
  picks up file changes automatically, confirmed via `/api/health` returning 200 before and
  after this pass.
- Web (port 6400) was restarted (old PID killed, `npx vite --port 6400` relaunched from
  `apps/web/`) after `npm install` so it picks up the newly installed Capacitor/MCP deps.
  `curl http://localhost:6400/` → 200. Headless Playwright console check: zero errors from
  `main.tsx`, `registerSw.ts`, or `otaUpdater.ts` (the one console entry present is a
  pre-existing, unrelated `fetchPriority` DOM-attribute warning from `LandingPage.tsx`, confirmed
  reproducing in the clean root `npm run build` output too — not caused by this pass).

## 3. Two native-only bugs found and fixed

### 3a. Double top safe-area padding (`02-admin-signedin.png` in the worktree's own evidence)

Root cause confirmed: `apps/web/capacitor.config.ts` had `ios: { contentInset: "automatic" }`
(from the plan's own Phase A step 2), which lets UIKit auto-inset the WKWebView's content *in
addition to* the CSS `env(safe-area-inset-top)` padding already applied by
`.native-app header.fixed.top-0.left-0.right-0.z-50` in `index.css` (added in Phase B step 18) —
two independent top-padding mechanisms stacked, producing the large empty band above the ADVO
wordmark/header seen in the screenshot.

Fix: `ios.contentInset` changed from `"automatic"` to `"never"` (Capacitor's own default) in
`apps/web/capacitor.config.ts`. The WKWebView now draws edge-to-edge under the status bar/notch,
and the one CSS mechanism in `index.css` owns all safe-area clearance — matches the plan's own
decision text at §3 ("the circle is inscribed...", not directly, but the general "one mechanism,
CSS owns it" intent implied by the Phase B CSS-scoping comment).

### 3b. Marketing CTA reachable on the native login screen (`01-boot-login.png`)

Root cause confirmed: `/login` → `/clients` renders `<Login variant="clients">` inside
`LandingShell` (`apps/web/src/components/landing/landing-shell.tsx`), which always mounts
`<LandingNav anchorPrefix="/" />` — the same header used on the public marketing site, complete
with the "Start a project" CTA button and the full marketing nav link list
(`landingNavLinks`). `NativeGate`'s allowlist explicitly includes `/login`/`/members`/`/clients`
and the four legal pages, all of which route through this same shell/header, so the native app's
"members-only" boundary was leaking a lead-gen CTA in front of signed-out users.

Fix: `apps/web/src/components/LandingNav.tsx` now imports `isNativeApp` from `@/lib/platform`
and wraps the `<nav>` (marketing links) and `<div className="landing-nav-action">` (the CTA) in
`{!isNativeApp() && (...)}`. The brand/logo link is left untouched (native users still see the
ADVO wordmark; tapping it is a no-op in practice since `NativeGate` would redirect `/` right back
to `/login` or `/admin`/`/hub` depending on auth state). Web at advo.ph is byte-for-byte
unaffected — `isNativeApp()` is `false` in every browser context.

Both fixes are single-mechanism, minimal, and scoped by the same `isNativeApp()`/`.native-app`
gating convention the rest of the iOS plan already established — no new pattern introduced.

## 4. Existing safe-area/overlap handling re-confirmed (no change needed)

- `AdminBottomNav.tsx`: already pads with `pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]`
  unconditionally (harmless 0 inset on web) — clears the home indicator on native without any
  `.native-app` scoping needed.
- `ChatWidget.tsx` (owner-only): already computes `SAFE_BOTTOM` /
  `SAFE_BOTTOM_MOBILE` / `SAFE_RIGHT` from `env(safe-area-inset-*)` inline, and its own comment
  documents it anchors above `AdminBottomNav`'s floating pill on mobile. Confirmed visually in
  the admin screenshot below — the bubble sits clear of the bottom nav bar.
- `JobProgressWidget.tsx`: per the worktree's own logged deviation (orchestrator directive), this
  plan does not touch it directly; `index.css`'s `.native-app .fixed.bottom-4.right-4` rule
  (added by the iOS plan) supplies its safe-area padding by class-shape targeting instead.

## 5. Root verification (after dependency reconciliation + the two fixes above)

- `npm run build` (root: web typecheck + `vite build` + prerender, api `tsc`) — **exit 0**.
  Production build output confirms `dist/sw.js` + `dist/workbox-*.js` generated (service worker
  registers in a normal browser production build, per plan's web/native split — unaffected by
  the native-only `injectRegister: null` change since that only stops *auto*-injection; the
  manual `registerWebServiceWorker()` path, exercised whenever `!isNativeApp()`, is what actually
  runs the build's generated `sw.js`).
- `npm run lint` — **0 errors**, 22 pre-existing `react-refresh/only-export-components` warnings
  (identical file list to the chat+MCP integration pass's own lint run).
- `./scripts/test-local.sh` (reused the already-running API on 6407) — first run: 896
  passed/8 failed (one extra failure, `e2e-flow.test.ts`'s "concurrent refreshes all succeed and
  converge on one token", `Error: Test timed out in 5000ms`) — reproduced the suspicion of
  resource-contention flakiness (this machine had just finished an `npm install` of ~150
  packages plus a dev-server restart) by re-running `e2e-flow.test.ts` alone: only the 2 known
  pre-existing failures reproduced, the timeout did not. Full suite re-run: **897 passed / 7
  failed / 3 skipped (907 total)** — the 7 failures are the exact pre-existing baseline (legal
  footer copy mismatch, `plaud-resilience.test.ts` ×2, `client-thread.test.ts` ×2,
  `e2e-flow.test.ts` ×2 — magic-link enumeration status code + avatar URL path format). **0 new
  failures.** This plan's own 13 OTA tests (`ota-updater.test.ts` 8 + `ota-updater-flow.test.ts`
  5) confirmed passing in isolation and inside the full run.

## 6. Native build + Simulator verification

- `npm --workspace apps/web run cap:sync` with `VITE_API_URL=http://localhost:6407` (local test
  build only, per instruction) — `vite build` + `npx cap sync ios` succeeded, no errors, no
  CocoaPods requirement (SPM only, matching the worktree's own earlier confirmation).
- `apps/web/ios/App/App.xcworkspace` does not exist (SPM project, no CocoaPods generates a
  workspace) — used `apps/web/ios/App/App.xcodeproj` instead, matching the worktree's own
  execution report's precedent. `xcodebuild -project apps/web/ios/App/App.xcodeproj -scheme App
  -configuration Debug -destination 'generic/platform=iOS Simulator' build` → **BUILD SUCCEEDED**
  (universal binary, arm64 + x86_64 slices, confirmed via `file`).
- Booted the iPhone 17 Pro simulator (`36176EC0-D304-4877-9047-B464A2DEA586`) via `xcrun simctl
  boot` only — no coordinate-based GUI automation used anywhere in this pass, per the explicit
  safety instruction (this machine runs other concurrent agent sessions).
- Screenshots saved to `~/Downloads/ADVO/ADVO/Screenshots/ios-app-final-2026-10-18/`, each
  inspected visually before reporting:
  - `01-boot-login.png` — fresh install, signed out, native `/clients` login screen. **Confirms
    fix 3b**: no "START PROJECT" button, no marketing nav links in the header — only the ADVO
    wordmark remains.
  - `02-admin-signedin.png` — signed in as the real owner `admin` (session seeded via a
    temporary, non-committed `localStorage` injection into the locally-built `dist/index.html`
    before `cap sync`/`xcodebuild`, the same non-GUI technique the worktree's own execution used,
    documented inline as a removed-before-final-rebuild comment; a real
    `POST /api/auth/login` against the local API on 6407 supplied the tokens). **Confirms fix
    3a**: the header sits directly under the Dynamic Island with no empty band. Also confirms the
    ChatWidget bubble (bottom-right) renders clear of `AdminBottomNav`'s floating pill with no
    overlap.
  - `03-chat-panel-open.png` — the chat panel's mobile full-screen sheet, Updates tab active,
    opened via a temporary one-line `useState(true)` default on `ChatWidget.tsx`'s `isOpen` state
    (reverted immediately after the screenshot, confirmed via `git diff` showing zero net change
    to the file before moving on) rather than any GUI tap — the close button, tab bar, and status
    bar are all visible and unobstructed, confirming the sheet's own safe-area handling.
- **Native gating / route-redirect behavior per auth state**: not independently re-exercised this
  pass beyond what the two screenshots above directly demonstrate (signed-out → `/clients`;
  signed-in admin → `/admin`) — this matches the worktree's own execution report's documented gap
  (no GUI tap/type automation available on this shared machine) and remains an open item for the
  user's own real-device TestFlight pass per plan §9 step 10.
- Final rebuild: reverted the temporary `ChatWidget.tsx` dev flag (file now has zero net diff for
  that line), ran `npm --workspace apps/web run cap:sync` with `VITE_API_URL=https://api.advo.ph`
  (matching CI's own `Build` step env, **not** the local-test override — confirmed
  `dist/index.html` and the generated `ios/App/App/capacitor.config.json` contain no `localhost`
  string anywhere), rebuilt via `xcodebuild` (**BUILD SUCCEEDED**), then shut the simulator down
  (`xcrun simctl shutdown`).

## 7. Deviations from plan (additive to the worktree's own logged deviations)

1. Two new native-only bugs (double safe-area top padding; marketing CTA on native login) found
   during this integration pass's screenshot inspection, not caught during the worktree's own
   isolated EXECUTE — fixed per §3 above. Both fixes are additive, single-mechanism, and consistent
   with the plan's own `isNativeApp()`/`.native-app` conventions; no plan section needed
   revision, this is squarely inside §7 step 18 / §10 step 7's "exact additional selectors
   confirmed [in Simulator], not guessed" allowance.
2. `.xcworkspace` does not exist for this SPM-only project; used `.xcodeproj` instead (same
   substitution the worktree's own execution already made and documented).
3. One transient test failure (`e2e-flow.test.ts`'s concurrent-refresh timeout) on the first full
   suite run, confirmed as resource-contention flakiness (did not reproduce on a file-scoped
   re-run or the full-suite re-run) — not a regression, not counted toward the 0-new-failures bar.

## 8. Outstanding / explicitly not done this pass

- Real-device TestFlight install + live OTA confirmation (plan §9 step 10) — requires the user's
  own Apple Developer account/signing, out of scope for this pass per the plan's own "hard stop
  before App Store submission" handoff note.
- Full per-route `NativeGate` allowlist redirect matrix (every non-allowlisted route × all three
  auth states) — still code-reviewed/typechecked only, not live-clicked, for the same
  shared-machine GUI-automation safety reason documented in the worktree's own report.
