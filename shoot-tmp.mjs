import { chromium } from "playwright";
const out = process.argv[2];
const only = process.argv[3]; // optional: desktop | mobile
const browser = await chromium.launch();
for (const [name, vp, mobile] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  if (only && only !== name) continue;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  const decline = page.getByRole("button", { name: /decline|reject|no thanks|essential only/i }).first();
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.waitForSelector(".work-track");
  const info = await page.evaluate(() => {
    const t = document.querySelector(".work-track");
    const r = t.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height, vh: innerHeight };
  });
  const n = 7;
  console.log(name, JSON.stringify(info), "n", n);
  const range = info.height - info.vh;
  // pos -> scrollY (enter: pos<0, pin: 0..n-1, exit: >n-1)
  const yFor = (p) => {
    if (p < 0) return info.top - info.vh + (1 + p / 1.3) * info.vh;
    if (p > n - 1) return info.top + range + (p - (n - 1)) * info.vh;
    // Mirror WorkShowcase's scroll plan: laptops 0-3, phones 4-6.
    const steps = [1, 1, 1, 0.5, 1, 1];
    const total = steps.reduce((a, b) => a + b, 0);
    const k = Math.min(steps.length - 1, Math.floor(p));
    const f = p - k;
    let lo = 0, hi = 1;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; (m * m * (3 - 2 * m) < f ? (lo = m) : (hi = m)); }
    const left = steps.slice(0, k).reduce((a, b) => a + b, 0) + steps[k] * (0.26 + lo * 0.48);
    return info.top + (left / total) * range;
  };
  const stops = (process.env.STOPS ?? "").split(",").filter(Boolean).map(Number);
  let i = 1;
  for (const p of stops) {
    await page.evaluate((y) => window.scrollTo(0, y), yFor(p));
    await page.waitForTimeout(1600);
    const title = await page.evaluate(() => document.querySelector(".work-info-title")?.textContent?.trim());
    await page.screenshot({ path: `${out}/${name}-${String(i++).padStart(2, "0")}-pos${p}.png` });
    console.log(name, p, title);
  }
  console.log("errors:", errs.filter((e) => !/fetchPriority|favicon|analytics/i.test(e)).slice(0, 5));
  await ctx.close();
}
await browser.close();
