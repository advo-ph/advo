/**
 * Measures the "What we build" cross-fade in a real browser.
 *
 * This replaces verify-industry-pin.mjs. That script asserted a sticky pin held
 * each row for a screen and a half; Prince rejected the pin on 09-03 for
 * hijacking the page scroll, so there is no pin left to assert on.
 *
 * The claims under test now are:
 *   1. the section is back to its natural length and nothing in it is sticky,
 *   2. the photograph cross-fades from the first slide to the last as the row
 *      travels the viewport, continuously and without stepping,
 *   3. the last slide is reached while the photograph is still on screen,
 *   4. scrolling the section does not drop frames.
 *
 * Every number printed is read off the live layout or off real frame times.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const URL = process.env.URL ?? "http://localhost:5199/";
const OUT = "process/general-plans/reports/industry-scroll-fade";
mkdirSync(OUT, { recursive: true });

const FOOD = 0;

/** Mirrors FADE_ENTER / FADE_EXIT in LandingPage.tsx. Change both together. */
const FADE_ENTER = 0.8;
const FADE_EXIT = 0.2;

const report = { generated: new Date().toISOString(), url: URL, window: { FADE_ENTER, FADE_EXIT } };

const settle = async (page) => {
  // networkidle never fires: the hero video streams. Wait on the DOM instead.
  // Not on decode(): the slides are loading="lazy", and decode() on an image
  // the browser has not started fetching stays pending forever rather than
  // rejecting, which hangs the run before it prints anything.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".landing-industry-row");
  // Inter arrives from Google Fonts. Measure before it lands and one row of
  // copy wraps to an extra line on fallback metrics, which moved #services by
  // 26px between two runs of identical code. Section height is only a
  // comparable number once the type is the type.
  await page.evaluate(() => document.fonts.ready).catch(() => null);
  await page.waitForTimeout(600);
};

/** Waits for one row's photographs, which only start loading once the row is
 *  near the viewport. Opacity can be read before this; a screenshot cannot. */
const loadRowImages = async (page, index) => {
  await page
    .waitForFunction(
      `[...document.querySelectorAll(".landing-industry-row")[${index}].querySelectorAll("img")]
         .every((img) => img.complete && img.naturalWidth > 0)`,
      null,
      { timeout: 15000 },
    )
    .catch(() => console.log(`   note: row ${index} images did not all finish loading`));
};

/** Section geometry, and proof that nothing in it is pinned. */
const sectionGeometry = () =>
  `(() => {
    const s = document.getElementById("services");
    const rows = [...document.querySelectorAll(".landing-industry-row")];
    const sticky = rows.filter((r) =>
      [r, ...r.querySelectorAll("*")].some((el) => {
        const p = getComputedStyle(el).position;
        return p === "sticky" || p === "fixed";
      }),
    ).length;
    return {
      vh: window.innerHeight,
      height: +s.getBoundingClientRect().height.toFixed(1),
      screens: +(s.getBoundingClientRect().height / window.innerHeight).toFixed(2),
      document: document.documentElement.scrollHeight,
      stickyDescendants: sticky,
      rows: rows.map((r) => ({
        title: r.querySelector("h3").textContent,
        height: +r.getBoundingClientRect().height.toFixed(1),
        slides: r.querySelectorAll(".landing-industry-slide").length,
        offers: r.querySelectorAll(".landing-industry-offer li").length,
        fades: r.classList.contains("is-fading"),
      })),
    };
  })()`;

/** What one row is showing right now, read from computed style. */
const rowState = (index) =>
  `(() => {
    const row = document.querySelectorAll(".landing-industry-row")[${index}];
    const media = row.querySelector(".landing-industry-media");
    const b = media.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const vh = window.innerHeight;
    return {
      vh,
      rowTop: +r.top.toFixed(0),
      rowBottom: +r.bottom.toFixed(0),
      mediaTop: +b.top.toFixed(0),
      mediaBottom: +b.bottom.toFixed(0),
      // How much of the photograph is inside the viewport, 0..1.
      mediaVisible: +(
        Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0)) / b.height
      ).toFixed(2),
      opacity: [...row.querySelectorAll(".landing-industry-slide")].map(
        (s) => +Number(getComputedStyle(s).opacity).toFixed(3),
      ),
      active: [...row.querySelectorAll(".landing-industry-offer li")].findIndex((li) =>
        li.classList.contains("is-active"),
      ),
    };
  })()`;

/**
 * The row's whole travel past the viewport: from its top edge touching the
 * bottom of the screen, to its bottom edge touching the top. That is
 * `viewport + row height` of scrolling.
 *
 * Not "row bottom at the bottom of the screen, to row top at the top": for a
 * row shorter than the viewport that pair is only `viewport - row height`
 * apart, which on the Food row is 364px of the desktop travel and 82px of the
 * mobile one. Sampling that slice reports a fade that neither starts nor
 * finishes, because it never looks at the ends.
 */
const travelOf = (anchor) => ({
  from: anchor.top - anchor.vh,
  to: anchor.top + anchor.height,
});

const anchorOf = (page, index) =>
  page.evaluate(
    `(() => {
      const row = document.querySelectorAll(".landing-industry-row")[${index}];
      const r = row.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height, vh: window.innerHeight };
    })()`,
  );

/**
 * Scrolls to the exact point where the fade should be sitting on slide `pos`,
 * solved from the shipped constants, and reports what is actually on screen.
 *
 * The uniform sweep below cannot do this. On a phone the whole fade runs in
 * about 506px of scroll, so a 17-step sweep of the row's 1627px of travel puts
 * only five samples inside it and straddles the peak: it read the middle slide
 * at 0.895 and called the hand-over stepped, when the function it is sampling
 * passes through 1.000. These probes land on the value being claimed.
 */
const probePos = async (page, index, pos, count) => {
  const seek = (p) =>
    `(() => {
      const row = document.querySelectorAll(".landing-industry-row")[${index}];
      const media = row.querySelector(".landing-industry-media");
      const vh = window.innerHeight;
      const progress = ${p} / ${count - 1};
      const target = (${FADE_ENTER} - (${FADE_ENTER} - ${FADE_EXIT}) * progress) * vh;
      const b = media.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + (b.top + b.height / 2 - target));
      return true;
    })()`;
  // Twice: the first pass can clamp at the top of the document, and the second
  // confirms the position is a fixed point.
  await page.evaluate(seek(pos));
  await page.evaluate(seek(pos));
  await page.waitForTimeout(320);
  return { pos, ...(await page.evaluate(rowState(index))) };
};

/** Walks the row past the viewport and samples the slide opacities. */
const sampleFade = async (page, index, steps = 17) => {
  const anchor = await anchorOf(page, index);
  const { from, to } = travelOf(anchor);
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const at = Math.max(0, from + ((to - from) * i) / (steps - 1));
    await page.evaluate((y) => window.scrollTo(0, y), at);
    // Longer than the 150ms CSS transition, so the sample is the settled
    // value rather than a frame caught mid-transition.
    await page.waitForTimeout(260);
    out.push({
      t: +(i / (steps - 1)).toFixed(2),
      scrollY: Math.round(at),
      ...(await page.evaluate(rowState(index))),
    });
  }
  return { anchor, samples: out };
};

/** Real frame times while the wheel is turning. */
const measureFrames = async (page, index) => {
  await page.evaluate(
    `(() => {
      const row = document.querySelectorAll(".landing-industry-row")[${index}];
      window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - window.innerHeight);
      window.__frame = [];
      window.__long = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__long.push(+e.duration.toFixed(1));
      }).observe({ entryTypes: ["longtask"] });
      let last = performance.now();
      const tick = (now) => {
        window.__frame.push(now - last);
        last = now;
        window.__rafId = requestAnimationFrame(tick);
      };
      window.__rafId = requestAnimationFrame(tick);
    })()`,
  );
  await page.waitForTimeout(300);
  // 60 wheel notches at 100px, roughly a reader scrolling briskly through the
  // section. Real wheel events, not scrollTo, so the coalescing path is the
  // one under test.
  await page.mouse.move(700, 450);
  for (let i = 0; i < 60; i += 1) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(300);
  const raw = await page.evaluate(
    `(() => {
      cancelAnimationFrame(window.__rafId);
      return { frame: window.__frame.slice(6), long: window.__long };
    })()`,
  );
  const frame = raw.frame.filter((d) => d > 0);
  frame.sort((a, b) => a - b);
  const at = (q) => +frame[Math.min(frame.length - 1, Math.floor(frame.length * q))].toFixed(1);
  return {
    frames: frame.length,
    averageMs: +(frame.reduce((a, b) => a + b, 0) / frame.length).toFixed(2),
    medianMs: at(0.5),
    p95Ms: at(0.95),
    worstMs: +frame[frame.length - 1].toFixed(1),
    // A frame is dropped when it took longer than two 60Hz budgets.
    droppedOver33ms: frame.filter((d) => d > 33.4).length,
    longTasks: raw.long.length,
    longTaskMs: raw.long,
  };
};

const browser = await chromium.launch();

for (const [label, w, h] of [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await settle(page);

  console.log(`\n${"=".repeat(78)}\n${label}  ${w}x${h}\n${"=".repeat(78)}`);

  const geo = await page.evaluate(sectionGeometry());
  console.log(
    `#services ${geo.height}px = ${geo.screens} viewport heights   document ${geo.document}px`,
  );
  console.log(
    `   ${geo.stickyDescendants === 0 ? "PASS" : "FAIL"}  nothing in the section is sticky or fixed (${geo.stickyDescendants} found)`,
  );
  for (const r of geo.rows) {
    console.log(
      `      ${String(r.height).padStart(7)}px  ${r.slides} slides  ${r.offers} offers  fades=${r.fades}  ${r.title}`,
    );
  }

  await loadRowImages(page, FOOD);
  const { anchor, samples } = await sampleFade(page, FOOD);
  console.log(
    `\n-- Food row cross-fade   row ${anchor.height.toFixed(0)}px tall, sampled across its full ${(anchor.height + anchor.vh).toFixed(0)}px of travel`,
  );
  console.log(
    `   t     rowTop  mediaTop..Bottom  onScreen  opacity                      active`,
  );
  for (const s of samples) {
    console.log(
      `   ${s.t.toFixed(2)}  ${String(s.rowTop).padStart(6)}  ` +
        `${String(s.mediaTop).padStart(6)}..${String(s.mediaBottom).padStart(6)}  ` +
        `${String(Math.round(s.mediaVisible * 100)).padStart(6)}%  ` +
        `[${s.opacity.map((o) => o.toFixed(3)).join(", ").padEnd(24)}]  ${s.active}`,
    );
  }

  const last = (s) => s.opacity[s.opacity.length - 1];
  const slides = samples[0].opacity.length;

  // The five states the fade is claimed to pass through, each probed at the
  // exact scroll position the shipped constants put it at.
  const probe = [];
  for (const pos of [0, 0.5, 1, 1.5, 2]) probe.push(await probePos(page, FOOD, pos, slides));
  console.log(`\n-- probed at the exact position of each slide and each hand-over`);
  console.log(`   pos   rowTop  mediaTop..Bottom  onScreen  opacity                      active`);
  for (const p of probe) {
    console.log(
      `   ${p.pos.toFixed(1)}  ${String(p.rowTop).padStart(7)}  ` +
        `${String(p.mediaTop).padStart(6)}..${String(p.mediaBottom).padStart(6)}  ` +
        `${String(Math.round(p.mediaVisible * 100)).padStart(6)}%  ` +
        `[${p.opacity.map((o) => o.toFixed(3)).join(", ").padEnd(24)}]  ${p.active}`,
    );
  }
  const at = (pos) => probe.find((p) => p.pos === pos);

  const checks = {
    // Endpoints and the middle, on the nose.
    startsOnFirst: at(0).opacity[0] >= 0.99 && last(at(0)) <= 0.01 && at(0).active === 0,
    throughMiddle: at(1).opacity[1] >= 0.99 && at(1).opacity[0] <= 0.01 && at(1).opacity[2] <= 0.01,
    endsOnLast: last(at(2)) >= 0.99 && at(2).opacity[0] <= 0.01 && at(2).active === slides - 1,
    // Both hand-overs are a real blend, not a cut.
    handsOverEvenly:
      Math.abs(at(0.5).opacity[0] - at(0.5).opacity[1]) < 0.06 &&
      Math.abs(at(1.5).opacity[1] - at(1.5).opacity[2]) < 0.06,
    // The photograph is still on screen when the last slide arrives, which is
    // the thing the rejected pin was bought to guarantee.
    lastSlideWhileOnScreen: at(2).mediaVisible >= 0.9,
    // The sweep is the continuity evidence: intermediate values on the way
    // through, and the box never goes blank.
    crossFades:
      samples.filter((s) => s.opacity.filter((o) => o > 0.02 && o < 0.98).length >= 2).length >= 2,
    neverBlank: samples.every((s) => s.opacity.reduce((a, b) => a + b, 0) >= 0.95),
    // The sweep also has to start and end settled, or the fade is running
    // outside the row's own time on screen.
    settledBeforeAndAfter:
      samples[0].opacity[0] >= 0.99 && last(samples[samples.length - 1]) >= 0.99,
  };
  console.log(
    `\n   last slide arrives with the photograph ${Math.round(at(2).mediaVisible * 100)}% on screen (media ${at(2).mediaTop}..${at(2).mediaBottom} of ${at(2).vh})`,
  );
  for (const [k, v] of Object.entries(checks)) console.log(`   ${v ? "PASS" : "FAIL"}  ${k}`);

  const frames = await measureFrames(page, FOOD);
  console.log(
    `\n-- frame timing over 60 wheel notches through the section` +
      `\n   ${frames.frames} frames   average ${frames.averageMs}ms   median ${frames.medianMs}ms   p95 ${frames.p95Ms}ms   worst ${frames.worstMs}ms` +
      `\n   ${frames.droppedOver33ms} frames over 33.4ms   ${frames.longTasks} long tasks${frames.longTasks ? ` [${frames.longTaskMs.join(", ")}]` : ""}`,
  );
  console.log(
    `   ${frames.droppedOver33ms === 0 ? "PASS" : "WARN"}  no dropped frames` +
      `\n   ${frames.longTasks === 0 ? "PASS" : "WARN"}  no long tasks`,
  );

  // Screenshots at the same exact positions the probes used, so a frame
  // labelled "slide 2" is one where slide 2 was measured at full opacity.
  const prefix = label === "mobile" ? ["05", "06", "07", "08"] : ["01", "02", "03", "04"];
  const shots = [
    [`${prefix[0]}-food-slide-1`, 0],
    [`${prefix[1]}-food-mid-fade`, 0.5],
    [`${prefix[2]}-food-slide-2`, 1],
    [`${prefix[3]}-food-slide-3`, 2],
  ];
  console.log(`\n-- screenshots`);
  const taken = [];
  for (const [name, pos] of shots) {
    await probePos(page, FOOD, pos, slides);
    await loadRowImages(page, FOOD);
    await page.waitForTimeout(420);
    const now = await page.evaluate(rowState(FOOD));
    await page.screenshot({ path: `${OUT}/${name}.png` });
    taken.push({ shot: `${name}.png`, pos, opacity: now.opacity, active: now.active });
    console.log(
      `   ${name}.png   pos=${pos}  opacity [${now.opacity.map((o) => o.toFixed(3)).join(", ")}]  active=${now.active}`,
    );

  }

  report[label] = { geometry: geo, fade: { anchor, samples, probe, checks }, frames, shots: taken };
  await ctx.close();
}

// Reduced motion: one photograph, no fade, and the same section length.
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await settle(page);
  const geo = await page.evaluate(sectionGeometry());
  const state = {
    screens: geo.screens,
    height: geo.height,
    stickyDescendants: geo.stickyDescendants,
    fadingRows: geo.rows.filter((r) => r.fades).length,
    slidesOnFoodRow: geo.rows[FOOD].slides,
    offersOnFoodRow: geo.rows[FOOD].offers,
  };
  console.log(`\n${"=".repeat(78)}\nreduced motion 1440x900\n${"=".repeat(78)}`);
  console.log(`   ${JSON.stringify(state)}`);
  console.log(
    `   ${state.fadingRows === 0 ? "PASS" : "FAIL"}  no row fades` +
      `\n   ${state.slidesOnFoodRow === 1 ? "PASS" : "FAIL"}  one slide only` +
      `\n   ${state.offersOnFoodRow === 3 ? "PASS" : "FAIL"}  every offer still in the DOM`,
  );
  report.reducedMotion = state;
  await page.evaluate(() => {
    const row = document.querySelectorAll(".landing-industry-row")[0];
    window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - 120);
  });
  await loadRowImages(page, FOOD);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/09-reduced-motion.png` });
  await ctx.close();
}

writeFileSync(`${OUT}/measurements.json`, JSON.stringify(report, null, 2));
console.log(`\nwrote ${OUT}/measurements.json`);
await browser.close();
