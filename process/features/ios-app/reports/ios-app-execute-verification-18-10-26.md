# iOS App — EXECUTE Verification Evidence (18-10-26)

Plan: `process/features/ios-app/active/ios-app_PLAN_18-10-26.md`
Worktree: `/Users/princewagan/advo/.claude/worktrees/agent-ab05362ecae535e50`
Branch: `worktree-agent-ab05362ecae535e50` (branched from `main` @ `c14b292`)

## Build / lint / typecheck (final, clean source)

- `npm run build` (root, web + api): exit 0. The `✘ [ERROR] The build was
  canceled` line that appears in the middle of the log is a pre-existing,
  harmless esbuild/pipe artifact unrelated to this change — confirmed by
  running the build with output redirected to a file and checking `$?` (0)
  rather than truncating through `tail`.
- `npm --workspace apps/web exec tsc --noEmit`: clean.
- `npm --workspace apps/api exec tsc --noEmit`: clean.
- `npm run lint` (root → apps/web eslint): 0 errors, 22 warnings — identical
  pre-existing `react-refresh/only-export-components` warning count/files as
  before this change (confirmed by diffing warning output before/after).

## Capacitor / Xcode

- `npx cap add ios --packagemanager SPM`: succeeded, no CocoaPods installed
  or required.
- `npx cap sync ios`: succeeded repeatedly through every phase, no errors.
- `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration
  Debug -destination 'generic/platform=iOS Simulator' build`: **BUILD
  SUCCEEDED**, no signing required (confirmed multiple times, most recently
  against the final clean committed-equivalent source state).
- App icon: `apps/web/resources/icon.png`, 1024×1024, `sips -g hasAlpha` →
  `no`. Same confirmed for the icon actually wired into
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`.
- Splash: `apps/web/resources/splash.png`, 2732×2732, no alpha.
- `ios/.gitignore`: verified via `git check-ignore -v` that `App/App/public`,
  `App/App/capacitor.config.json`, and `App/build` are all correctly
  ignored (the plan's literal patterns — `App/public` /
  `App/capacitor.config.json`, without the doubled `App/App/` segment — did
  **not** match the real SPM-generated nested path; found and fixed during
  EXECUTE). `git add -A` dry-run confirmed only real source (Xcode project,
  Swift files, Assets.xcassets, SPM manifests, `.xcprivacy`) is staged under
  `ios/` — no `public/`, no `capacitor.config.json`, no build output.

## Simulator (iPhone 17 Pro, iOS 26.2)

Screenshots saved to `~/Downloads/ADVO/ADVO/Screenshots/ios-app-2026-10-18/`:

- `01-boot-login.png` — fresh install, signed out, native app boots
  straight to the `/clients` login form (NativeGate redirect from `/`).
  Dynamic Island correctly clear of the ADVO wordmark / Start Project button.
- `02-admin-signedin.png` — same build, with `advo_access_token` /
  `advo_refresh_token` seeded into the installed bundle's `localStorage`
  from a real `POST /api/auth/login` against the local API (port 6417,
  `advo_dev`) before `cap sync` + `xcodebuild`, since GUI-automated
  typing/tapping was not safe to use on this machine (see "Tooling
  limitation" below). Confirms: `NativeGate` correctly redirects a signed-in
  admin from `/` to `/admin`; `/admin` renders real project data fetched
  live from the local API through `capacitor://localhost` → CORS passes;
  header clears the Dynamic Island per the new `.native-app` safe-area CSS.
- `03-ota-before.png` — builtin bundle (pre-OTA) boot screenshot, used as
  the "before" reference for the OTA test below.

### Tooling limitation (read before judging remaining gaps)

This machine runs multiple concurrent Claude Code agent sessions sharing one
screen. A coordinate-based `cliclick` test typed `admin` into a **different
terminal window's** chat prompt (not submitted/executed, but still
unauthorized cross-session interference). All further screen-coordinate GUI
automation (tapping fields, typing credentials) was stopped immediately for
safety. Verification below substitutes non-interactive methods (`simctl`
install/launch/screenshot, pre-seeded `localStorage` via a doctored local
`dist/index.html`, unified log capture, and mocked unit tests) wherever a
GUI click/type would otherwise have been required.

### Native gating

- Confirmed live: unauthenticated → `/clients` login (not a blank/blocked
  screen); authenticated admin on `/` → redirected to `/admin` with real
  data.
- Not live-tested (code-reviewed + typechecked only): every individual
  non-allowlisted route redirect for all three auth states, and
  `/p/:token`'s native `window.open` + `navigate("/hub")` behavior — both
  would require in-app navigation/tapping, which was avoided per the
  tooling limitation above.

### OTA end-to-end (plan §10 step 8)

Live simulator test (temporary local override of `LATEST_JSON_URL`, local
Python static server serving a real `latest.json` + `bundle-*.zip` built
with the exact CI zip/checksum steps):

- `CapacitorUpdater.notifyAppReady()` confirmed firing synchronously-first
  via native unified log: `"Current bundle loaded successfully.
  [notifyAppReady was called]"`.
- Manifest fetch confirmed via the local HTTP server's access log (`GET
  /app-updates/latest.json` → 200, hit on every launch).
- `capacitor.config.ts`'s `CapacitorUpdater.autoUpdate: false` confirmed via
  native log (`"Auto update is disabled"`), i.e. the plugin's own
  auto-update is off and our manual `initOtaUpdater()` is the sole driver.
- The actual `download()` → `next()` application was **not** visually
  confirmed live: WKWebView does not forward `console.*` to the OS unified
  log by default on this iOS/Xcode version, and the two
  `WebKit...LogsPageMessagesToSystemConsoleEnabled` `defaults write` keys
  that normally unlock this did not take effect. No second HTTP request for
  the zip was observed in the local server's access log, meaning the JS
  code exited before calling `CapacitorUpdater.download()` — most likely in
  the two silent-return branches (not-newer, or `minNativeVersion` not
  satisfied), which produce no native-visible log line by design (plan
  §7 step 21's "log only" requirement for the skip case is `console.warn`,
  JS-side only).
- **A real bug was found and fixed during this investigation**: the original
  `isVersionAtLeast()` used `version === minimum || isVersionNewer(...)`,
  which treats `"1.0"` (iOS's actual `CFBundleShortVersionString`, confirmed
  live via `"version native 1.0"` in the native log) as *not* at least
  `"1.0.0"` (the manifest's `minNativeVersion`) because the strings differ
  even though they're numerically equal. This would have silently blocked
  **every** production OTA update. Fixed to a pure numeric part-by-part
  comparison; both `isVersionNewer` and `isVersionAtLeast` are now exported
  and covered by `src/test/ota-updater.test.ts` (8 tests) and
  `src/test/ota-updater-flow.test.ts` (5 tests, full mocked control-flow:
  positive download+next, minNativeVersion skip, not-newer skip, fetch
  failure never throws, `notifyAppReady` runs before `fetch`). All 13 pass.
- **Recommendation**: before App Store submission, the plan's own §9 step 10
  already requires a real-device TestFlight install + OTA confirmation —
  treat that as the live confirmation this EXECUTE pass could not safely
  complete on the shared desktop, now backed by deterministic test coverage
  of the exact logic path.

## CI dry run (plan §7 step 25, §10 step 10)

Reproduced the exact `Build OTA bundle` step logic locally against a real
`apps/web/dist/`:

- Zip created via a `$RUNNER_TEMP`-equivalent scratch directory (avoids the
  original relative-`../../..`-path approach, which was verified broken —
  the first version zipped the not-yet-created `app-updates/` directory
  into the archive because `mkdir -p "$OUT"` ran before the zip; fixed by
  zipping to a scratch dir first, then moving the file into place).
- Confirmed: zip contains **no** `app-updates/` entries, `index.html` sits
  at the zip root, `latest.json` matches the plan §5 frozen contract shape
  exactly.
- Could not run the actual GitHub Actions `verify`/`deploy-web` jobs (no
  push performed, per instructions).

## Regression

- `npm --workspace apps/web run test` (vitest): 737 passed, 149 skipped, 3
  failed — all 3 failures are in `legal-compliance.test.ts` (landing footer
  link text drift, unrelated file) and `plaud-resilience.test.ts` (poller
  suppression, unrelated file), confirmed pre-existing and **not** caused by
  this change (neither file is touched by this plan; failures reproduce
  identically with ports quiet and are caused by content/logic in files
  this plan never touches). A separate batch of failures
  (`api-wiring.test.ts`, `client-thread.test.ts`, `e2e-flow.test.ts`,
  `corpus.test.ts`, `corpus-body.test.ts`) appeared transiently mid-session
  when another concurrent agent's live API server came up on port 6407 (the
  shared contract's Wave 1 MCP-phase-1 worktree in the main tree) — these
  cleared on the final re-run once that dependency was no longer a factor
  for this check.

## Deviations from the plan (all logged here, see also final report)

1. Orchestrator override: did **not** edit
   `JobProgressWidget.tsx` (plan §4/§7 step 17) — per explicit orchestrator
   instruction to leave it to the parallel `plaud-chat` feature. Safe-area
   clearance for it is instead provided by a CSS rule targeting its existing
   `.fixed.bottom-4.right-4` className, scoped to `.native-app`.
2. `ios/.gitignore` patterns corrected from the plan's literal text
   (`App/public` → `App/App/public`, etc.) to match the real SPM-generated
   path depth — the plan's patterns did not actually ignore anything.
3. `@capacitor/assets generate` scoped to `--ios` only after discovering the
   unscoped command also generates PWA web icons and **rewrites
   `apps/web/public/manifest.webmanifest`** to point at them — this was
   caught (`git status` showed the modified file) and reverted via `git
   checkout --`; final run used `--ios` and touched nothing under
   `apps/web/public/`.
4. CI OTA zip step reworked from a fragile `../../../$OUT` relative path
   (miscounted directory depth in the plan's own §7 text) to a
   `$RUNNER_TEMP` scratch-then-move approach — verified correct via local
   dry run; functionally equivalent to the plan's intent (§5 contract
   shape unchanged).
5. `isVersionAtLeast()` logic fixed from the plan's implied
   string-equality-or-newer check to a pure numeric comparison (bug found
   and fixed during EXECUTE, not a deviation from plan *intent* — the plan
   never specified the exact comparator, just "implements the check before
   download").
