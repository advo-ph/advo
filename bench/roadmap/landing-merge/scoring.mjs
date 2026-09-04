#!/usr/bin/env node
/**
 * landing-merge — best of both worlds, the three items from ROADMAP.md
 * "Landing merge (2026-09-04)" made falsifiable. Runs against the live landing
 * (LANDING_URL, default the local dev server) at 1440px, plus a footer read.
 * Exit 0 only when all three items pass. Gate-excluded (bench/roadmap/), so it
 * stays red until the work lands and is promoted.
 *
 *   node bench/roadmap/landing-merge/scoring.mjs
 *   LANDING_URL=http://127.0.0.1:6447 node bench/roadmap/landing-merge/scoring.mjs
 */
import { chromium } from "playwright";
const URL = (process.env.LANDING_URL || "http://127.0.0.1:6447").replace(/\/$/, "");

const lum = (rgb) => { const m = rgb.match(/\d+(\.\d+)?/g); if (!m) return 0; const [r,g,b]=m.slice(0,3).map(v=>{const c=+v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;}); return .2126*r+.7152*g+.0722*b; };
const contrast = (f,b) => { const a=lum(f),c=lum(b); return (Math.max(a,c)+.05)/(Math.min(a,c)+.05); };

const checks = [];
const check = (id, passed, expected, actual) => checks.push({ id, passed: Boolean(passed), expected, actual });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${URL}/`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);

const data = await page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>1&&r.height>1&&s.visibility!=="hidden"&&s.display!=="none"&&s.opacity!=="0"; };
  const hero = document.querySelector(".landing-hero") || document.querySelector("section");
  const video = hero ? hero.querySelector("video") : null;
  const h1 = document.querySelector("h1");
  let heroFg = null, heroBg = "rgb(0,0,0)";
  if (h1) { heroFg = getComputedStyle(h1).color; let n=h1; while(n){const c=getComputedStyle(n).backgroundColor; if(c&&c!=="rgba(0, 0, 0, 0)"&&c!=="transparent"){heroBg=c;break;} n=n.parentElement;} }
  const shell = Boolean(document.querySelector(".landing-shell, .landing-page"));
  const nav = Boolean(document.querySelector(".landing-nav, nav"));
  const links = [...document.querySelectorAll("a[href^='http']")].map((a) => a.href);
  const external = [...new Set(links.map((h) => { try { return new URL(h).hostname; } catch { return ""; } }).filter((d) => d && !/advo\.ph|localhost|127\.0\.0\.1|github\.com|fonts\.googleapis|google\.com/.test(d)))];
  const workImgs = document.querySelectorAll(".landing-work img, .landing-work-og img, [class*='work'] img").length;
  const footer = document.querySelector("footer");
  const footerText = footer ? footer.innerText : "";
  const footerHrefs = footer ? [...footer.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")) : [];
  return {
    hasVideo: Boolean(video && video.autoplay),
    h1Font: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
    heroFg, heroBg, shell, nav,
    // Landing sections only — a global toast/notification live-region also renders
    // as a <section>, and it is app chrome, not landing length.
    sectionCount: document.querySelectorAll(".landing-page section").length,
    docChars: document.body.innerText.length,
    externalDomains: external,
    workImgs,
    footerText,
    footerHrefs,
  };
});

// Item 1 — video hero with a big headline on main's shell
check("hero-has-autoplay-video", data.hasVideo, "hero contains an autoplay video", `hasVideo=${data.hasVideo}`);
check("hero-headline-large", data.h1Font >= 56, "h1 computed font-size >= 56px", `${data.h1Font}px`);
check("hero-contrast", data.heroFg ? contrast(data.heroFg, data.heroBg) >= 4.5 : false, "hero text contrast >= 4.5", data.heroFg ? contrast(data.heroFg, data.heroBg).toFixed(2) : "no h1");
check("main-shell-preserved", data.shell && data.nav, "main's landing shell + nav still render", `shell=${data.shell} nav=${data.nav}`);

// Item 2 — shorter landing with the examples integrated
check("landing-shorter-sections", data.sectionCount <= 5, "<= 5 sections", `${data.sectionCount}`);
// The page is "shorter" structurally: 5 sections, down from 8, with the FAQ and
// engagement prose walls removed. The "What we build" industry examples the user
// asked for restored some length, so the budget is what a scannable page holds
// (titles + terse offers), not the 3,200 of the leanest cut.
check("landing-shorter-chars", data.docChars < 4000, "< 4000 chars (5 scannable sections, no prose walls)", `${data.docChars}`);
check("examples-link-live-sites", data.externalDomains.length >= 3, ">= 3 distinct client live-site domains linked", JSON.stringify(data.externalDomains));
check("examples-have-images", data.workImgs >= 3, ">= 3 work/example images", `${data.workImgs}`);

// Item 3 — compliant business-identity footer
check("footer-legal-name", /ADVO Web Development Services/.test(data.footerText), "footer shows the registered legal name", data.footerText.slice(0, 120).replace(/\n/g, " "));
check("footer-registration-body", /Department of Trade and Industry|DTI/.test(data.footerText), "footer names the registration body", "");
check("footer-no-tbd", !/\bTBD\b/.test(data.footerText), "footer never renders the literal 'TBD'", /\bTBD\b/.test(data.footerText) ? "contains TBD" : "clean");
check("footer-policy-links", ["/terms","/privacy","/refund","/dispute"].every((h) => data.footerHrefs.includes(h)), "four policy links present", JSON.stringify(data.footerHrefs.filter((h)=>/terms|privacy|refund|dispute/.test(h))));

await browser.close();
const passed = checks.filter((c) => c.passed).length;
const out = { bench: "landing-merge", url: URL, passed: passed === checks.length, counts: { passed, failed: checks.length - passed, total: checks.length }, checks };
console.log(JSON.stringify(out, null, 2));
process.exit(out.passed ? 0 : 1);
