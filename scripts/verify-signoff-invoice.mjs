/**
 * Proves the sign-off cross-entity invalidation.
 *
 * Signing is one request that writes THREE tables: it updates the sign-off,
 * inserts the final-payment INVOICE, and inserts a client NOTIFICATION
 * (project-signoff.service.ts, the `/sign` path). The hook only ever
 * invalidated the sign-off and client-data, so the finance screen kept serving
 * its cached invoice list and the new receivable was invisible until someone
 * hard-reloaded.
 *
 * The test is built around that cache. Finance is opened FIRST, so the
 * ["invoices"] query is populated and inside its 2-minute staleTime. Signing
 * then happens elsewhere in the app. Coming back to Finance inside that window
 * is the moment of truth: without invalidation react-query serves the stale
 * list and issues no request at all.
 *
 * Run: node scripts/verify-signoff-invoice.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:6448";
const EMAIL = process.env.ADMIN_EMAIL || "prince.wagan@advo.ph";
const PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const OUT = "bench/signoff-invoice-out";
mkdirSync(OUT, { recursive: true });

const PROJECT = "VBE Eye Center Website";
const EXPECTED_INVOICE = "ZZTEST signoff — final payment";

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await context.newPage();

const traffic = [];
page.on("response", async (res) => {
  const url = new URL(res.url());
  if (!url.pathname.startsWith("/api/")) return;
  const entry = { method: res.request().method(), path: url.pathname, status: res.status(), at: Date.now(), body: null };
  if (entry.method === "GET" && url.pathname === "/api/invoices") {
    entry.body = await res.json().catch(() => null);
  }
  traffic.push(entry);
});
const after = (since, pred) => traffic.filter((t) => t.at >= since && pred(t));

async function openSection(label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(1800);
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const toPassword = page.getByText("Sign in with password instead");
  if (await toPassword.isVisible().catch(() => false)) await toPassword.click();
  await page.fill("#email-pw", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  check("signed in as admin", true, page.url());

  // ── 1. Warm the invoices cache ──────────────────────
  await openSection("Finance");
  await page.getByRole("button", { name: new RegExp(PROJECT) }).first().click();
  await page.waitForTimeout(1200);

  const financeBefore = await page.locator("body").innerText();
  check(
    "final-payment invoice is NOT on the finance screen yet",
    !financeBefore.includes(EXPECTED_INVOICE),
    "cache warmed with the pre-signature list",
  );
  await page.screenshot({ path: `${OUT}/01-finance-before-signing.png`, fullPage: false });
  const cacheWarmedAt = Date.now();

  // ── 2. Sign the sign-off, from the project screen ───
  await openSection("Projects");
  // Each project row carries its own "Open" button into the command center.
  // Scope to the row that actually names the project rather than trusting order.
  const projectRow = page
    .locator("div")
    .filter({ hasText: PROJECT })
    .filter({ has: page.getByRole("button", { name: "Open", exact: true }) })
    .last();
  await projectRow.getByRole("button", { name: "Open", exact: true }).first().click();
  await page.waitForTimeout(3000);
  check(
    "opened the right project",
    (await page.locator("body").innerText()).includes(PROJECT),
    PROJECT,
  );

  // The command center opens on Overview; the sign-off lives behind its own tab.
  await page.getByRole("tab", { name: "Sign-off" }).first().click();
  await page.waitForTimeout(2000);

  const deemedInput = page.getByPlaceholder("Name on record").first();
  await deemedInput.scrollIntoViewIfNeeded();
  check("sign-off panel reachable on the project", await deemedInput.isVisible(), "deemed-approval control found");
  await page.screenshot({ path: `${OUT}/02-signoff-panel.png`, fullPage: false });

  const signedAt = Date.now();
  await deemedInput.fill("ZZTEST Verifier");
  await page.getByRole("button", { name: "Record", exact: true }).first().click();
  await page.waitForTimeout(3000);

  const signPost = after(signedAt, (t) => t.method === "POST" && /\/sign$/.test(t.path));
  check(
    "the sign request succeeded",
    signPost.length === 1 && signPost[0].status < 400,
    signPost.map((p) => `${p.path} -> ${p.status}`).join(", "),
  );
  await page.screenshot({ path: `${OUT}/03-after-signing.png`, fullPage: false });

  // ── 3. Back to Finance, inside the 2-minute staleTime ──
  const elapsedSec = Math.round((Date.now() - cacheWarmedAt) / 1000);
  await openSection("Finance");
  await page.getByRole("button", { name: new RegExp(PROJECT) }).first().click();
  await page.waitForTimeout(2000);

  const refetch = after(signedAt, (t) => t.method === "GET" && t.path === "/api/invoices");
  check(
    "the invoices query was re-read after signing",
    refetch.length >= 1,
    `${refetch.length} x GET /api/invoices, ${elapsedSec}s into a 120s staleTime (0 would mean the cache was still trusted)`,
  );

  const financeAfter = await page.locator("body").innerText();
  check(
    "the new final-payment invoice is on screen with no manual reload",
    financeAfter.includes(EXPECTED_INVOICE),
    financeAfter.includes(EXPECTED_INVOICE) ? EXPECTED_INVOICE : "NOT FOUND ON SCREEN",
  );
  await page.screenshot({ path: `${OUT}/04-finance-after-signing.png`, fullPage: false });

  const served = refetch.at(-1)?.body?.data ?? [];
  const minted = served.find((i) => i.label === EXPECTED_INVOICE);
  console.log(
    `\n  BROWSER now holds invoice: id=${minted?.invoiceId} amount_cents=${minted?.amountCents} status=${minted?.status}`,
  );
  check("browser holds the minted invoice row", minted !== undefined, `invoice_id=${minted?.invoiceId}`);
  console.log(
    `\nMACHINE-READABLE ${JSON.stringify({ invoice_id: minted?.invoiceId, amount_cents: minted?.amountCents, status: minted?.status })}`,
  );
} catch (err) {
  check("script completed", false, err.message);
  await page.screenshot({ path: `${OUT}/99-failure.png`, fullPage: true }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
