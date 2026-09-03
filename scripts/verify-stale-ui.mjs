/**
 * Proves three previously-optimistic mutations now reconcile with the server.
 *
 * For each one it drives the real admin UI, watches the network, and reports
 * the value the BROWSER ends up holding. That value is then compared against
 * psql by the caller. The reconciling GET that follows each write is the whole
 * point: before `onSettled` existed there was no such request, and whatever the
 * browser had guessed stayed on screen until a hard reload.
 *
 * Run: node scripts/verify-stale-ui.mjs
 * Env: WEB_URL (default http://localhost:6448), ADMIN_EMAIL, ADMIN_PASSWORD
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:6448";
const EMAIL = process.env.ADMIN_EMAIL || "prince.wagan@advo.ph";
const PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const OUT = "bench/stale-ui-out";
mkdirSync(OUT, { recursive: true });

const INVOICE_LABEL = "ZZTEST verification invoice";
const LEAD_NAME = "ZZTEST Verification Lead";

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await context.newPage();

// Every API call, in order, with bodies for the GETs we care about.
const traffic = [];
page.on("response", async (res) => {
  const url = new URL(res.url());
  if (!url.pathname.startsWith("/api/")) return;
  const entry = {
    method: res.request().method(),
    path: url.pathname + url.search,
    status: res.status(),
    at: Date.now(),
    body: null,
  };
  if (entry.method === "GET" && /\/api\/(invoices|leads|content\/sections)$/.test(url.pathname)) {
    entry.body = await res.json().catch(() => null);
  }
  traffic.push(entry);
});

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));

/** Requests matching `pred` that happened after timestamp `since`. */
const after = (since, pred) => traffic.filter((t) => t.at >= since && pred(t));

async function openSection(label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(1800);
}

try {
  // ── Sign in ──────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const toPassword = page.getByText("Sign in with password instead");
  if (await toPassword.isVisible().catch(() => false)) await toPassword.click();
  await page.fill("#email-pw", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  check("signed in as admin", true, page.url());

  /* ───────────────────────────────────────────────────────
   * 1. useInvoices.statusMutation — the paid_at divergence
   * ─────────────────────────────────────────────────────── */
  await openSection("Finance");

  // Expand the project that owns the test invoice.
  await page.getByRole("button", { name: /VBE Eye Center Website/ }).first().click();
  await page.waitForTimeout(900);

  const invoiceRow = page.locator("div").filter({ hasText: new RegExp(`^${INVOICE_LABEL}`) }).last();
  await invoiceRow.scrollIntoViewIfNeeded().catch(() => {});
  const row = page
    .locator("div.flex.items-center.gap-3")
    .filter({ hasText: INVOICE_LABEL })
    .first();
  check("test invoice row is on screen", await row.isVisible(), INVOICE_LABEL);
  await page.screenshot({ path: `${OUT}/01-invoice-before.png`, fullPage: false });

  const t0 = Date.now();
  await row.locator('button[role="combobox"]').click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await page.waitForTimeout(2500);

  const patch = after(t0, (t) => t.method === "PATCH" && /\/api\/invoices\/\d+/.test(t.path));
  const reconcile = after(t0, (t) => t.method === "GET" && t.path === "/api/invoices");
  check(
    "marking paid sent the PATCH",
    patch.length === 1 && patch[0].status < 400,
    patch.map((p) => `${p.method} ${p.path} -> ${p.status}`).join(", "),
  );
  check(
    "onSettled re-read the server after the write",
    reconcile.length >= 1,
    `${reconcile.length} x GET /api/invoices after the PATCH`,
  );

  const invoiceList = reconcile.at(-1)?.body?.data ?? [];
  const uiInvoice = invoiceList.find((i) => i.label === INVOICE_LABEL);
  console.log(
    `\n  BROWSER now holds: status=${uiInvoice?.status} paid_at=${uiInvoice?.paidAt ?? uiInvoice?.paid_at}`,
  );
  check("browser shows status=paid", uiInvoice?.status === "paid", `status=${uiInvoice?.status}`);
  const uiPaidAt = uiInvoice?.paidAt ?? uiInvoice?.paid_at ?? null;
  check(
    "paid_at came from the server, not the browser clock",
    uiPaidAt !== null,
    `paid_at=${uiPaidAt}`,
  );
  await page.screenshot({ path: `${OUT}/02-invoice-after-paid.png`, fullPage: false });

  const rowText = (await row.innerText()).replace(/\n/g, " ");
  check("row renders the Paid state", /Paid/.test(rowText), rowText.slice(0, 120));

  /* ───────────────────────────────────────────────────────
   * 2. useLeads.statusMutation
   * ─────────────────────────────────────────────────────── */
  await openSection("Leads");
  await page.screenshot({ path: `${OUT}/03-leads-before.png`, fullPage: false });

  // The status Select lives in the lead's expanded detail panel, so open the
  // row first.
  const leadToggle = page.getByRole("button").filter({ hasText: LEAD_NAME }).first();
  await leadToggle.scrollIntoViewIfNeeded().catch(() => {});
  await leadToggle.click();
  await page.waitForTimeout(1000);
  check("test lead row expanded", await page.getByText(LEAD_NAME).first().isVisible(), LEAD_NAME);

  const t1 = Date.now();
  const detail = page.locator("div").filter({ hasText: "Status" }).last();
  const leadCombo = detail.locator('button[role="combobox"]').first();
  await leadCombo.click({ timeout: 10000 });
  await page.getByRole("option", { name: "Qualified", exact: true }).click();
  await page.waitForTimeout(2500);

  const leadPatch = after(t1, (t) => t.method === "PATCH" && /\/api\/leads\/\d+/.test(t.path));
  const leadReconcile = after(t1, (t) => t.method === "GET" && t.path === "/api/leads");
  check(
    "changing lead status sent the PATCH",
    leadPatch.length === 1 && leadPatch[0].status < 400,
    leadPatch.map((p) => `${p.path} -> ${p.status}`).join(", "),
  );
  check(
    "onSettled re-read the leads list after the write",
    leadReconcile.length >= 1,
    `${leadReconcile.length} x GET /api/leads after the PATCH`,
  );
  const uiLead = (leadReconcile.at(-1)?.body?.data ?? []).find((l) => l.name === LEAD_NAME);
  console.log(`\n  BROWSER now holds: lead status=${uiLead?.status}`);
  check("browser shows status=qualified", uiLead?.status === "qualified", `status=${uiLead?.status}`);
  await page.screenshot({ path: `${OUT}/04-leads-after.png`, fullPage: false });

  /* ───────────────────────────────────────────────────────
   * 3. useSiteContent.toggleMutation
   * ─────────────────────────────────────────────────────── */
  await openSection("Content Studio");
  await page.screenshot({ path: `${OUT}/05-content-before.png`, fullPage: false });

  const t2 = Date.now();
  // First "Public" toggle in the list. The section it belongs to is reported
  // below so the caller can check the same row in psql.
  const firstToggle = page.getByTitle(/on Public$/).first();
  await firstToggle.click();
  await page.waitForTimeout(2500);

  const contentPatch = after(t2, (t) => t.method === "PATCH" && /\/api\/content\/sections\//.test(t.path));
  const contentReconcile = after(t2, (t) => t.method === "GET" && t.path === "/api/content/sections");
  check(
    "toggling visibility sent the PATCH",
    contentPatch.length === 1 && contentPatch[0].status < 400,
    contentPatch.map((p) => `${p.path} -> ${p.status}`).join(", "),
  );
  check(
    "onSettled re-read the sections after the write",
    contentReconcile.length >= 1,
    `${contentReconcile.length} x GET /api/content/sections after the PATCH`,
  );
  const toggledId = contentPatch[0]?.path.split("/").pop();
  const uiSection = (contentReconcile.at(-1)?.body?.data ?? []).find(
    (s) => (s.sectionId ?? s.section_id) === toggledId,
  );
  console.log(
    `\n  BROWSER now holds: section=${toggledId} visible_public=${uiSection?.visiblePublic ?? uiSection?.visible_public}`,
  );
  check("browser holds a definite visibility value", uiSection !== undefined, `section=${toggledId}`);
  await page.screenshot({ path: `${OUT}/06-content-after.png`, fullPage: false });

  console.log(
    `\nMACHINE-READABLE ${JSON.stringify({
      invoice: { label: INVOICE_LABEL, status: uiInvoice?.status, paid_at: uiPaidAt },
      lead: { name: LEAD_NAME, status: uiLead?.status },
      section: {
        section_id: toggledId,
        visible_public: uiSection?.visiblePublic ?? uiSection?.visible_public,
      },
    })}`,
  );

  check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | ") || "clean");
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
