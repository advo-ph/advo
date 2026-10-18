#!/usr/bin/env node
/**
 * Post-build: give every public page real HTML for crawlers that do not run
 * JavaScript, and write the files search engines and AI assistants look for.
 *
 *   dist/<page>/index.html   the page's title, description, canonical, JSON-LD,
 *                            and its rendered text inside #root
 *   dist/sitemap.xml         every public page
 *   dist/llms.txt            a Markdown summary for AI assistants (llmstxt.org)
 *   dist/llms-full.txt       the text of every public page
 *
 * Why: GPTBot, ClaudeBot, and PerplexityBot read the raw HTML. Before this the
 * raw HTML was an empty <div id="root">, so to them advo.ph had no words at all.
 *
 * Visitors never see the prerendered markup. index.html hides [data-prerender]
 * as soon as its first inline script runs, and React's createRoot replaces the
 * contents of #root on mount. The words are the same ones the app renders,
 * because they come from rendering the same AppRoutes.
 *
 * nginx must try $uri/index.html before falling back to /index.html, or every
 * path keeps getting the home page's HTML. scripts/post-deploy-seo.mjs checks this
 * after every deploy and warns when it is missing.
 *
 * The portfolio and team come from the live API. If it is down, the pages still
 * render without them, case studies are left out of the sitemap, and the build
 * carries on with a warning. A broken setup (Vite or the entry cannot load)
 * fails the build, because shipping without this layer would be silent.
 */
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(webRoot, "dist");
const apiOrigin = process.env.VITE_API_URL || "https://api.advo.ph";
const inCi = Boolean(process.env.GITHUB_ACTIONS);

const warn = (message) => console.warn(inCi ? `::warning title=prerender::${message}` : `[prerender] WARN ${message}`);
const log = (message) => console.log(`[prerender] ${message}`);

// The app's API client calls a relative /api in dev mode, which is how Vite's
// SSR loader runs it. Point those calls at the real API, with a timeout so a
// hung API cannot hang the build.
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const target = typeof input === "string" && input.startsWith("/") ? new URL(input, apiOrigin).href : input;
  return nodeFetch(target, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
};

// Two React dev warnings are expected during SSR: useLayoutEffect, and React 18
// not knowing the fetchPriority prop the hero image uses. Keep the log readable.
const expectedWarning = ["useLayoutEffect does nothing on the server", "does not recognize the `fetchPriority` prop"];
const consoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === "string" && expectedWarning.some((text) => args[0].includes(text))) return;
  consoleError(...args);
};

const escapeHtml = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pageUrl = (siteUrl, pagePath) => (pagePath === "/" ? `${siteUrl}/` : `${siteUrl}${pagePath}`);

/**
 * Strip what a text reader does not need and a hidden copy must not do: no
 * scripts, no media downloads, no inline styles that hide text (motion's
 * initial opacity: 0), and every image lazy so the hidden copy fetches nothing.
 */
const cleanMarkup = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|video|audio|canvas|iframe|svg|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(source|track|canvas)\b[^>]*\/?>/gi, "")
    .replace(/\s(style|fetchpriority|srcset|sizes)="[^"]*"/gi, "")
    .replace(/\sloading="[^"]*"/gi, "")
    .replace(/<img\b/gi, '<img loading="lazy"');

const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Markup to readable Markdown-ish text, without the nav and footer every page repeats. */
const toText = (html) =>
  decodeEntities(
    html
      .replace(/<(nav|footer|form)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<h([1-6])\b[^>]*>/gi, (_, level) => `\n\n${"#".repeat(Math.min(Number(level) + 1, 6))} `)
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<(br|\/p|\/div|\/section|\/article|\/header|\/ul|\/ol|\/dl|\/dt|\/dd|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, all) => line || all[index - 1])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const setTag = (html, pattern, replacement, label) => {
  if (!pattern.test(html)) throw new Error(`index.html has no ${label} to replace`);
  return html.replace(pattern, replacement);
};

const applyPage = (template, page, body, jsonLd, siteUrl) => {
  const url = pageUrl(siteUrl, page.path);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  let html = template;
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`, "<title>");
  html = setTag(html, /(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${description}$2`, "description");
  html = setTag(html, /(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${title}$2`, "og:title");
  html = setTag(html, /(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${description}$2`, "og:description");
  html = setTag(html, /(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escapeHtml(url)}$2`, "og:url");
  html = setTag(html, /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${title}$2`, "twitter:title");
  html = setTag(html, /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${description}$2`, "twitter:description");
  if (page.image) {
    const image = escapeHtml(page.image.url);
    const alt = escapeHtml(page.image.alt);
    html = setTag(html, /(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${image}$2`, "og:image");
    html = setTag(html, /(<meta\s+property="og:image:secure_url"\s+content=")[^"]*(")/, `$1${image}$2`, "og:image:secure_url");
    html = setTag(html, /(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/, `$1${alt}$2`, "og:image:alt");
    html = setTag(html, /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, `$1${image}$2`, "twitter:image");
    html = setTag(html, /(<meta\s+name="twitter:image:alt"\s+content=")[^"]*(")/, `$1${alt}$2`, "twitter:image:alt");
  }

  // The root file is also nginx's fallback for private and unknown paths, so it
  // carries no canonical; RouteSeo sets the right one, or noindex, in the browser.
  const canonical = page.path === "/" ? "" : `    <link rel="canonical" href="${escapeHtml(url)}" />\n`;
  const ld = `    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n`;
  html = html.replace("</head>", `${canonical}${ld}  </head>`);

  html = setTag(html, /<div id="root"><\/div>/, `<div id="root"><div data-prerender>${body}</div></div>`, '<div id="root"></div>');
  return html;
};

const outFile = (pagePath) => (pagePath === "/" ? path.join(dist, "index.html") : path.join(dist, pagePath.slice(1), "index.html"));

const vite = await createServer({
  root: webRoot,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const entry = await vite.ssrLoadModule("/src/seo/prerender-entry.tsx");
  const { SITE_URL } = entry;
  const template = await readFile(path.join(dist, "index.html"), "utf8");

  const data = await entry.loadData();
  if (!data.portfolio) warn(`Could not read the portfolio from ${apiOrigin}. Pages render without it and case studies are left out of the sitemap.`);
  if (!data.people) warn(`Could not read the team from ${apiOrigin}. Team sections render without it.`);

  const portfolioSlugs = (data.portfolio ?? []).map((item) => item.slug).filter(Boolean);
  const pages = entry.publicPages(portfolioSlugs);
  const fullText = [];

  for (const page of pages) {
    let body = "";
    try {
      body = cleanMarkup(entry.render(page.path, data.client));
    } catch (error) {
      warn(`${page.path} did not render (${error instanceof Error ? error.message : error}). It ships with head tags only.`);
    }
    const jsonLd = entry.structuredData(page, data.people ?? []);
    const html = applyPage(template, page, body, jsonLd, SITE_URL);
    const file = outFile(page.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);

    const text = body ? toText(body) : page.description;
    fullText.push(`## ${page.title}\n\nURL: ${pageUrl(SITE_URL, page.path)}\n\n${text}`);
    log(`${page.path.padEnd(32)} ${String(text.length).padStart(6)} chars of text`);
  }

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((page) => `  <url><loc>${escapeHtml(pageUrl(SITE_URL, page.path))}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
  await writeFile(path.join(dist, "sitemap.xml"), sitemap);

  await writeFile(path.join(dist, "llms.txt"), entry.buildLlmsTxt(pages, data.portfolio ?? [], data.people ?? []));
  await writeFile(
    path.join(dist, "llms-full.txt"),
    `# ADVO Technologies: the text of every page on ${SITE_URL}\n\n${fullText.join("\n\n---\n\n")}\n`,
  );

  log(`${pages.length} pages, sitemap.xml, llms.txt, llms-full.txt written to dist/`);
} finally {
  await vite.close();
}
