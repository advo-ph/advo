/**
 * Verification harness for the PWA install sheet.
 *
 * Serves the real production build from apps/web/dist (proxying /api to the local
 * API so sign-in works), then drives it in Chromium and asserts every branch of
 * the install prompt. Screenshots land in .verify-shots/.
 *
 *   node scripts/verify-install-prompt.mjs
 */
import { chromium, devices } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "apps/web/dist");
const SHOTS = path.join(ROOT, ".verify-shots");
const API = "http://127.0.0.1:6407";
const PORT = 6455;
const ORIGIN = `http://localhost:${PORT}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/** Static server for dist + a pass-through proxy for /api. */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, ORIGIN);

      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const body = Buffer.concat(chunks);
          const proxied = http.request(
            `${API}${url.pathname}${url.search}`,
            {
              method: req.method,
              headers: { ...req.headers, host: "127.0.0.1:6407" },
            },
            (up) => {
              res.writeHead(up.statusCode, up.headers);
              up.pipe(res);
            },
          );
          proxied.on("error", (err) => {
            res.writeHead(502, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: `proxy: ${err.message}` }));
          });
          if (body.length) proxied.write(body);
          proxied.end();
        });
        return;
      }

      let file = path.join(DIST, url.pathname);
      // SPA fallback, mirroring the service worker's navigateFallback.
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(DIST, "index.html");
      }
      const ext = path.extname(file);
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.data) throw new Error(`login failed for ${email}: ${json.error}`);
  return json.data;
}

/** Seeds tokens before app JS runs, so AuthProvider hydrates as signed in. */
function signedInInit(session) {
  return (s) => {
    localStorage.setItem("advo_access_token", s.accessToken);
    localStorage.setItem("advo_refresh_token", s.refreshToken);
    localStorage.setItem(
      "advo_last_user",
      JSON.stringify({
        userId: s.user.userId,
        email: s.user.email,
        role: s.user.role,
        displayName: s.user.displayName ?? s.user.email,
        avatarUrl: s.user.avatarUrl ?? null,
      }),
    );
  };
}

/** Chromium will not fire a real beforeinstallprompt headless, so we forge one. */
const DISPATCH_BIP = () => {
  const e = new Event("beforeinstallprompt", { cancelable: true });
  e.platforms = ["web"];
  e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
  e.prompt = () => {
    window.__promptCalled = true;
    return Promise.resolve();
  };
  window.dispatchEvent(e);
};

const SHEET = '[data-testid="install-prompt"]';

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  console.log(`serving ${DIST} on ${ORIGIN}\n`);

  const admin = await login("prince.wagan@advo.ph", "changeme");
  const client = await login("john@example.com", "changeme");
  console.log(`admin=${admin.user.email}/${admin.user.role}  client=${client.user.email}/${client.user.role}\n`);

  // --- 2. manifest is served correctly and parses -------------------------
  const manRes = await fetch(`${ORIGIN}/manifest.webmanifest`);
  const manText = await manRes.text();
  let manifest = null;
  try {
    manifest = JSON.parse(manText);
  } catch {
    /* left null so the check below fails loudly */
  }
  check(
    "2. manifest served + parses",
    manRes.status === 200 && manifest !== null,
    `http=${manRes.status} content-type=${manRes.headers.get("content-type")} start_url=${manifest?.start_url} id=${manifest?.id}`,
  );

  // Chromium installability criteria, checked by hand against the served doc.
  const iconsOk = (manifest?.icons ?? []).some((i) => i.sizes === "192x192") &&
    (manifest?.icons ?? []).some((i) => i.sizes === "512x512");
  const maskableOk = (manifest?.icons ?? []).some((i) => (i.purpose ?? "").includes("maskable"));
  const startInScope = manifest?.start_url?.startsWith(manifest?.scope ?? "/");
  check(
    "10. manifest meets Chromium install criteria",
    Boolean(manifest?.name && manifest?.short_name && manifest?.display === "standalone" && iconsOk && startInScope),
    `name=${!!manifest?.name} short_name=${!!manifest?.short_name} display=${manifest?.display} 192+512=${iconsOk} maskable=${maskableOk} start_url_in_scope=${startInScope}`,
  );

  const swRes = await fetch(`${ORIGIN}/sw.js`);
  check("service worker served", swRes.status === 200, `http=${swRes.status}`);

  const browser = await chromium.launch();

  // --- 10b. Chromium's own manifest parser verdict ------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
    const res = await cdp.send("Page.getAppManifest");
    const errs = res.errors ?? [];
    const critical = errs.filter((e) => e.critical);
    check(
      "10b. Chromium parses manifest with no critical errors",
      critical.length === 0 && Boolean(res.url),
      `url=${res.url} errors=${JSON.stringify(errs)}`,
    );
    await ctx.close();
  }

  // --- 3. signed in, Chromium: sheet appears with Install -----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(signedInInit(admin), admin);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(DISPATCH_BIP);
    await page.waitForSelector(SHEET, { timeout: 10000 });

    const title = await page.textContent(`${SHEET} [data-vaul-drawer] , ${SHEET}`);
    const hasInstall = await page.locator('[data-testid="install-accept"]').isVisible();
    const hasIosSteps = await page.locator('[data-testid="install-ios-steps"]').count();
    await page.screenshot({ path: path.join(SHOTS, "01-chromium-install-sheet.png") });
    check(
      "3. Chromium sheet shows Install button",
      hasInstall && hasIosSteps === 0,
      `install_btn=${hasInstall} ios_steps=${hasIosSteps} copy_has_title=${title.includes("Install the ADVO app.")}`,
    );

    // AccountPanel's floating button is pinned bottom-right at z-55 and used to
    // paint on top of these buttons. Assert nothing covers their centre points.
    const occluded = await page.evaluate(() => {
      const out = {};
      // Sample across the whole width, not just the centre: the AccountPanel
      // button clipped the right edge of Install, which a centre-only hit missed.
      const clear = (el) => {
        const r = el.getBoundingClientRect();
        const y = r.top + r.height / 2;
        return [0.1, 0.3, 0.5, 0.7, 0.9].every((f) => {
          const top = document.elementFromPoint(r.left + r.width * f, y);
          return top && (el === top || el.contains(top));
        });
      };
      const install = document.querySelector('[data-testid="install-accept"]');
      const notNow = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Not now",
      );
      out.install = install ? clear(install) : null;
      out.notNow = notNow ? clear(notNow) : null;

      // And the floating account button must itself be behind the sheet.
      const pw = document.querySelector(".fixed.bottom-4.right-4");
      if (pw) {
        const r = pw.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        out.accountBtnBehindSheet = Boolean(top && top.closest('[data-testid="install-prompt"]'));
      } else {
        out.accountBtnBehindSheet = "no-account-btn";
      }
      return out;
    });
    check(
      "3c. sheet buttons are not occluded",
      occluded.install === true && occluded.notNow === true && occluded.accountBtnBehindSheet !== false,
      JSON.stringify(occluded),
    );

    // Tapping Install must reach the browser's own prompt().
    await page.click('[data-testid="install-accept"]');
    await page.waitForTimeout(500);
    const called = await page.evaluate(() => window.__promptCalled === true);
    const gone = (await page.locator(SHEET).count()) === 0;
    check("3b. Install calls prompt() and closes sheet", called && gone, `prompt_called=${called} sheet_closed=${gone}`);
    await ctx.close();
  }

  // --- 4. iOS: manual Share instructions, no Install button ---------------
  {
    const iphone = devices["iPhone 13"];
    const ctx = await browser.newContext({ ...iphone });
    await ctx.addInitScript(signedInInit(admin), admin);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
    // No dispatch: iOS never fires beforeinstallprompt, and neither do we.
    await page.waitForSelector(SHEET, { timeout: 10000 });

    const platform = await page.getAttribute(SHEET, "data-platform");
    const steps = await page.locator('[data-testid="install-ios-steps"]').isVisible();
    const stepText = (await page.locator('[data-testid="install-ios-steps"]').textContent()) ?? "";
    const installBtn = await page.locator('[data-testid="install-accept"]').count();
    await page.screenshot({ path: path.join(SHOTS, "02-ios-share-instructions.png") });
    check(
      "4. iOS shows Share instructions, no Install button",
      platform === "ios" && steps && installBtn === 0,
      `platform=${platform} steps_visible=${steps} install_btn_count=${installBtn} text="${stepText.replace(/\s+/g, " ").trim()}"`,
    );
    await ctx.close();
  }

  // --- 5. dismissal persists across reload --------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(signedInInit(admin), admin);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(DISPATCH_BIP);
    await page.waitForSelector(SHEET, { timeout: 10000 });
    await page.click("text=Not now");
    await page.waitForTimeout(300);

    const stored = await page.evaluate(() => localStorage.getItem("advo_install_dismissed_at"));

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(DISPATCH_BIP);
    await page.waitForTimeout(4000); // longer than the 2500ms appear delay
    const reappeared = await page.locator(SHEET).count();
    check(
      "5. dismissal persists across reload",
      Boolean(stored) && reappeared === 0,
      `stored=${stored} sheet_after_reload=${reappeared}`,
    );
    await ctx.close();
  }

  // --- 5b. signing out with the sheet open closes it ----------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(signedInInit(admin), admin);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(DISPATCH_BIP);
    await page.waitForSelector(SHEET, { timeout: 10000 });
    const before = await page.locator(SHEET).count();

    // Drop the credential and let another tab's storage event end the session.
    await page.evaluate(() => {
      localStorage.removeItem("advo_refresh_token");
      localStorage.removeItem("advo_access_token");
      localStorage.removeItem("advo_last_user");
      window.dispatchEvent(
        new StorageEvent("storage", { key: "advo_refresh_token", storageArea: localStorage }),
      );
    });
    await page.waitForTimeout(1500);
    const after = await page.locator(SHEET).count();
    check("5b. sheet closes when the session ends", before === 1 && after === 0, `before=${before} after=${after}`);
    await ctx.close();
  }

  // --- 6. standalone display-mode: never shown ----------------------------
  // CDP cannot emulate display-mode (Chrome only exposes a fixed set of media
  // features there), so this uses a real Chrome app window via --app=, which
  // genuinely reports (display-mode: standalone). That needs a headed browser.
  {
    const profile = path.join("/tmp", `advo-pwa-standalone-${Date.now()}`);
    const ctx = await chromium.launchPersistentContext(profile, {
      headless: false,
      viewport: { width: 390, height: 844 },
      args: [`--app=${ORIGIN}/admin`],
    });
    await ctx.addInitScript(signedInInit(admin), admin);
    const page = ctx.pages()[0];
    await page.waitForLoadState("domcontentloaded");

    const realStandalone = await page.evaluate(
      () => window.matchMedia("(display-mode: standalone)").matches,
    );

    // Re-navigate in the same app window so the seeded session takes effect.
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
    const signedIn = await page.evaluate(() => Boolean(localStorage.getItem("advo_refresh_token")));

    await page.evaluate(DISPATCH_BIP);
    await page.waitForTimeout(4000);
    const shown = await page.locator(SHEET).count();
    await page.screenshot({ path: path.join(SHOTS, "03-standalone-no-sheet.png") });
    check(
      "6. hidden when running standalone",
      realStandalone && signedIn && shown === 0,
      `real_standalone=${realStandalone} signed_in=${signedIn} sheet_count=${shown}`,
    );
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }

  // --- 7. logged out on / : no sheet, landing page renders ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(DISPATCH_BIP);
    await page.waitForTimeout(4000);
    const shown = await page.locator(SHEET).count();
    const url = page.url();
    await page.screenshot({ path: path.join(SHOTS, "04-logged-out-landing.png") });
    check(
      "7. logged-out visitor on / sees no sheet",
      shown === 0 && url === `${ORIGIN}/`,
      `sheet_count=${shown} url=${url}`,
    );
    await ctx.close();
  }

  // --- 8. / redirects a signed-in user ------------------------------------
  for (const [label, session, expected] of [
    ["admin", admin, "/admin"],
    ["client", client, "/hub"],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(signedInInit(session), session);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const url = new URL(page.url()).pathname;
    check(`8. / redirects signed-in ${label} to ${expected}`, url === expected, `landed_on=${url}`);
    await ctx.close();
  }

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`screenshots: ${SHOTS}`);
  if (failed.length) {
    console.log("\nFAILED:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
