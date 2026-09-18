import { chromium } from "@playwright/test";

const baseUrl = process.env.WEB_URL ?? "http://127.0.0.1:5175/";
const viewports = [
  { name: "desktop", width: 1440, height: 900, columns: 3 },
  { name: "mobile", width: 390, height: 844, columns: 1 },
];

const expectedLabels = ["Parking", "Education", "Flood"];
const expectedHeading = "Building Real-World Technological Solutions";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const failures = [];

    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 500) failures.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const solutions = page.locator("#solutions");
    await solutions.waitFor({ state: "attached" });
    await solutions.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#solutions img")].every((image) => image.complete && image.naturalWidth > 0),
    );

    const result = await page.evaluate(() => {
      const section = document.querySelector("#solutions");
      const services = document.querySelector("#services");
      const grid = section?.querySelector(".landing-industry-grid");
      const cards = [...(section?.querySelectorAll(".landing-industry-card") ?? [])];
      const images = cards.map((card) => card.querySelector("img"));
      const columns = grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length : 0;

      return {
        heading: section?.querySelector("h2")?.textContent?.trim() ?? "",
        labels: [...(section?.querySelectorAll(".landing-industry-label") ?? [])].map((label) =>
          label.textContent?.trim(),
        ),
        cardCount: cards.length,
        columns,
        hasLegacyIntro: section?.textContent?.includes("Paper, Viber, tally sheets.") ?? false,
        hasHiddenIndustry: /Medical|Businesses|Food/.test(section?.textContent ?? ""),
        educationAuth: section?.textContent?.includes(
          "Student IDs tap in at gates, integrated with attendance monitoring.",
        ),
        educationSafety: section?.textContent?.includes(
          "Turnstile tap ID entrance and exit with industry-grade baggage scanning.",
        ),
        educationApp: section?.textContent?.includes(
          "A dedicated website and app for the institution and its students.",
        ),
        beforeServices: Boolean(
          section && services && section.compareDocumentPosition(services) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        sectionOverflow: section ? section.scrollWidth - section.clientWidth : 999,
        imagesLoaded: images.every((image) => image?.complete && image.naturalWidth > 0),
        floodImage: images.at(-1)?.getAttribute("src") === "/landing/industry/flood.png",
      };
    });

    assert(failures.length === 0, `${viewport.name}: ${failures.join("; ")}`);
    assert(result.heading === expectedHeading, `${viewport.name}: heading mismatch`);
    assert(result.labels.join("|") === expectedLabels.join("|"), `${viewport.name}: solution labels mismatch`);
    assert(result.cardCount === 3, `${viewport.name}: expected 3 solution cards, got ${result.cardCount}`);
    assert(result.columns === viewport.columns, `${viewport.name}: expected ${viewport.columns} grid columns, got ${result.columns}`);
    assert(!result.hasLegacyIntro, `${viewport.name}: legacy solutions intro is still rendered`);
    assert(!result.hasHiddenIndustry, `${viewport.name}: hidden industry card text is still rendered`);
    assert(result.educationAuth && result.educationSafety && result.educationApp, `${viewport.name}: education copy mismatch`);
    assert(result.beforeServices, `${viewport.name}: solutions does not precede services`);
    assert(result.sectionOverflow <= 1, `${viewport.name}: solutions overflows horizontally by ${result.sectionOverflow}px`);
    assert(result.imagesLoaded && result.floodImage, `${viewport.name}: solution images did not load as expected`);

    await page.close();
  }

  console.log("solutions browser verification passed");
} finally {
  await browser.close();
}
