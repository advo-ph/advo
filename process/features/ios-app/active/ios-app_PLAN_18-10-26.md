# iOS App (Capacitor + Self-Hosted OTA) — Implementation Plan

**Feature:** ios-app
**Complexity:** COMPLEX
**Date:** 18-10-26 (re-verified against `main` tip `c14b292`, 2026-10-18)
**Plan file:** `process/features/ios-app/active/ios-app_PLAN_18-10-26.md`
**Execution worktree:** its own git worktree on branch `feat/ios-app` (per shared cross-feature
contract). Local API for this worktree runs on port 6417 against `advo_dev`. iOS reserves no
new migration.

**Status (18-10-26, final integration pass): MERGED into `main` tree and re-verified.** The
`feat/ios-app` worktree patch (minus `package-lock.json`, reconciled separately) and
`apps/api/src/index.ts`'s 3-way CORS merge landed in the main tree alongside the chat+MCP
integration (see `process/general-plans/active/integration_UMBRELLA_PLAN_18-10-26.md` §4). Two
native-only bugs found in the worktree's own screenshots were fixed in this pass (see
`process/features/ios-app/reports/ios-app-integration-final-18-10-26.md` for full evidence):
double top safe-area padding (`capacitor.config.ts`'s `ios.contentInset` changed from
`"automatic"` to `"never"`) and a marketing "Start a project" CTA + nav links reachable on the
native login/legal screens (`LandingNav.tsx` now hides both when `isNativeApp()`). Root build,
lint, and `test:local` all green with 0 new failures (897 passed / 7 failed, the exact
pre-existing baseline / 3 skipped — includes this plan's own 13 OTA tests). Native Simulator
build (iPhone 17 Pro) succeeded and was reinstalled/relaunched 3 times for screenshot evidence;
simulator shut down at the end. Still gated on the user's own Xcode/App Store Connect steps
(§9) before any real submission — nothing in that section was touched by this pass.

---

## 1. Overview

Package the existing ADVO members web app (`apps/web`, Vite+React+TS) as a native iOS app
using Capacitor, with the full web bundle shipped **inside** the app (not a remote-URL wrapper),
plus a **self-hosted, free, no-cloud** OTA live-update mechanism via `@capgo/capacitor-updater`
so that every push to `main` ships new JS/CSS/HTML to installed devices without App Store review.

The native app is **members-only**: an allowlist of login/app routes stays reachable; everything
else redirects to login or the signed-in landing page. The public website at `https://advo.ph`
(served by the same `apps/web/dist` build via the existing CI → VPS rsync pipeline) is
**unchanged** — same artifact, runtime branch only.

User already has a paid Apple Developer account; Xcode signing/archiving/TestFlight/App Store
Connect steps are the user's own manual actions (§9), never scripted or hardcoded (no team ID
in any committed file).

**User decisions already locked in (do not reopen in EXECUTE):**
- Password login in the native app; magic-link stays web-only (documented limitation, not a bug).
- `appId: "ph.advo.app"`.
- App icon is generated from the current ADVO round mark (`apps/web/public/favicon.svg`) — no
  new user art needed.
- OTA publish steps live inside the existing `verify` CI job (not a separate job).

---

## 2. Goals / Non-Goals

**Goals**
- `apps/web/ios/` Xcode project (Capacitor, SPM package manager — no CocoaPods) that builds,
  signs, and runs the real app in Simulator and on device.
- Native shell loads the bundled `dist/` build from disk (`capacitor://localhost` origin), not
  `https://advo.ph` in a WebView.
- The web app's existing service-worker (vite-plugin-pwa) registration is suppressed inside the
  native shell so it never competes with the OTA updater for control of cached assets; web
  behavior at advo.ph is untouched.
- OTA pipeline: CI (`.github/workflows/ci.yml`) builds `apps/web/dist` once (as today, same
  `Build` step), additionally zips it, publishes `latest.json` + the zip under
  `https://advo.ph/app-updates/`, and the existing rsync step ships both the human site and the
  OTA artifacts in the same deploy.
- App checks `https://advo.ph/app-updates/latest.json` on launch/foreground, downloads a newer
  bundle with `CapacitorUpdater.download()`, and applies it on next background/relaunch with
  `CapacitorUpdater.next()` (no mid-session reload, no App Store review).
- Members-only gating works correctly for client, team, and admin roles inside the native shell
  via an explicit **allowlist** (not a denylist of the ever-growing public route list); web
  experience at advo.ph is byte-for-byte unaffected by native-only code paths.
- App Store review readiness: privacy manifest entries, demo reviewer account instructions, and
  a documented decision on Guideline 5.1.1(v) account deletion (§8, resolved as "not applicable").

**Non-Goals**
- Universal Links / deep-linking the email magic-link flow into the native app (§8 item 1,
  documented limitation).
- Android (Capacitor setup does not block adding it later; nothing is tested here).
- Push notifications, deep linking beyond what's listed, native biometrics.
- Changing anything in files already dirty in the working tree at plan time
  (`apps/api/src/db/schema.ts`, `apps/api/src/routes/content.routes.ts`,
  `apps/web/src/components/admin/AdminPortfolio.tsx`, `apps/web/src/hooks/useAdminPortfolio.ts`,
  `apps/api/migrations/005_portfolio_enabled.sql`) — EXECUTE re-checks `git status` for these
  exact paths before touching anything, since the worktree is a fresh checkout and these may or
  may not still be dirty there.

---

## 3. Research Facts Confirmed On Current `main` (c14b292)

- **`vite-plugin-pwa` is live** in `apps/web/vite.config.ts` (`registerType: "autoUpdate"`,
  `injectRegister: "auto"`, `manifest: false`, `workbox.navigateFallback: "/index.html"`,
  `runtimeCaching` NetworkOnly for `/api/*`). With `injectRegister: "auto"` the plugin injects
  its own SW-registration script into the built `index.html` — this would run unmodified inside
  `capacitor://localhost` too, registering a second caching/update system (browser Service
  Worker + `navigateFallback`) stacked on top of the Capacitor OTA updater. Two systems racing to
  own "what HTML/JS is currently active" is the exact failure mode this plan must avoid.
  **Fix**: set `injectRegister: null` so the plugin never auto-injects, then register the SW
  manually via the `virtual:pwa-register` module **only when `!isNativeApp()`** — web behavior
  (auto-registration, `autoUpdate`) is preserved byte-for-byte; the native shell never calls
  `navigator.serviceWorker.register(...)` at all. Additionally, at native boot, defensively call
  `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))` once
  — cheap and harmless if none exist, but protects against a stale SW from any earlier manual
  test build of the WebView.
- **`apps/web`'s `npm run build` = `typecheck && vite build && node scripts/prerender.mjs`**.
  `prerender.mjs` writes `dist/<page>/index.html` for every public route, `sitemap.xml`,
  `llms.txt`/`llms-full.txt`, and **fetches live API data at build time**
  (`VITE_API_URL`/`https://api.advo.ph` by default) to prerender project/portfolio content.
  Decision: native local iteration (`npm run cap:sync`) uses **plain `vite build`** — the
  members-only app shell has no SEO/crawler need for prerendered public-page HTML, and skipping
  `prerender.mjs` avoids a network dependency during local `cap sync` loops. CI's OTA zip, by
  contrast, is made from the **full CI `dist`** (after the existing `Build` step, which already
  runs the full `npm run build` including prerender) — the extra prerendered HTML files are
  harmless dead weight inside the OTA bundle (the app never navigates to them via `fetch`/XHR,
  only via its own router), and `index.html` is still at the zip root, which is the only file the
  WebView actually loads. No new build invocation is added to CI; `VITE_APP_VERSION` is set on
  the **existing** `Build` step's `env:` block (single build, no double-build version drift).
- **`index.html` already has `viewport-fit=cover`** on the viewport meta tag (comment explains
  it's required for `env(safe-area-inset-*)` to report real values). No change needed — dropped
  from the checklist.
- **Icons**: `apps/web/public/icon-512.png` (RGBA) and `icon-512-maskable.png` (RGB) are both
  512×512; `apple-touch-icon.png` is 180×180. A usable **vector source exists**:
  `apps/web/public/favicon.svg` — a 100×100 viewBox, dark radial-gradient circle
  (`#262626`→`#0f0f0f`) with a white "A" glyph path, matching the manifest's
  `background_color: "#0A0A0A"` / `theme_color: "#0c0c0c"`. The circle is inscribed in the square
  (touches all four edge midpoints) so the four **corners are transparent** in the raw SVG — the
  App Store icon requires **zero alpha**, so EXECUTE must rasterize at 1024×1024 onto an opaque
  `#0A0A0A` square background (matching the manifest's existing dark brand color), not just
  upscale the PNG. No new user art is needed (user decision, locked).
- **Routes** (`apps/web/src/App.tsx`, `AppRoutes`): `/` (Index, marketing home), `/login`
  (alias → `/clients`, preserves query), `/members` (`<Login variant="members">`, password-first
  login form, admin-area entry), `/clients` (`<Login variant="clients">`, same component,
  client-area entry), `/start` (lead-capture form, not account creation), `/team`,
  `/client-guide`, `/behind-the-scenes`, `/about`, `/how-it-ships` (redirects to `/client-guide`),
  `/project/:slug`, `/work/:slug`, `/p/:token` (**not a login page** — `PreviewLink`: shows a
  branded "opening…" screen for 600ms then `window.location.replace()`s the browser to
  `${VITE_API_URL}/api/preview/:token`, which 302s to an external, client-specific
  `preview_url`), `/terms` `/privacy` `/refund` `/dispute` (public legal pages, PayMongo
  merchant-review requires these reachable signed-out), protected `/hub` (any authed user,
  `ProtectedRoute requireAuth redirectAdminTo="/admin"`), protected `/admin` + `/admin/:section`
  (`ProtectedRoute requireAdmin`).
  `ProtectedRoute` (`apps/web/src/components/ProtectedRoute.tsx`) already encodes the
  admin-vs-client redirect split this plan reuses: unauthenticated → `/members` if the attempted
  path starts with `/admin`, else `/clients`; authed non-admin hitting `requireAdmin` → `/hub`;
  authed admin hitting `redirectAdminTo` → `/admin`.
- **Auth tokens** live in `localStorage` (`apps/web/src/lib/api.ts` `ACCESS_KEY`/`REFRESH_KEY`) —
  fine in a Capacitor WebView (same-origin `localStorage`, persists across app restarts same as
  a native app's own storage). No change needed.
- **CORS allowlist** (`apps/api/src/index.ts`): `cors({ origin: (origin) => {...} })` — dev-mode
  regex bypass, else a hardcoded `allow` array (`e.FRONTEND_URL`, `"https://advo.ph"`,
  `"https://www.advo.ph"`, several `localhost:PORT` dev origins) checked with
  `allow.includes(origin) ? origin : ""`. Fix: add exactly one entry, `"capacitor://localhost"`,
  to that array. No other CORS logic changes (contract: iOS touches *only* this one line in this
  file).
- **nginx / SPA fallback risk — resolved, not a risk**: `docs/SETUP.md` confirms the live web
  vhost uses `try_files $uri $uri/index.html /index.html;` (the `$uri/` term was deliberately
  removed 2026-09-02 to fix a routes-named-like-directories bug — do not re-add it). Since
  `app-updates/latest.json` and `app-updates/bundle-*.zip` are **real files that exist on disk**
  after a successful rsync, `try_files` resolves `$uri` directly and serves them as static files
  — it never reaches the `/index.html` SPA fallback. The only way these URLs 404 is if the deploy
  itself failed to ship them, which is exactly what the new post-deploy `curl --fail` check (§7
  step 23) catches. The web vhost config itself is not in this repo (only `apps/api/nginx.conf`,
  the **API** vhost, is committed) — this was verified by reading `docs/SETUP.md`'s prose
  description of the live config, not a committed file; if the box's actual vhost has drifted
  from that description, the post-deploy curl check is the safety net.
- **`@capacitor/core`/`cli`/`ios` current stable major is 8** (verified `npm view` live:
  `8.5.3`). `@capgo/capacitor-updater` current is `8.53.0`, Capacitor-8-compatible. `npx cap add
  ios` with no flags already defaults to SPM (no CocoaPods installed in this environment) per
  the installed CLI's `getPackageManager()`; this plan still passes `--packagemanager SPM`
  explicitly for clarity.
  - `CapacitorUpdater.autoUpdate: false` in `capacitor.config.ts`.
  - `CapacitorUpdater.notifyAppReady()` must run synchronously, first thing, on every launch,
    before any network call — skipping it triggers auto-rollback to the last-known-good bundle.
  - `CapacitorUpdater.download({ version, url, checksum })` fetches a bundle zip from any URL;
    `checksum` is a plain sha256 hex string (CI computes with `sha256sum`).
  - `CapacitorUpdater.next({ id })` (not `set()`) schedules activation on next
    background/relaunch without destroying the current JS context — this plan's apply mechanism.
  - iOS needs one `PrivacyInfo.xcprivacy` entry (`NSPrivacyAccessedAPICategoryUserDefaults`,
    reason `CA92.1`); Capacitor's default template may or may not already ship the array —
    check before assuming.
- Capacitor iOS's `WKUIDelegate` already opens `window.open`/`target="_blank"` navigation in
  Safari via `UIApplication.shared.open(url)`. All external-link call sites in the web app
  (`AdminProjects.tsx:354`, `ProjectCommandCenter.tsx:159,330,456`) already use
  `<a target="_blank" rel="noopener noreferrer">` — **no `@capacitor/browser` dependency needed**.
- File/image URLs: `POST /api/files/upload` already returns an absolute URL built server-side
  from `API_URL` — no relative-URL bug exists, no fix needed.
- CI rsync (`deploy-web` job) uses `rsync -rltpz --delete --omit-dir-times`. `--delete` means the
  OTA zip + `latest.json` **must** be inside `apps/web/dist/app-updates/` before the existing
  `Upload frontend build` step in `verify`, or they're wiped on every deploy.
- `/start` is a lead-capture form (`db.createLead`), not account self-registration — resolves
  Apple Guideline 5.1.1(v) as **not applicable** (no self-service account creation exists).
- No `apps/web/.gitignore` exists; root `.gitignore` already globally ignores `dist/`/`build/`
  (covers Xcode's `ios/App/build/`), but iOS-specific entries (`xcuserdata/`, `*.xcuserstate`,
  `ios/App/App/public`, `ios/App/App/capacitor.config.json`) are still needed since those two
  paths are regenerated by `npx cap sync` and must not be committed as tracked source.
- **Floating widget conflict surface**: `apps/web/src/components/admin/shared/JobProgressWidget.tsx`
  (line 305) is `className="fixed bottom-4 right-4 z-50 ..."` — a plain fixed pixel offset with
  **no safe-area awareness**. On a notched/home-indicator iPhone inside the native shell this
  widget sits under the home-indicator gesture area in `/admin`. This plan pads it (scoped to
  `.native-app`, so web is untouched) — it is in scope here per the task brief's "generic
  bottom/top UI" wording (the chat feature, built in parallel, pads only its own new
  `ChatWidget`, not this pre-existing one). If the ChatWidget lands in the same release cycle,
  confirm during simulator verification that the two don't overlap (their stacking fix is the
  chat plan's responsibility per the shared contract; this plan only owns `JobProgressWidget`'s
  own safe-area clearance).

---

## 4. Touchpoints (files to create/modify)

### New files
| Path | Purpose |
|---|---|
| `apps/web/capacitor.config.ts` | Capacitor app config: `appId: "ph.advo.app"`, `appName: "ADVO"`, `webDir: "dist"`, `CapacitorUpdater.autoUpdate: false`. |
| `apps/web/ios/` (generated by `npx cap add ios --packagemanager SPM`) | Native Xcode project. Committed minus ignored subpaths. |
| `apps/web/ios/.gitignore` | Ignore `App/public`, `App/capacitor.config.json`, `App/build`, `xcuserdata/`, `*.xcuserstate`. |
| `apps/web/src/lib/platform.ts` | `isNativeApp()` wrapper around `Capacitor.isNativePlatform()` — single source of truth for native-only branching. |
| `apps/web/src/lib/otaUpdater.ts` | OTA client: `notifyAppReady()`, fetch `latest.json`, version/`minNativeVersion` compare, `download()` + `next()`, exposes `initOtaUpdater()`. |
| `apps/web/src/lib/registerSw.ts` | Wraps `virtual:pwa-register`'s `registerSW()`; called only when `!isNativeApp()`; also exports `unregisterAllServiceWorkers()` for the native boot defensive call. |
| `apps/web/src/components/NativeGate.tsx` | Route-level allowlist gate (see §7 Phase B) — redirects everything NOT on the allowlist; no-op on web. |
| `process/features/ios-app/reports/` | EXECUTE-phase verification evidence (screenshots, build logs, OTA test transcript) — created during EXECUTE, not PLAN. |

### Modified files
| Path | Change |
|---|---|
| `apps/web/vite.config.ts` | `VitePWA({ ..., injectRegister: null })` — stop auto-injecting the SW-registration script. No other VitePWA option changes (workbox config, `navigateFallback`, `runtimeCaching` all stay as-is for the web build). |
| `apps/web/package.json` | Add deps: `@capacitor/core`, `@capacitor/cli` (dev), `@capacitor/ios`, `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capgo/capacitor-updater`, `@capacitor/assets` (dev, icon gen only). Add scripts: `"cap:sync": "vite build && npx cap sync ios"` (plain `vite build`, no prerender/network — see §3), `"cap:open": "npx cap open ios"`. |
| `apps/web/src/main.tsx` | First statement after imports: if native, `unregisterAllServiceWorkers()` then `initOtaUpdater()` (which calls `notifyAppReady()` synchronously first). If web, call `registerSW()` from the new wrapper (preserves today's auto-registration/`autoUpdate` behavior exactly) and never touch OTA code. Also sets `document.documentElement.classList.add("native-app")` before render when native. |
| `apps/web/src/App.tsx` | Add `<NativeGate />` as a sibling of `<AppRoutes />`, inside `<BrowserRouter>`/`<AuthProvider>`. No route added/removed. |
| `apps/web/src/index.css` | Add `env(safe-area-inset-*)` padding rules scoped to `.native-app` for: top-level nav/header containers found to sit flush to the top notch during simulator verification, and `.fixed.bottom-4.right-4` (or a dedicated class added to `JobProgressWidget.tsx`) so it clears the home indicator. Exact selectors confirmed in Simulator during EXECUTE, not guessed here. |
| `apps/web/src/components/admin/shared/JobProgressWidget.tsx` | Add a stable class name (e.g. `job-progress-widget`) to its root so `index.css` can target it for native-only safe-area padding without a fragile Tailwind-arbitrary-selector. |
| `apps/web/index.html` | **No change** — `viewport-fit=cover` already present (§3). |
| `apps/api/src/index.ts` | Add `"capacitor://localhost"` to the CORS `allow` array (the only API change in this plan). |
| `.github/workflows/ci.yml` | `verify` job: add `VITE_APP_VERSION: 1.0.${{ github.run_number }}` to the **existing** `Build` step's `env:` block (alongside `VITE_API_URL`); add new steps after `Build` and before `Upload frontend build` that zip `dist` (excluding `app-updates/`, which doesn't exist yet at zip time), compute sha256, write `dist/app-updates/latest.json`, copy the zip in. `deploy-web` job: extend the existing `Verify live deploy` step with one more `curl --fail` against `https://advo.ph/app-updates/latest.json`. |

### Explicitly NOT touched
`apps/api/src/db/schema.ts`, `apps/api/src/routes/content.routes.ts`,
`apps/web/src/components/admin/AdminPortfolio.tsx`, `apps/web/src/hooks/useAdminPortfolio.ts`,
`apps/api/migrations/005_portfolio_enabled.sql` — re-check `git status` for these paths in the
`feat/ios-app` worktree before touching anything; leave exactly as found.

---

## 5. Public Contracts

- **New API surface**: none. No new routes, no schema changes.
- **New static surface on advo.ph**: `https://advo.ph/app-updates/latest.json` and
  `https://advo.ph/app-updates/bundle-<version>.zip` — publicly fetchable, unauthenticated.
  `latest.json` shape (frozen contract between CI and the app):
  ```json
  {
    "version": "1.0.<run_number>",
    "url": "https://advo.ph/app-updates/bundle-1.0.<run_number>.zip",
    "checksum": "<sha256 hex>",
    "minNativeVersion": "1.0.0"
  }
  ```
  `minNativeVersion` lets the app refuse a bundle that assumes a newer native shell than
  installed; app reads its own native version via `@capacitor/app`'s `App.getInfo().version`
  (confirm during EXECUTE vs. `CapacitorUpdater.getBuiltinVersion()`, both read
  `CFBundleShortVersionString`).
- **CORS contract change**: `apps/api` additionally accepts `Origin: capacitor://localhost` —
  additive only, no breaking change to any existing consumer.
- **No change** to `/api/auth/*`, `/api/files/*`, or any existing endpoint shape.

---

## 6. Blast Radius

- **Public website (advo.ph)**: zero behavior change. The web build path (`npm run build` =
  typecheck + `vite build` + prerender) is unmodified; `injectRegister: null` only stops
  *auto*-injection — the new `registerSw.ts` wrapper calls the same `virtual:pwa-register`
  `registerSW()` manually on web, with the same `autoUpdate` semantics, so the service worker
  still registers and updates on advo.ph exactly as today. Native-only branches (`NativeGate`,
  safe-area CSS, OTA updater, SW suppression) are all gated behind
  `Capacitor.isNativePlatform()`, which is `false` in a browser.
- **API**: one-line CORS allowlist addition. No route, schema, or auth logic changes.
- **CI**: `verify` job gets the version env var added to an existing step plus new steps appended
  after `Build`/before `Upload frontend build`; `deploy-web`'s `Verify live deploy` step gets one
  more `curl --fail` line. `audit` job unmodified. Risk: a bug in the new zip/`latest.json` steps
  fails the whole `verify` job and blocks `deploy-web` (job dependency) — mitigated by keeping the
  new steps isolated and fast-failing, and dry-running them locally before relying on CI (§10).
  `app-updates/` does not collide with any existing served path (confirmed via repo search) and
  is correctly swept by `--delete` if ever removed from a build (append-only artifact,
  "last deploy wins" is correct semantics here).
- **New native codebase**: `apps/web/ios/` is net-new and additive. Worst case: Xcode build
  fails, blocking only EXECUTE's own verification, not production.
- **No data migrations, no schema changes, no auth token format changes.**

---

## 7. Implementation Checklist (ordered, atomic)

### Phase A — Capacitor scaffold (no OTA yet)
1. `cd apps/web && npm install @capacitor/core @capacitor/app @capacitor/status-bar @capacitor/splash-screen` and `npm install -D @capacitor/cli @capacitor/assets`.
2. Create `apps/web/capacitor.config.ts`: `appId: "ph.advo.app"`, `appName: "ADVO"`,
   `webDir: "dist"`, `ios: { contentInset: "automatic" }`. Leave `plugins.CapacitorUpdater` out
   until Phase C.
3. `npm --workspace apps/web exec vite build` (plain build, seeds `dist/` for `cap add`).
4. `npm --workspace apps/web exec cap init` — skip if step 2's config already satisfies `cap`'s
   expectations; reconcile any CLI-generated fields into the hand-written file rather than ending
   up with two conflicting configs.
5. `npx cap add ios --packagemanager SPM` from `apps/web/`. **Before running**, run
   `npx cap add ios --help` and confirm the flag still matches the installed CLI version.
6. Add `apps/web/ios/.gitignore`: `App/public`, `App/capacitor.config.json`, `App/build`,
   `xcuserdata/`, `*.xcuserstate`.
7. `npx cap sync ios` — copies `dist/` into `ios/App/App/public`, installs native deps via SPM.
8. `npx cap open ios`; confirm the project builds for a generic iOS Simulator destination with
   no signing required (Debug config, "Any iOS Simulator Device").
9. Add `apps/web/package.json` scripts: `"cap:sync": "vite build && npx cap sync ios"`,
   `"cap:open": "npx cap open ios"`.

### Phase B — SW suppression + members-only native gating
10. In `apps/web/vite.config.ts`, change `VitePWA({ ... })` to add `injectRegister: null`.
    No other VitePWA options change.
11. Create `apps/web/src/lib/platform.ts`:
    ```ts
    import { Capacitor } from "@capacitor/core";
    export const isNativeApp = () => Capacitor.isNativePlatform();
    ```
12. Create `apps/web/src/lib/registerSw.ts`:
    - `registerWebServiceWorker()`: dynamic `import("virtual:pwa-register")`, calls
      `registerSW({ immediate: true })` — matches today's effective behavior of the auto-injected
      script. Only ever called when `!isNativeApp()`.
    - `unregisterAllServiceWorkers()`: if `"serviceWorker" in navigator`, call
      `navigator.serviceWorker.getRegistrations()` and `unregister()` each — a one-time
      defensive no-op cleanup, called only when `isNativeApp()`.
13. In `apps/web/src/main.tsx`, as the first statements after imports (before
    `createRoot(...).render(...)`):
    ```ts
    import { isNativeApp } from "@/lib/platform";
    if (isNativeApp()) {
      document.documentElement.classList.add("native-app");
      unregisterAllServiceWorkers();
      initOtaUpdater(); // calls notifyAppReady() synchronously first — see Phase C
    } else {
      registerWebServiceWorker();
    }
    ```
    (Exact ordering/placement confirmed against the plugin docs' "as early as possible, before
    any network call" requirement for `notifyAppReady()` — this satisfies it.)
14. Create `apps/web/src/components/NativeGate.tsx` — **allowlist**, not denylist. On
    `isNativeApp()` and on every route change, if the current path is NOT one of:
    `/login`, `/members`, `/clients`, `/p/:token` (matched via the route's own `:token` param
    shape), `/terms`, `/privacy`, `/refund`, `/dispute`, `/hub`, `/admin`, `/admin/:section` —
    redirect: signed out → `/login`; signed in + admin → `/admin`; signed in + non-admin →
    `/hub`. Reads auth/role state from the existing `useAuth()`/`useRoles()` hooks — same source
    `ProtectedRoute` uses, no duplicated logic. `/p/:token` is explicitly allowed through
    un-redirected (it's the "show client now" feature, not a login wall) — see §3 for what it
    renders; §10 verification confirms this doesn't trap the WebView.
15. Mount `<NativeGate />` once in `apps/web/src/App.tsx`, inside `<AuthProvider>` and inside
    `<BrowserRouter>`, as a sibling of `<AppRoutes />` (it only performs redirects, renders
    nothing, does not wrap route content).
16. Confirm `/admin`, `/hub`, `/members`, `/clients` remain reachable for their respective
    auth states inside the native shell (no gate blocks them).
17. Add a stable class (`job-progress-widget`) to the root element in
    `apps/web/src/components/admin/shared/JobProgressWidget.tsx` (currently
    `className="fixed bottom-4 right-4 z-50 ..."` at line 305) so it can be targeted without a
    fragile selector.
18. Add `env(safe-area-inset-*)` padding rules scoped to `.native-app` in
    `apps/web/src/index.css`: `.native-app .job-progress-widget { padding-bottom: max(0px,
    env(safe-area-inset-bottom)); }` plus any top-bar/nav container found to sit flush to the
    notch during Simulator inspection in §10 (exact additional selectors confirmed there, not
    guessed here).

### Phase C — Self-hosted OTA updater
19. `npm --workspace apps/web install @capgo/capacitor-updater@latest`.
20. Add to `apps/web/capacitor.config.ts`:
    ```ts
    plugins: { CapacitorUpdater: { autoUpdate: false } },
    ```
21. Create `apps/web/src/lib/otaUpdater.ts` exporting `initOtaUpdater()`:
    - First line: `CapacitorUpdater.notifyAppReady()` (no-op guard already applied by only being
      called from the native branch in `main.tsx`).
    - Fetch `` `https://advo.ph/app-updates/latest.json?t=${Date.now()}` `` (cache-busting query
      param).
    - Compare `latest.version` to `import.meta.env.VITE_APP_VERSION` (already wired by
      `vite.config.ts` — no new mechanism).
    - Compare `latest.minNativeVersion` to the native shell's version via `App.getInfo()`
      (`@capacitor/app`); if native is older, skip (log only, no user-facing error — mandatory
      native-update UX is out of scope).
    - If newer and native version sufficient:
      `await CapacitorUpdater.download({ version: latest.version, url: latest.url, checksum: latest.checksum })`
      then `await CapacitorUpdater.next({ id: bundleInfo.id })`. Wrap in try/catch; log failures,
      never throw into the app shell.
22. Add `PrivacyInfo.xcprivacy` entry in `apps/web/ios/App/App/PrivacyInfo.xcprivacy`
    (`NSPrivacyAccessedAPICategoryUserDefaults`, reason `CA92.1`) — check whether Capacitor's
    default template already ships an `NSPrivacyAccessedAPITypes` array before assuming.
23. `npx cap sync ios` again to pull in the new plugin's native code.

### Phase D — CI: build + publish OTA artifacts
24. In `.github/workflows/ci.yml`, `verify` job: add `VITE_APP_VERSION: "1.0.${{
    github.run_number }}"` to the **existing** `Build` step's `env:` block (alongside
    `VITE_API_URL: https://api.advo.ph`) — single build, no double-build version drift.
25. After `Build` and before `Upload frontend build`, add a step that: zips `apps/web/dist`
    (excluding the not-yet-created `app-updates/` directory) into `bundle-$APP_VERSION.zip`,
    computes its sha256, writes `apps/web/dist/app-updates/latest.json` per §5's shape, copies
    the zip into `apps/web/dist/app-updates/`.
26. No change needed to `deploy-web` — it already rsyncs the full `dist/` including the new
    `app-updates/` subfolder.
27. Extend the existing `Verify live deploy` step in `deploy-web` with one more line:
    `curl --fail --silent --show-error --location --max-time 20 https://advo.ph/app-updates/latest.json >/dev/null`.

### Phase E — App icon, splash, native polish
28. Render `apps/web/public/favicon.svg` to a 1024×1024 PNG with an opaque `#0A0A0A` background
    (flatten — the raw SVG's corners are transparent; App Store icons must have zero alpha) —
    e.g. via a headless-browser/SVG-rasterizer script or `rsvg-convert`/`resvg` with a background
    color flag; confirm whichever tool is actually available in the environment during EXECUTE.
    Save as `apps/web/resources/icon.png`. Reuse the same source for a 2732×2732 splash
    (`apps/web/resources/splash.png`), same `#0A0A0A` background, mark centered.
29. `npx @capacitor/assets generate --iconBackgroundColor '#0A0A0A' --splashBackgroundColor '#0A0A0A'`
    from `apps/web/` (confirm exact flags against the installed `@capacitor/assets` CLI's
    `--help`, do not guess).
30. `npx cap sync ios` to apply generated icons/splash into the Xcode project.
31. Set iOS status bar style using `@capacitor/status-bar` in `main.tsx` (native-only, gated by
    `isNativeApp()`) — match the dark theme (`theme_color: "#0c0c0c"`).

---

## 8. Risks and Open Decisions

| # | Item | Status | Resolution |
|---|---|---|---|
| 1 | Magic-link login does not reach the native app (email opens Safari, authenticates the Safari session, not the app's isolated WebView storage) | **Resolved (user decision, locked)** | Native app's primary sign-in is password login (already implemented). Universal Links would fix this but are out of scope; a follow-up plan if ever wanted. |
| 2 | `/p/:token` does a hard `window.location.replace()` to an **external** domain (the client's live preview URL) inside the single native WebView, with no in-app way back except the OS back-swipe/app-switch | Medium risk, verify in Simulator | §10 adds an explicit check: confirm the WebView either (a) correctly loads the external site with usable navigation, or (b) if that's a poor in-app experience, flag it as a fast-follow to open externally via `@capacitor/browser`'s `Browser.open()` instead of `window.location.replace`. Not pre-decided here — needs a real look during verification since the existing component's behavior may be fine as-is. |
| 3 | `vite-plugin-pwa`'s manual registration path (`virtual:pwa-register`) must behave identically to today's auto-injected one on web | Low-medium risk | §7 step 12 uses the same `registerSW({ immediate: true })` call the plugin's own auto-injected script would use; §10 adds a regression check that web SW registration/update behavior is unchanged post-change. |
| 4 | nginx web vhost config is not committed in this repo (only `apps/api/nginx.conf`, the API vhost, is) | Low risk, documented | `docs/SETUP.md` describes the live `try_files` rule, which resolves `app-updates/*` as real files, not SPA fallback (§3). The post-deploy `curl --fail` (§7 step 27) is the safety net if the live box ever drifts from that description. |
| 5 | OTA bundle size / zip composition correctness | Medium risk | §7 step 25 excludes `app-updates/` from its own zip; §10 verification confirms the zip unpacks to a valid `index.html`-rooted tree. |
| 6 | `minNativeVersion` gating logic correctness | Medium risk | §7 step 21 implements the check before download; §10 tests both "update applies" and "update is skipped when native too old." |
| 7 | CI `verify` job failure risk from new steps blocking the public-site deploy | Low-medium risk | New steps are additive to one existing step plus isolated new steps; kept inside `verify` per user decision (locked) for a single source of truth on `dist/`. |
| 8 | Apple App Store review (Guideline 4.2, "minimum functionality"/wrapper rejection) | Low risk, by design | Real native UI shell + local asset serving, not a remote-URL WebView wrapper — matches Apple's accepted pattern. |
| 9 | Guideline 5.1.1(v) account deletion | Resolved, not applicable | No in-app/in-app-reachable self-signup flow exists (`/start` is a lead form). |

---

## 9. "User Does In Xcode / App Store Connect" (manual, not automated)

1. Open `apps/web/ios/App/App.xcworkspace` (`npm --workspace apps/web run cap:open`).
2. In the App target → Signing & Capabilities: select your paid Apple Developer Team (leave
   "Automatically manage signing" on unless you have a reason not to). This plan never hardcodes
   a Team ID anywhere.
3. Confirm/reserve the bundle identifier (`ph.advo.app`, or change it in `capacitor.config.ts`
   and re-run `npx cap sync ios` if different).
4. Set the app's marketing version / build number in the target's General tab (§11 for when to
   bump this vs. relying on OTA).
5. Product → Archive (Generic iOS Device / "Any iOS Device" scheme).
6. Window → Organizer → Distribute App → App Store Connect → Upload.
7. In App Store Connect: create the app record (if first submission), fill in App Privacy
   answers honestly based on what the app actually collects (email, name, project data) — no
   account-deletion flow needed (§8 item 9).
8. Add a demo reviewer account (existing or admin-provisioned) and provide credentials in App
   Review notes.
9. Confirm a privacy policy URL exists on advo.ph (`/privacy` route exists in-app, §3 — confirm
   it's also linked/indexed as the public-facing policy URL App Store Connect asks for).
10. Submit to TestFlight first; confirm install + OTA update flow on a **real device** (not just
    Simulator) before submitting for App Store review.

---

## 10. Verification Strategy

Run in order; each step gates the next. Evidence (screenshots, build logs, OTA transcript) goes
in `process/features/ios-app/reports/`; screenshots additionally saved to
`~/Downloads/ADVO/ADVO/Screenshots/ios-app-2026-10-18/` (desktop 1440 + mobile 390 where
relevant) per the shared contract.

1. **Web unaffected**: `npm run build` (root) completes clean; local preview still serves the
   existing public site with no visual/behavioral change. `npm --workspace apps/web exec tsc
   --noEmit` and `npm run lint` pass.
2. **Web SW regression check**: in a browser, confirm the service worker still registers and
   updates on reload exactly as before the `injectRegister: null` change (DevTools → Application
   → Service Workers shows an active registration after `registerWebServiceWorker()` runs).
3. **Capacitor sync**: `npx cap sync ios` completes with no errors; no dependency silently
   requires CocoaPods (surface as a blocker if so, do not silently install it).
4. **Simulator build (no signing)**:
   ```
   xcodebuild -workspace apps/web/ios/App/App.xcworkspace \
     -scheme App -configuration Debug \
     -destination 'generic/platform=iOS Simulator' build
   ```
5. **Simulator launch + screenshots**: boot an iPhone-class simulator (iPhone 17 Pro available),
   install, launch; confirm no service worker registers inside the WebView (native branch skips
   it); screenshot `/login` (signed out) and `/hub` or `/admin` (signed in).
6. **Native gating check**: confirm every route NOT on the allowlist (§7 step 14) redirects
   correctly for signed-out, signed-in-client, and signed-in-admin states; confirm `/admin`,
   `/hub`, `/members`, `/clients` are directly reachable; confirm `/p/:token` behavior (§8 item 2)
   and record the finding.
7. **Safe-area check**: confirm `JobProgressWidget` and any top-bar/nav elements found flush to
   the notch clear the safe area on a notched simulator device.
8. **OTA end-to-end (local)**: serve a local static server exposing a fake `app-updates/
   latest.json` + `bundle-test.zip` with a bumped `VITE_APP_VERSION`; point the app's OTA check at
   this local URL for the test only (temporary override, not committed); confirm: (a) newer
   version detected, downloaded, `next()` succeeds; (b) relaunch shows new content; (c)
   `notifyAppReady()` ran (no rollback); (d) negative test — `minNativeVersion` above installed
   native version is correctly skipped (log only, no crash).
9. **CORS check**: from the simulator app, confirm an authenticated API call (e.g.
   `/api/auth/me`) succeeds against a local API instance (port 6417) with the CORS change applied.
10. **CI dry run**: validate the new zip/`latest.json` shell steps locally against a real
    `apps/web/dist/` before merging the workflow changes; after merge to `main`, confirm `verify`
    and `deploy-web` both pass and `curl --fail https://advo.ph/app-updates/latest.json` succeeds
    post-deploy.
11. **Regression**: `npm --workspace apps/web run test` still passes unmodified —
    `Capacitor.isNativePlatform()` returns `false` in Vitest's jsdom, so native-gated branches
    stay no-ops there.

---

## 11. How to Push Updates (post-launch operating model)

- **OTA (no App Store review, ships automatically)**: any change to `apps/web/src/**`,
  `apps/web/public/**`, or other `dist`-affecting source — push to `main` as today. CI builds,
  zips, publishes `latest.json`; installed apps pick it up on next foreground check and apply on
  next background/relaunch.
- **Requires a new native build + TestFlight/App Store resubmission**:
  - Adding/upgrading a Capacitor plugin or native dependency.
  - Any change to `capacitor.config.ts` affecting native behavior, `Info.plist`, entitlements.
  - App icon, app name, or splash screen changes.
  - Bumping `minNativeVersion` to require a native-shell update before OTA bundles apply.
  - Any change relying on a native capability the installed shell doesn't have.
  - In these cases: bump the Xcode target version/build number (§9 step 4), archive, upload, go
    through TestFlight/App Store review again — OTA must never be used to smuggle
    native-affecting changes past review (§8 item 8).

---

## 12. Resume and Execution Handoff

- **Single plan file to execute**: this file,
  `process/features/ios-app/active/ios-app_PLAN_18-10-26.md`. No other active plan files exist
  for this feature.
- **Execution environment**: own git worktree, branch `feat/ios-app` (shared contract, Wave 1,
  parallel with MCP phase 1 in the main tree and `feat/plaud-chat` in its own worktree). Local
  API for this worktree runs on port 6417 against `advo_dev`; iOS reserves no migration number.
  Never touch prod.
- **Suggested execution order**: Phase A → B → C → D → E, running §10 verification steps 1–7
  after Phase B, step 8 after Phase C, step 10 after Phase D, and the full set again before
  declaring done.
- **Hard stop before any App Store submission** (not before Simulator testing): user must do the
  Xcode signing/team selection, App Store Connect record creation, privacy questionnaire, a real
  real-device TestFlight test, and confirm the privacy policy URL (§9) — all independent of this
  plan's own execution, which can fully complete (build, gate, OTA, simulator-verify) without them.
- **Genuinely open, needs a look during EXECUTE, not before**: `/p/:token`'s in-WebView external
  navigation behavior (§8 item 2) — decide only after seeing it run in Simulator.
- **Merge note** (Wave 2, after this worktree is verified): this plan's `App.tsx`/`main.tsx`
  changes (NativeGate mount, native boot sequence) are additive next to the parallel
  `feat/plaud-chat` worktree's `ChatWidget` mount in the same files — expect an additive, not
  conflicting, merge per the shared cross-feature contract. After merging both, re-verify the
  Simulator build once more with the merged `App.tsx` to confirm `ChatWidget` and
  `JobProgressWidget` don't overlap in `/admin` on a real device size.
- **Do not touch**: the pre-existing dirty files listed in §2 — re-check `git status` for those
  exact paths in the worktree before and after EXECUTE.
