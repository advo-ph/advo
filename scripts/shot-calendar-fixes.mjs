/**
 * Drives the calendar / availability / deliverable screens and proves the fixes are real
 * in the browser, not just in the API.
 *
 * Covers D1 (overdue timing), D2 (bounded recurrence), D3 (sub-hour blocks), D5 (free
 * time), D10 (12am cell), D12 (cleared date), D16 (today).
 *
 * Run: node scripts/shot-calendar-fixes.mjs
 * Env: WEB_URL (default http://localhost:6448), ADMIN_EMAIL, ADMIN_PASSWORD
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:6448";
const API = process.env.API_URL || "http://127.0.0.1:6407";
const EMAIL = process.env.ADMIN_EMAIL || "prince.wagan@advo.ph";
const PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const OUT = "bench/calendar-fixes-out";
mkdirSync(OUT, { recursive: true });

// ─── Fixtures ───
// The script seeds everything it asserts on and deletes it again in `finally`, so it is
// re-runnable and leaves the database as it found it. Every fixture is prefixed ZZTEMP.
const PRINCE = 100;
const ANGELO = 101;
const created = { blocks: [], events: [], deliverables: [] };
let token = "";

async function apiCall(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function authenticate() {
  const { body } = await apiCall("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  token = body?.data?.accessToken || "";
  if (!token) throw new Error("could not authenticate against the API");
}

/** The Sunday and Saturday inside the 7-day free-time horizon. */
function upcoming(dayOfWeek) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() + 1);
  return d;
}

async function seed() {
  await authenticate();

  const block = async (payload) => {
    const { body, status } = await apiCall("/api/availability", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (status !== 201) throw new Error(`block seed failed: ${JSON.stringify(body)}`);
    created.blocks.push(body.data.blockId);
  };

  // D3 — sub-hour blocks. Both used to render nowhere.
  await block({ teamMemberId: PRINCE, dayOfWeek: 2, startTime: "13:15", endTime: "13:45", blockType: "break", label: "ZZTEMP Lunch" });
  await block({ teamMemberId: PRINCE, dayOfWeek: 2, startTime: "09:00", endTime: "09:30", blockType: "work", label: "ZZTEMP Standup" });

  // D2 — a school block whose window has an end date.
  const thisYear = new Date().getFullYear();
  await block({
    teamMemberId: PRINCE, dayOfWeek: 4, startTime: "08:00", endTime: "11:00", blockType: "school",
    label: `ZZTEMP Semester ends ${thisYear}-12-31`,
    effectiveFrom: `${thisYear}-01-01`, effectiveTo: `${thisYear}-12-31`,
  });

  // D5 — Sunday: Prince works 13:00–24:00 with a 15:00–16:00 class; Angelo works 14:00–18:00.
  await block({ teamMemberId: PRINCE, dayOfWeek: 0, startTime: "13:00", endTime: "00:00", blockType: "work", label: "ZZTEMP Sun work P" });
  await block({ teamMemberId: PRINCE, dayOfWeek: 0, startTime: "15:00", endTime: "16:00", blockType: "school", label: "ZZTEMP Class" });
  await block({ teamMemberId: ANGELO, dayOfWeek: 0, startTime: "14:00", endTime: "18:00", blockType: "work", label: "ZZTEMP Sun work A" });
  // D5 — Saturday, to prove the weekend is searched at all.
  await block({ teamMemberId: PRINCE, dayOfWeek: 6, startTime: "18:00", endTime: "21:00", blockType: "work", label: "ZZTEMP Sat work P" });
  await block({ teamMemberId: ANGELO, dayOfWeek: 6, startTime: "18:00", endTime: "20:00", blockType: "work", label: "ZZTEMP Sat work A" });

  const event = async (payload) => {
    const { body, status } = await apiCall("/api/calendar", { method: "POST", body: JSON.stringify(payload) });
    if (status !== 201) throw new Error(`event seed failed: ${JSON.stringify(body)}`);
    created.events.push(body.data.calendarEventId);
  };

  // D5 — a real 16:30–17:00 booking on that Sunday, which must be carved out.
  const sun = upcoming(0);
  // Local date parts, NOT toISOString().slice(0,10) — for a Date at Manila local midnight
  // that returns the PREVIOUS day, which is the same class of bug this script verifies.
  const pad2 = (n) => String(n).padStart(2, "0");
  const localKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const iso = (d, h, m) => new Date(`${localKey(d)}T${pad2(h)}:${pad2(m)}:00+08:00`).toISOString();
  await event({ title: "ZZTEMP client call", category: "meeting", startsAt: iso(sun, 16, 30), endsAt: iso(sun, 17, 0) });

  // D11 — a three-day event. Anchored to the 9th so it sits inside the current month grid.
  const nine = new Date();
  nine.setDate(9);
  const eleven = new Date(nine);
  eleven.setDate(11);
  await event({ title: "ZZTEMP three day workshop", category: "event", startsAt: iso(nine, 10, 0), endsAt: iso(eleven, 16, 0) });

  // D1 / D7 / D14 / D17 — a deliverable due TODAY.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const projects = await apiCall("/api/projects");
  const projectId = projects.body.data[0].projectId;
  const { body, status } = await apiCall("/api/deliverables", {
    method: "POST",
    body: JSON.stringify({ projectId, title: "ZZTEMP tz probe", status: "not_started", priority: 1, dueDate: today }),
  });
  if (status !== 201) throw new Error(`deliverable seed failed: ${JSON.stringify(body)}`);
  created.deliverables.push(body.data.deliverableId);

  return { today };
}

async function teardown() {
  try {
    await authenticate();
    for (const id of created.deliverables) await apiCall(`/api/deliverables/${id}`, { method: "DELETE" });
    for (const id of created.events) await apiCall(`/api/calendar/${id}`, { method: "DELETE" });
    for (const id of created.blocks) await apiCall(`/api/availability/${id}`, { method: "DELETE" });
    console.log(
      `\ncleaned up ${created.deliverables.length} deliverable(s), ${created.events.length} event(s), ${created.blocks.length} block(s)`,
    );
  } catch (err) {
    console.error(`CLEANUP FAILED — remove ZZTEMP rows by hand: ${err.message}`);
  }
}

const { today } = await seed();
console.log(`seeded fixtures; deliverable due today (${today} Manila)\n`);

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  timezoneId: "Asia/Manila",
});
const page = await context.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

const openSection = async (name) => {
  // Make sure no dialog is still capturing clicks before touching the sidebar.
  for (let i = 0; i < 3; i++) {
    if (!(await page.getByRole("dialog").first().isVisible().catch(() => false))) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  const item = page.getByRole("button", { name, exact: true }).first();
  await item.scrollIntoViewIfNeeded().catch(() => {});
  await item.click({ timeout: 15000 });
  await page.waitForTimeout(1500);
};

try {
  // ── Sign in ────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const toPassword = page.getByText("Sign in with password instead");
  if (await toPassword.isVisible().catch(() => false)) await toPassword.click();
  await page.fill("#email-pw", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  check("signed in as admin", true, page.url());

  // ── D3: sub-hour blocks render ─────────────────────
  await openSection("Availability");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01-availability-grid.png`, fullPage: true });

  const lunch = page.locator('[title*="ZZTEMP Lunch"]');
  const standup = page.locator('[title*="ZZTEMP Standup"]');
  const lunchCount = await lunch.count();
  const standupCount = await standup.count();
  check(
    "D3 — a 13:15–13:45 block renders in the grid",
    lunchCount > 0,
    `${lunchCount} element(s) titled ZZTEMP Lunch`,
  );
  check(
    "D3 — a 09:00–09:30 block renders in the grid",
    standupCount > 0,
    `${standupCount} element(s) titled ZZTEMP Standup`,
  );

  if (lunchCount > 0) {
    const box = await lunch.first().boundingBox();
    // 30 minutes of a 40px hour row is ~20px, minus 4px padding.
    check(
      "D3 — the 30-minute block is drawn at half-hour height, not a full hour",
      box && box.height > 8 && box.height < 26,
      box ? `height ${Math.round(box.height)}px (a full hour row is 40px)` : "no box",
    );
    await page.screenshot({
      path: `${OUT}/02-subhour-block-closeup.png`,
      clip: { x: box.x - 240, y: box.y - 90, width: 620, height: 240 },
    });
  }

  // ── D10: clicking the 12am row prefills midnight ───
  const midnightCell = page.locator("div.min-h-\\[40px\\].border-t.border-l").nth(1);
  await midnightCell.click();
  await page.waitForTimeout(700);
  const dlg = page.getByRole("dialog");
  const startVal = await dlg.locator('input[type="time"]').first().inputValue();
  const endVal = await dlg.locator('input[type="time"]').nth(1).inputValue();
  check(
    "D10 — clicking the 12am row prefills 00:00, not 09:00",
    startVal === "00:00",
    `start="${startVal}" end="${endVal}"`,
  );
  await page.screenshot({ path: `${OUT}/03-midnight-cell-dialog.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // ── D5: free time ──────────────────────────────────
  // Fixtures (see the report): Prince works Sun 13:00–24:00 with a 15:00–16:00 school
  // block; Angelo works Sun 14:00–18:00. A 16:30–17:00 meeting sits on Sun 6 Sep. Both
  // work Sat 18:00–21:00 / 18:00–20:00.
  await page.getByRole("button", { name: /Find free time/ }).click();
  await page.waitForTimeout(1000);

  // Narrow to exactly Prince (100) and Angelo (101) so the expected answer is
  // deterministic. Everyone else has no work blocks at all, and a member with no work
  // blocks is correctly never free, which would empty the intersection.
  const chips = page.locator('[data-testid^="freetime-member-"]');
  const chipCount = await chips.count();
  for (let i = 0; i < chipCount; i++) {
    const chip = chips.nth(i);
    const id = (await chip.getAttribute("data-testid")).replace("freetime-member-", "");
    const wanted = id === "100" || id === "101";
    const pressed = (await chip.getAttribute("aria-pressed")) === "true";
    if (pressed !== wanted) {
      await chip.click();
      await page.waitForTimeout(200);
    }
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/04-free-time.png`, fullPage: true });

  const freeText = await page.locator("body").innerText();
  const slots = [...freeText.matchAll(/(Sun|Sat|Mon|Tue|Wed|Thu|Fri) \w+ \d+ (\d\d:\d\d) – (\d\d:\d\d)/g)]
    .map((m) => `${m[1]} ${m[2]}-${m[3]}`);
  console.log("      slots offered:", slots.join(" | ") || "(none)");

  check(
    "D5 — the free-time panel names the window it searched",
    /Next 7 days/.test(freeText),
    "panel meta present",
  );
  check(
    "D5 — a WEEKEND slot is offered (the old loop ran day=1..5 and never looked)",
    slots.some((s) => s.startsWith("Sat") || s.startsWith("Sun")),
    slots.filter((s) => /^(Sat|Sun)/.test(s)).join(", ") || "none",
  );
  check(
    "D5 — the 15:00–16:00 school block is EXCLUDED, not proposed through",
    !slots.some((s) => s === "Sun 15:00-16:00") && slots.includes("Sun 14:00-15:00"),
    "Sun free time stops at 15:00 and does not span the class",
  );
  check(
    "D5 — the 16:30 meeting is subtracted from the slot it sits in",
    slots.includes("Sun 16:00-16:30") && slots.includes("Sun 17:00-18:00"),
    "the 16:00–18:00 window is split around the booking",
  );
  check(
    "D5 — no slot shorter than the 30-minute minimum is offered",
    slots.every((s) => {
      const [, a, b] = s.match(/(\d\d:\d\d)-(\d\d:\d\d)/);
      const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      return m(b) - m(a) >= 30;
    }),
    `${slots.length} slot(s) checked`,
  );
  check(
    "D5 — no duplicate slots from a member's overlapping work blocks",
    new Set(slots).size === slots.length,
    `${slots.length} offered, ${new Set(slots).size} distinct`,
  );

  await page.getByRole("button", { name: /Find free time/ }).click();
  await page.waitForTimeout(500);

  // ── D2: bounded recurrence on the month grid ───────
  await openSection("Calendar");
  await page.waitForTimeout(2000);
  const thisMonth = await page.locator("body").innerText();
  const semesterNow = (thisMonth.match(/ZZTEMP Semester/g) || []).length;
  check(
    "D2 — a block whose window covers today DOES appear",
    semesterNow > 0,
    `${semesterNow} chip(s) in the current month`,
  );
  await page.screenshot({ path: `${OUT}/05-calendar-current-month.png`, fullPage: true });

  // D11 — a 9–11 Sep event must appear on all three days, not only the 9th.
  const workshopDays = (thisMonth.match(/ZZTEMP three day workshop/g) || []).length;
  check(
    "D11 — a three-day event is shown on all three of its days",
    workshopDays === 3,
    `${workshopDays} cell(s) carry the event (was 1: bucketed by start day only)`,
  );

  // 36 months forward = 3 years.
  for (let i = 0; i < 36; i++) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await page.waitForTimeout(2500);
  const monthLabel = await page.locator("span.w-36").first().innerText().catch(() => "?");
  const laterText = await page.locator("body").innerText();
  const semesterLater = (laterText.match(/ZZTEMP Semester/g) || []).length;
  check(
    "D2 — three years on, the expired block is gone",
    semesterLater === 0,
    `${semesterLater} chip(s) in ${monthLabel}`,
  );
  check(
    "D2 — an UNBOUNDED block still projects (open-ended is not expired)",
    /Classes/.test(laterText),
    `"Classes" has no effective_to, so it correctly remains in ${monthLabel}`,
  );
  await page.screenshot({ path: `${OUT}/06-calendar-three-years-on.png`, fullPage: true });

  // ── D12: saving with a cleared date ────────────────
  await page.getByRole("button", { name: /Add event/ }).click();
  await page.waitForTimeout(800);
  const evDlg = page.getByRole("dialog");
  await evDlg.getByPlaceholder("Title").fill("ZZTEMP no-date");
  await evDlg.locator('input[type="date"]').fill("");
  await page.waitForTimeout(300);
  await evDlg.getByRole("button", { name: /^Add event$/ }).click();
  await page.waitForTimeout(1200);
  const afterSave = await page.locator("body").innerText();
  const dialogStillOpen = await evDlg.isVisible().catch(() => false);
  check(
    "D12 — clearing the date produces a visible message instead of a dead button",
    /Date required|Pick a valid date/.test(afterSave),
    dialogStillOpen ? "toast shown, dialog kept open with the typed values" : "dialog closed",
  );
  check(
    "D12 — no uncaught RangeError from toISOString on an Invalid Date",
    !consoleErrors.some((e) => /RangeError|Invalid time value/.test(e)),
    consoleErrors.filter((e) => /RangeError/.test(e)).join(" | ") || "none",
  );
  await page.screenshot({ path: `${OUT}/07-cleared-date-message.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // ── D1: overdue in the deliverables table ──────────
  await openSection("Deliverables");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/08-deliverables.png`, fullPage: true });

  const probeRow = page.locator("div").filter({ hasText: /^ZZTEMP tz probe/ }).last();
  const probeText = await probeRow.innerText().catch(() => "");
  check(
    "D1 — a deliverable due TODAY is not labelled Overdue",
    !/Overdue/.test(probeText),
    `row reads: ${probeText.replace(/\s+/g, " ").slice(0, 90)}`,
  );
  check(
    "D1 — and it renders the Manila date (Sep 2), not the UTC date (Sep 1)",
    /Sep 2/.test(probeText),
    "due column",
  );

  // ── D14: inline status change reconciles with the server ───
  // The server writes completed_at on the transition. The optimistic patch cannot know
  // that, so without an invalidate the UI showed its own guess forever.
  const statusTrigger = page
    .locator("div")
    .filter({ hasText: /^ZZTEMP tz probe/ })
    .last()
    .locator("button[role=combobox]")
    .first();
  await statusTrigger.click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name: "Completed" }).click();
  await page.waitForTimeout(2500);

  const statusLabel = await statusTrigger.innerText();
  check(
    "D14 — the inline status change survives the refetch it now triggers",
    /Completed/.test(statusLabel),
    `select reads "${statusLabel.trim()}" after invalidate+refetch (completed_at asserted in psql)`,
  );
  await page.screenshot({ path: `${OUT}/09-status-completed.png`, fullPage: true });

  // Put it back, which also exercises completed_at being CLEARED on reopen.
  await statusTrigger.click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name: "Not Started" }).click();
  await page.waitForTimeout(2500);

  // ── D17: deleting asks first ───────────────────────
  const editBtn = page
    .locator("div")
    .filter({ hasText: /^ZZTEMP tz probe/ })
    .last()
    .locator('button[aria-label="Edit deliverable"]')
    .first();
  await editBtn.click();
  await page.waitForTimeout(800);
  await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).click();
  await page.waitForTimeout(800);
  const alert = page.getByRole("alertdialog");
  const alertVisible = await alert.isVisible().catch(() => false);
  const alertText = alertVisible ? await alert.innerText() : "";
  check(
    "D17 — clicking Delete asks for confirmation instead of deleting",
    alertVisible && /cannot be undone/i.test(alertText),
    alertText.replace(/\s+/g, " ").slice(0, 100),
  );
  check(
    "D17 — the prompt names the record being deleted",
    /ZZTEMP tz probe/.test(alertText),
    "record named in the prompt",
  );
  await page.screenshot({ path: `${OUT}/10-delete-confirmation.png`, fullPage: true });

  // Cancel. The row must survive.
  await alert.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(1200);
  const stillThere = await page.locator("body").innerText();
  check(
    "D17 — cancelling leaves the record alone",
    /ZZTEMP tz probe/.test(stillThere),
    "row still present after Cancel",
  );

  check("no uncaught page errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "clean");
} catch (err) {
  check("script completed", false, err.message);
  await page.screenshot({ path: `${OUT}/99-failure.png`, fullPage: true }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
  await teardown();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${OUT}/`);
process.exit(failed.length === 0 ? 0 : 1);
