import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import * as cheerio from "cheerio";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const scrape = new Hono<{ Variables: Variables }>();

// EasyDiv component detector — vendored from /easydiv/detector.js
// Self-installs `window.__easyDivDetector` when injected into a page.
const __dirname = dirname(fileURLToPath(import.meta.url));
const EASYDIV_DETECTOR_JS = readFileSync(
  join(__dirname, "../vendor/easydiv-detector.js"),
  "utf8",
);

// ─── Brand Scrape ────────────────────────────────────

const scrapeSchema = z.object({
  url: z.string().url().max(2000),
});

interface BrandData {
  url: string;
  meta: {
    title: string | null;
    description: string | null;
    ogImage: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    favicon: string | null;
    themeColor: string | null;
    author: string | null;
    keywords: string[];
  };
  colors: {
    hex: string;
    source: string;
    count: number;
  }[];
  fonts: {
    family: string;
    source: string;
  }[];
  logos: {
    url: string;
    type: string;
    size: string | null;
  }[];
  icons: {
    url: string;
    rel: string;
    sizes: string | null;
  }[];
  techStack: string[];
  links: {
    navigation: { text: string; href: string }[];
    social: { platform: string; url: string }[];
    external: string[];
  };
  images: {
    src: string;
    alt: string | null;
    width: string | null;
    height: string | null;
  }[];
  structure: {
    headings: { level: number; text: string }[];
    sections: string[];
    forms: number;
    buttons: string[];
    inputs: string[];
  };
  features: string[];
  cssVariables: { name: string; value: string }[];
  rawCssUrls: string[];
}

// Deep-sanitize an object to remove control characters that break JSON serialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepSanitize(obj: any): any {
  if (typeof obj === "string") {
    // Remove control characters except \n \r \t (which JSON handles fine)
    // eslint-disable-next-line no-control-regex
    return obj.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  }
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepSanitize(v);
    }
    return out;
  }
  return obj;
}

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function extractColors(css: string): Map<string, number> {
  const colors = new Map<string, number>();

  // Hex colors
  const hexMatches = css.match(/#(?:[0-9a-fA-F]{3,4}){1,2}\b/g) || [];
  for (const hex of hexMatches) {
    const normalized = hex.toLowerCase();
    // Skip common non-brand colors
    if (["#000", "#000000", "#fff", "#ffffff", "#333", "#333333", "#666", "#666666", "#999", "#ccc", "#eee", "#f5f5f5", "#fafafa"].includes(normalized)) continue;
    colors.set(normalized, (colors.get(normalized) || 0) + 1);
  }

  // RGB/RGBA
  const rgbMatches = css.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g) || [];
  for (const rgb of rgbMatches) {
    const nums = rgb.match(/\d+/g)?.map(Number);
    if (nums && nums.length >= 3) {
      const hex = `#${nums.slice(0, 3).map(n => n.toString(16).padStart(2, "0")).join("")}`;
      if (!["#000000", "#ffffff"].includes(hex)) {
        colors.set(hex, (colors.get(hex) || 0) + 1);
      }
    }
  }

  // HSL
  const hslMatches = css.match(/hsla?\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?(?:\s*,\s*[\d.]+)?\s*\)/g) || [];
  for (const hsl of hslMatches) {
    colors.set(hsl, (colors.get(hsl) || 0) + 1);
  }

  return colors;
}

function extractFonts(css: string, $: cheerio.CheerioAPI): { family: string; source: string }[] {
  const fonts = new Set<string>();

  // From CSS font-family declarations
  const fontMatches = css.match(/font-family\s*:\s*([^;}]+)/gi) || [];
  for (const match of fontMatches) {
    const value = match.replace(/font-family\s*:\s*/i, "").trim();
    const families = value.split(",").map(f => f.trim().replace(/["']/g, ""));
    for (const f of families) {
      if (!["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit", "initial", "unset", "-apple-system", "BlinkMacSystemFont", "Segoe UI"].includes(f)) {
        fonts.add(f);
      }
    }
  }

  // From Google Fonts links
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const familyMatch = href.match(/family=([^&]+)/);
    if (familyMatch) {
      const families = decodeURIComponent(familyMatch[1]).split("|");
      for (const f of families) {
        fonts.add(f.split(":")[0].replace(/\+/g, " "));
      }
    }
  });

  return Array.from(fonts).map(f => ({
    family: f,
    source: f.includes(" ") ? "Google Fonts / CSS" : "CSS",
  }));
}

function detectTechStack($: cheerio.CheerioAPI, html: string, headers: Headers): string[] {
  const stack: string[] = [];

  // Meta generators
  const generator = $('meta[name="generator"]').attr("content");
  if (generator) stack.push(`Generator: ${generator}`);

  // Script-based detection
  const scripts = $("script[src]").map((_, el) => $(el).attr("src") || "").get().join(" ");
  const allText = html + scripts;

  const detections: [RegExp, string][] = [
    [/react/i, "React"],
    [/vue/i, "Vue.js"],
    [/angular/i, "Angular"],
    [/svelte/i, "Svelte"],
    [/next/i, "Next.js"],
    [/nuxt/i, "Nuxt.js"],
    [/gatsby/i, "Gatsby"],
    [/remix/i, "Remix"],
    [/wordpress|wp-content/i, "WordPress"],
    [/shopify/i, "Shopify"],
    [/webflow/i, "Webflow"],
    [/squarespace/i, "Squarespace"],
    [/wix/i, "Wix"],
    [/framer/i, "Framer"],
    [/tailwind/i, "Tailwind CSS"],
    [/bootstrap/i, "Bootstrap"],
    [/material-ui|@mui/i, "Material UI"],
    [/chakra/i, "Chakra UI"],
    [/jquery/i, "jQuery"],
    [/gsap|greensock/i, "GSAP"],
    [/three\.js|threejs/i, "Three.js"],
    [/firebase/i, "Firebase"],
    [/supabase/i, "Supabase"],
    [/stripe/i, "Stripe"],
    [/intercom/i, "Intercom"],
    [/hotjar/i, "Hotjar"],
    [/gtag|google-analytics|googletagmanager/i, "Google Analytics"],
    [/fbevents|facebook/i, "Facebook Pixel"],
    [/cloudflare/i, "Cloudflare"],
    [/vercel/i, "Vercel"],
    [/netlify/i, "Netlify"],
    [/lottie/i, "Lottie Animations"],
    [/mapbox/i, "Mapbox"],
    [/leaflet/i, "Leaflet Maps"],
  ];

  for (const [pattern, name] of detections) {
    if (pattern.test(allText) && !stack.includes(name)) {
      stack.push(name);
    }
  }

  // Headers
  const server = headers.get("server");
  if (server) stack.push(`Server: ${server}`);
  const poweredBy = headers.get("x-powered-by");
  if (poweredBy) stack.push(`Powered by: ${poweredBy}`);

  return stack;
}

function detectFeatures($: cheerio.CheerioAPI): string[] {
  const features: string[] = [];

  if ($("form").length > 0) features.push("Forms");
  if ($('input[type="search"], [role="search"]').length > 0) features.push("Search");
  if ($('input[type="email"], .newsletter, .subscribe').length > 0) features.push("Newsletter/Email Signup");
  if ($(".cart, .shopping-cart, [data-cart]").length > 0) features.push("Shopping Cart");
  if ($(".pricing, .plans, [class*=price]").length > 0) features.push("Pricing Section");
  if ($(".testimonial, .review, [class*=testimonial]").length > 0) features.push("Testimonials");
  if ($(".faq, [class*=faq], details, [class*=accordion]").length > 0) features.push("FAQ/Accordion");
  if ($("video, iframe[src*=youtube], iframe[src*=vimeo]").length > 0) features.push("Video Content");
  if ($("[class*=carousel], [class*=slider], .swiper").length > 0) features.push("Carousel/Slider");
  if ($("[class*=modal], [class*=dialog], [role=dialog]").length > 0) features.push("Modals/Dialogs");
  if ($("[class*=tab], [role=tablist]").length > 0) features.push("Tabs");
  if ($("[class*=toast], [class*=notification]").length > 0) features.push("Toast Notifications");
  if ($("nav, [role=navigation]").length > 0) features.push("Navigation");
  if ($("footer").length > 0) features.push("Footer");
  if ($("[class*=hero], [class*=banner]").length > 0) features.push("Hero/Banner Section");
  if ($("[class*=grid], [class*=gallery]").length > 0) features.push("Grid/Gallery Layout");
  if ($("img[loading=lazy], [data-src]").length > 0) features.push("Lazy Loading");
  if ($("[class*=dark], [data-theme]").length > 0) features.push("Dark Mode Support");
  if ($("[class*=animate], [class*=motion], [data-aos]").length > 0) features.push("Scroll Animations");
  if ($("a[href*=login], a[href*=signin], [class*=auth]").length > 0) features.push("Authentication");
  if ($("[class*=chat], [class*=messenger], .crisp, .tawk").length > 0) features.push("Live Chat");
  if ($("[class*=blog], article").length > 0) features.push("Blog/Articles");
  if ($("a[href*=maps], iframe[src*=maps]").length > 0) features.push("Maps Integration");
  if ($('[class*=social], a[href*=facebook], a[href*=twitter], a[href*=instagram], a[href*=linkedin]').length > 0) features.push("Social Media Links");
  if ($("[class*=breadcrumb]").length > 0) features.push("Breadcrumbs");
  if ($("[class*=pagination]").length > 0) features.push("Pagination");
  if ($("[class*=cookie], [class*=consent]").length > 0) features.push("Cookie Consent");

  return features;
}

function extractSocialLinks($: cheerio.CheerioAPI): { platform: string; url: string }[] {
  const socials: { platform: string; url: string }[] = [];
  const platforms: [RegExp, string][] = [
    [/facebook\.com|fb\.com/i, "Facebook"],
    [/twitter\.com|x\.com/i, "Twitter/X"],
    [/instagram\.com/i, "Instagram"],
    [/linkedin\.com/i, "LinkedIn"],
    [/youtube\.com/i, "YouTube"],
    [/tiktok\.com/i, "TikTok"],
    [/github\.com/i, "GitHub"],
    [/discord\.(gg|com)/i, "Discord"],
    [/pinterest\.com/i, "Pinterest"],
    [/threads\.net/i, "Threads"],
    [/behance\.net/i, "Behance"],
    [/dribbble\.com/i, "Dribbble"],
  ];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    for (const [pattern, name] of platforms) {
      if (pattern.test(href) && !socials.find(s => s.platform === name)) {
        socials.push({ platform: name, url: href });
      }
    }
  });

  return socials;
}

async function fetchRenderedHtml(url: string): Promise<{ html: string; headers: Headers }> {
  // Try simple fetch first for speed
  let simpleHeaders: Headers;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    simpleHeaders = response.headers;

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);
      const textContent = $("body").text().replace(/\s+/g, " ").trim();
      const hasMinimalContent = textContent.length < 100;
      const hasSpaShell = $('[id="root"], [id="app"], [id="__next"], [id="__nuxt"]').length > 0;

      // If it's a fully rendered page (not SPA shell), return it
      if (!hasMinimalContent || !hasSpaShell) {
        return { html, headers: simpleHeaders };
      }
    }
  } catch {
    simpleHeaders = new Headers();
  }

  // Use stealth Puppeteer for SPAs, 403s, or failed fetches
  const fs = await import("fs");
  const execPath = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => {
    try { fs.accessSync(p); return true; } catch { return false; }
  });

  if (!execPath) {
    throw new Error("No browser available for rendering");
  }

  try {
    const puppeteerExtra = await import("puppeteer-extra");
    const StealthPlugin = await import("puppeteer-extra-plugin-stealth");

    const puppeteer = puppeteerExtra.default;
    puppeteer.use(StealthPlugin.default());

    const browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();

    // Realistic viewport + headers
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });

    // Wait for dynamic content to render
    await new Promise(r => setTimeout(r, 3000));

    const renderedHtml = await page.content();
    await browser.close();

    return { html: renderedHtml, headers: simpleHeaders };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Browser rendering failed";
    throw new Error(msg);
  }
}

scrape.post("/brand", requireAuth, requireTeam, zValidator("json", scrapeSchema), async (c) => {
  const { url } = c.req.valid("json");

  let html: string;
  let headers: Headers;
  try {
    const result = await fetchRenderedHtml(url);
    html = result.html;
    headers = result.headers;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to fetch URL";
    throw new HTTPException(502, { message: msg });
  }

  const $ = cheerio.load(html);

  // ─── Meta ─────────────────────────────────────────
  const meta = {
    title: $("title").first().text().trim() || null,
    description: $('meta[name="description"]').attr("content") || null,
    ogImage: $('meta[property="og:image"]').attr("content") || null,
    ogTitle: $('meta[property="og:title"]').attr("content") || null,
    ogDescription: $('meta[property="og:description"]').attr("content") || null,
    favicon: $('link[rel="icon"], link[rel="shortcut icon"]').first().attr("href") || null,
    themeColor: $('meta[name="theme-color"]').attr("content") || null,
    author: $('meta[name="author"]').attr("content") || null,
    keywords: ($('meta[name="keywords"]').attr("content") || "").split(",").map(k => k.trim()).filter(Boolean),
  };

  if (meta.favicon) meta.favicon = resolveUrl(url, meta.favicon);
  if (meta.ogImage) meta.ogImage = resolveUrl(url, meta.ogImage);

  // ─── Collect all CSS ──────────────────────────────
  let allCss = "";
  const cssUrls: string[] = [];

  // Inline styles
  $("style").each((_, el) => { allCss += $(el).text() + "\n"; });

  // Inline style attributes
  $("[style]").each((_, el) => { allCss += $(el).attr("style") + "\n"; });

  // External stylesheets (fetch first 5)
  const linkHrefs = $('link[rel="stylesheet"]').map((_, el) => $(el).attr("href")).get().filter(Boolean);
  const cssToFetch = linkHrefs.slice(0, 5).map(href => resolveUrl(url, href));
  cssUrls.push(...cssToFetch);

  const cssResults = await Promise.allSettled(
    cssToFetch.map(async (cssUrl) => {
      const res = await fetch(cssUrl, { signal: AbortSignal.timeout(5000) });
      return res.ok ? res.text() : "";
    })
  );
  for (const result of cssResults) {
    if (result.status === "fulfilled") allCss += result.value + "\n";
  }

  // ─── Colors ───────────────────────────────────────
  const colorMap = extractColors(allCss);
  if (meta.themeColor) colorMap.set(meta.themeColor.toLowerCase(), 100);

  const colors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([hex, count]) => ({ hex, source: "CSS", count }));

  // ─── CSS Variables ────────────────────────────────
  const cssVars: { name: string; value: string }[] = [];
  const varMatches = allCss.match(/--[\w-]+\s*:\s*[^;}]+/g) || [];
  const seen = new Set<string>();
  for (const m of varMatches) {
    const [name, ...rest] = m.split(":");
    const value = rest.join(":").trim();
    const key = name.trim();
    if (!seen.has(key)) {
      seen.add(key);
      cssVars.push({ name: key, value });
    }
  }

  // ─── Fonts ────────────────────────────────────────
  const fonts = extractFonts(allCss, $);

  // ─── Logos ────────────────────────────────────────
  const logos: BrandData["logos"] = [];
  $('link[rel*="icon"], link[rel="apple-touch-icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      logos.push({
        url: resolveUrl(url, href),
        type: $(el).attr("rel") || "icon",
        size: $(el).attr("sizes") || null,
      });
    }
  });

  // Try to find logo in common patterns
  $('img[class*="logo"], img[id*="logo"], img[alt*="logo"], header img, .navbar img, nav img').each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      logos.push({
        url: resolveUrl(url, src),
        type: "logo-img",
        size: $(el).attr("width") ? `${$(el).attr("width")}x${$(el).attr("height")}` : null,
      });
    }
  });

  // SVG logos
  $('svg[class*="logo"], header svg, nav svg').each((_, el) => {
    const svgHtml = $.html(el);
    if (svgHtml.length < 10000) {
      logos.push({ url: `data:image/svg+xml,${encodeURIComponent(svgHtml)}`, type: "svg-inline", size: null });
    }
  });

  // ─── Icons ────────────────────────────────────────
  const icons: BrandData["icons"] = [];
  $('link[rel*="icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      icons.push({
        url: resolveUrl(url, href),
        rel: $(el).attr("rel") || "icon",
        sizes: $(el).attr("sizes") || null,
      });
    }
  });

  // ─── Tech Stack ───────────────────────────────────
  const techStack = detectTechStack($, html, headers);

  // ─── Links ────────────────────────────────────────
  const navLinks: { text: string; href: string }[] = [];
  $("nav a, header a, [role=navigation] a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (text && href && text.length < 50) {
      navLinks.push({ text, href: resolveUrl(url, href) });
    }
  });

  const socialLinks = extractSocialLinks($);

  const externalLinks: string[] = [];
  const baseHost = new URL(url).hostname;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    try {
      const linkUrl = new URL(href, url);
      if (linkUrl.hostname !== baseHost && linkUrl.protocol.startsWith("http") && !externalLinks.includes(linkUrl.href)) {
        externalLinks.push(linkUrl.href);
      }
    } catch { /* skip */ }
  });

  // ─── Images ───────────────────────────────────────
  const images: BrandData["images"] = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src && !src.startsWith("data:")) {
      images.push({
        src: resolveUrl(url, src),
        alt: $(el).attr("alt") || null,
        width: $(el).attr("width") || null,
        height: $(el).attr("height") || null,
      });
    }
  });

  // ─── Structure ────────────────────────────────────
  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = parseInt(el.tagName.replace("h", ""), 10);
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push({ level, text });
  });

  const sections: string[] = [];
  $("section, [class*=section]").each((_, el) => {
    const id = $(el).attr("id") || "";
    const cls = $(el).attr("class") || "";
    sections.push(id || cls.split(" ")[0] || "section");
  });

  const buttons: string[] = [];
  $("button, a.btn, [class*=button], [role=button], input[type=submit]").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 50 && !buttons.includes(text)) buttons.push(text);
  });

  const inputs: string[] = [];
  $("input[type], textarea, select").each((_, el) => {
    const type = $(el).attr("type") || el.tagName;
    const placeholder = $(el).attr("placeholder") || "";
    inputs.push(placeholder ? `${type}: ${placeholder}` : type);
  });

  const features = detectFeatures($);

  const result: BrandData = {
    url,
    meta,
    colors,
    fonts,
    logos: logos.slice(0, 10),
    icons: icons.slice(0, 10),
    techStack,
    links: {
      navigation: navLinks.slice(0, 30),
      social: socialLinks,
      external: externalLinks.slice(0, 20),
    },
    images: images.slice(0, 30),
    structure: {
      headings: headings.slice(0, 30),
      sections: sections.slice(0, 20),
      forms: $("form").length,
      buttons: buttons.slice(0, 20),
      inputs: inputs.slice(0, 20),
    },
    features,
    cssVariables: cssVars.slice(0, 50),
    rawCssUrls: cssUrls,
  };

  return c.json({ data: deepSanitize(result), error: null });
});

// ─── Brand Full Scraper ─────────────────────────────────
// Comprehensive brand analysis: screenshots, multi-page crawl, color grouping,
// typography scale, component detection, SEO audit, performance, animations,
// accessibility, and optional diff/compare.

const brandFullSchema = z.object({
  url: z.string().url().max(2000),
  compareUrl: z.string().url().max(2000).optional(),
  crawlDepth: z.number().int().min(0).max(10).optional().default(5),
});

// ─── Helper: hex to HSL ─────────────────────────────────
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = hex.replace("#", "");
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255;
    g = parseInt(clean[1] + clean[1], 16) / 255;
    b = parseInt(clean[2] + clean[2], 16) / 255;
  } else if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  } else {
    return null;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

// ─── Helper: group colors into palette roles ────────────
function groupColors(
  colors: { hex: string; count: number }[]
): {
  primary: string | null;
  secondary: string | null;
  accent: string[];
  neutral: string[];
} {
  const result = {
    primary: null as string | null,
    secondary: null as string | null,
    accent: [] as string[],
    neutral: [] as string[],
  };

  const chromatic: { hex: string; count: number; hsl: { h: number; s: number; l: number } }[] = [];
  const neutrals: string[] = [];

  for (const c of colors) {
    const hsl = hexToHsl(c.hex);
    if (!hsl) continue;
    // Neutral: very low saturation OR very light/very dark
    if (hsl.s < 0.1 || hsl.l > 0.93 || hsl.l < 0.07) {
      neutrals.push(c.hex);
    } else {
      chromatic.push({ hex: c.hex, count: c.count, hsl });
    }
  }

  result.neutral = neutrals;

  // Sort chromatic by count desc
  chromatic.sort((a, b) => b.count - a.count);

  if (chromatic.length >= 1) result.primary = chromatic[0].hex;
  if (chromatic.length >= 2) result.secondary = chromatic[1].hex;

  // Accent: bright/saturated colors used sparingly (not primary/secondary)
  for (const c of chromatic.slice(2)) {
    if (c.hsl.s > 0.5 && c.hsl.l > 0.25 && c.hsl.l < 0.75) {
      result.accent.push(c.hex);
    }
  }

  return result;
}

// ─── Helper: relative luminance for contrast ────────────
function relativeLuminance(hex: string): number | null {
  const hsl = hexToHsl(hex); // just to validate
  if (!hsl) return null;
  const clean = hex.replace("#", "");
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255;
    g = parseInt(clean[1] + clean[1], 16) / 255;
    b = parseInt(clean[2] + clean[2], 16) / 255;
  } else {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  }
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number | null {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  if (l1 === null || l2 === null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Helper: scrape a single page fully ─────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scrapeSinglePage(pageUrl: string, browser: any): Promise<{
  html: string;
  $: cheerio.CheerioAPI;
  allCss: string;
  cssUrls: string[];
  headers: Headers;
  navLinks: { text: string; href: string }[];
}> {
  let html: string;
  let headers: Headers;
  try {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    headers = response.headers;
    if (response.ok) {
      const raw = await response.text();
      const $test = cheerio.load(raw);
      const textContent = $test("body").text().replace(/\s+/g, " ").trim();
      const hasMinimalContent = textContent.length < 100;
      const hasSpaShell = $test('[id="root"], [id="app"], [id="__next"], [id="__nuxt"]').length > 0;
      if (!hasMinimalContent || !hasSpaShell) {
        html = raw;
      } else {
        // Needs Puppeteer
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 15000 });
        await new Promise((r: (v: void) => void) => setTimeout(r, 2000));
        html = await page.content();
        await page.close();
      }
    } else {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 15000 });
      await new Promise((r: (v: void) => void) => setTimeout(r, 2000));
      html = await page.content();
      await page.close();
    }
  } catch {
    headers = new Headers();
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise((r: (v: void) => void) => setTimeout(r, 2000));
    html = await page.content();
    await page.close();
  }

  const $ = cheerio.load(html);

  // Collect all CSS
  let allCss = "";
  const cssUrls: string[] = [];
  $("style").each((_, el) => { allCss += $(el).text() + "\n"; });
  $("[style]").each((_, el) => { allCss += $(el).attr("style") + "\n"; });
  const linkHrefs = $('link[rel="stylesheet"]').map((_, el) => $(el).attr("href")).get().filter(Boolean);
  const cssToFetch = linkHrefs.slice(0, 5).map(href => resolveUrl(pageUrl, href));
  cssUrls.push(...cssToFetch);
  const cssResults = await Promise.allSettled(
    cssToFetch.map(async (cssUrl) => {
      const res = await fetch(cssUrl, { signal: AbortSignal.timeout(5000) });
      return res.ok ? res.text() : "";
    })
  );
  for (const r of cssResults) {
    if (r.status === "fulfilled") allCss += r.value + "\n";
  }

  // Nav links
  const navLinks: { text: string; href: string }[] = [];
  $("nav a, header a, [role=navigation] a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (text && href && text.length < 50) {
      navLinks.push({ text, href: resolveUrl(pageUrl, href) });
    }
  });

  return { html, $, allCss, cssUrls, headers, navLinks };
}

scrape.post("/brand-full", requireAuth, requireTeam, zValidator("json", brandFullSchema), async (c) => {
  const { url, compareUrl, crawlDepth } = c.req.valid("json");

  const fs = await import("fs");
  const execPath = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => {
    try { fs.accessSync(p); return true; } catch { return false; }
  });

  if (!execPath) {
    throw new HTTPException(500, { message: "No browser available" });
  }

  const puppeteerExtra = await import("puppeteer-extra");
  const StealthPlugin = await import("puppeteer-extra-plugin-stealth");
  const puppeteer = puppeteerExtra.default;
  puppeteer.use(StealthPlugin.default());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;

  try {
    // 60 second timeout for the entire operation
    const operationTimeout = setTimeout(() => {
      throw new Error("Brand full scrape timed out after 60 seconds");
    }, 60000);

    browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080",
      ],
    });

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Main page scrape with Puppeteer for full data
    // ═══════════════════════════════════════════════════════

    const mainPage = await browser.newPage();

    // Collect request data for performance metrics
    let totalRequests = 0;
    let totalBytes = 0;
    let jsFileCount = 0;
    let cssFileCount = 0;
    mainPage.on("response", (response: { url: () => string; headers: () => Record<string, string> }) => {
      totalRequests++;
      const resUrl = response.url();
      const contentLength = parseInt(response.headers()["content-length"] || "0", 10);
      totalBytes += contentLength;
      if (resUrl.match(/\.js(\?|$)/)) jsFileCount++;
      if (resUrl.match(/\.css(\?|$)/)) cssFileCount++;
    });

    await mainPage.setViewport({ width: 1440, height: 900 });
    await mainPage.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    });

    const loadStart = Date.now();
    await mainPage.goto(url, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r: (v: void) => void) => setTimeout(r, 3000));
    const loadTimeMs = Date.now() - loadStart;

    const mainHtml = await mainPage.content();
    const $main = cheerio.load(mainHtml);

    // Get simple fetch headers for tech stack detection
    let simpleHeaders: Headers;
    try {
      const headRes = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      simpleHeaders = headRes.headers;
    } catch {
      simpleHeaders = new Headers();
    }

    // ─── Collect all CSS from main page ─────────────────
    let allCss = "";
    const cssUrls: string[] = [];
    $main("style").each((_, el) => { allCss += $main(el).text() + "\n"; });
    $main("[style]").each((_, el) => { allCss += $main(el).attr("style") + "\n"; });
    const linkHrefsMain = $main('link[rel="stylesheet"]').map((_, el) => $main(el).attr("href")).get().filter(Boolean);
    const cssToFetchMain = linkHrefsMain.slice(0, 5).map(href => resolveUrl(url, href));
    cssUrls.push(...cssToFetchMain);
    const cssResultsMain = await Promise.allSettled(
      cssToFetchMain.map(async (cssUrl) => {
        const res = await fetch(cssUrl, { signal: AbortSignal.timeout(5000) });
        return res.ok ? res.text() : "";
      })
    );
    for (const r of cssResultsMain) {
      if (r.status === "fulfilled") allCss += r.value + "\n";
    }

    // ─── Meta ───────────────────────────────────────────
    const meta = {
      title: $main("title").first().text().trim() || null,
      description: $main('meta[name="description"]').attr("content") || null,
      ogImage: $main('meta[property="og:image"]').attr("content") || null,
      ogTitle: $main('meta[property="og:title"]').attr("content") || null,
      ogDescription: $main('meta[property="og:description"]').attr("content") || null,
      favicon: $main('link[rel="icon"], link[rel="shortcut icon"]').first().attr("href") || null,
      themeColor: $main('meta[name="theme-color"]').attr("content") || null,
      author: $main('meta[name="author"]').attr("content") || null,
      keywords: ($main('meta[name="keywords"]').attr("content") || "").split(",").map(k => k.trim()).filter(Boolean),
    };
    if (meta.favicon) meta.favicon = resolveUrl(url, meta.favicon);
    if (meta.ogImage) meta.ogImage = resolveUrl(url, meta.ogImage);

    // ─── Colors ─────────────────────────────────────────
    const colorMap = extractColors(allCss);
    if (meta.themeColor) colorMap.set(meta.themeColor.toLowerCase(), 100);
    const colors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([hex, count]) => ({ hex, source: "CSS", count }));

    // ─── CSS Variables ──────────────────────────────────
    const cssVars: { name: string; value: string }[] = [];
    const varMatches = allCss.match(/--[\w-]+\s*:\s*[^;}]+/g) || [];
    const seenVars = new Set<string>();
    for (const m of varMatches) {
      const [name, ...rest] = m.split(":");
      const value = rest.join(":").trim();
      const key = name.trim();
      if (!seenVars.has(key)) {
        seenVars.add(key);
        cssVars.push({ name: key, value });
      }
    }

    // ─── Fonts ──────────────────────────────────────────
    const fonts = extractFonts(allCss, $main);

    // ─── Logos ──────────────────────────────────────────
    const logos: BrandData["logos"] = [];
    $main('link[rel*="icon"], link[rel="apple-touch-icon"]').each((_, el) => {
      const href = $main(el).attr("href");
      if (href) logos.push({ url: resolveUrl(url, href), type: $main(el).attr("rel") || "icon", size: $main(el).attr("sizes") || null });
    });
    $main('img[class*="logo"], img[id*="logo"], img[alt*="logo"], header img, .navbar img, nav img').each((_, el) => {
      const src = $main(el).attr("src");
      if (src) logos.push({ url: resolveUrl(url, src), type: "logo-img", size: $main(el).attr("width") ? `${$main(el).attr("width")}x${$main(el).attr("height")}` : null });
    });
    $main('svg[class*="logo"], header svg, nav svg').each((_, el) => {
      const svgHtml = $main.html(el);
      if (svgHtml && svgHtml.length < 10000) logos.push({ url: `data:image/svg+xml,${encodeURIComponent(svgHtml)}`, type: "svg-inline", size: null });
    });

    // ─── Icons ──────────────────────────────────────────
    const icons: BrandData["icons"] = [];
    $main('link[rel*="icon"]').each((_, el) => {
      const href = $main(el).attr("href");
      if (href) icons.push({ url: resolveUrl(url, href), rel: $main(el).attr("rel") || "icon", sizes: $main(el).attr("sizes") || null });
    });

    // ─── Tech Stack ─────────────────────────────────────
    const techStack = detectTechStack($main, mainHtml, simpleHeaders);

    // ─── Links ──────────────────────────────────────────
    const navLinks: { text: string; href: string }[] = [];
    $main("nav a, header a, [role=navigation] a").each((_, el) => {
      const text = $main(el).text().trim();
      const href = $main(el).attr("href");
      if (text && href && text.length < 50) navLinks.push({ text, href: resolveUrl(url, href) });
    });
    const socialLinks = extractSocialLinks($main);
    const externalLinks: string[] = [];
    const baseHost = new URL(url).hostname;
    $main("a[href]").each((_, el) => {
      const href = $main(el).attr("href") || "";
      try {
        const linkUrl = new URL(href, url);
        if (linkUrl.hostname !== baseHost && linkUrl.protocol.startsWith("http") && !externalLinks.includes(linkUrl.href)) externalLinks.push(linkUrl.href);
      } catch { /* skip */ }
    });

    // ─── Images ─────────────────────────────────────────
    const images: BrandData["images"] = [];
    $main("img[src]").each((_, el) => {
      const src = $main(el).attr("src");
      if (src && !src.startsWith("data:")) {
        images.push({ src: resolveUrl(url, src), alt: $main(el).attr("alt") || null, width: $main(el).attr("width") || null, height: $main(el).attr("height") || null });
      }
    });

    // ─── Structure ──────────────────────────────────────
    const headings: { level: number; text: string }[] = [];
    $main("h1, h2, h3, h4, h5, h6").each((_, el) => {
      const level = parseInt(el.tagName.replace("h", ""), 10);
      const text = $main(el).text().trim();
      if (text && text.length < 200) headings.push({ level, text });
    });
    const sections: string[] = [];
    $main("section, [class*=section]").each((_, el) => {
      const id = $main(el).attr("id") || "";
      const cls = $main(el).attr("class") || "";
      sections.push(id || cls.split(" ")[0] || "section");
    });
    const buttons: string[] = [];
    $main("button, a.btn, [class*=button], [role=button], input[type=submit]").each((_, el) => {
      const text = $main(el).text().trim();
      if (text && text.length < 50 && !buttons.includes(text)) buttons.push(text);
    });
    const inputs: string[] = [];
    $main("input[type], textarea, select").each((_, el) => {
      const type = $main(el).attr("type") || el.tagName;
      const placeholder = $main(el).attr("placeholder") || "";
      inputs.push(placeholder ? `${type}: ${placeholder}` : type);
    });

    const features = detectFeatures($main);

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Screenshots at 3 viewports
    // ═══════════════════════════════════════════════════════

    const viewports = [
      { name: "desktop", width: 1440, height: 900 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 375, height: 812 },
    ];

    const screenshots: { viewport: string; width: number; height: number; dataUrl: string }[] = [];

    for (const vp of viewports) {
      await mainPage.setViewport({ width: vp.width, height: vp.height });
      await new Promise((r: (v: void) => void) => setTimeout(r, 500));
      const screenshotBuffer = await mainPage.screenshot({ fullPage: true, encoding: "base64" });
      screenshots.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        dataUrl: `data:image/png;base64,${screenshotBuffer}`,
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: Typography scale via Puppeteer evaluate
    // ═══════════════════════════════════════════════════════

    // Reset to desktop viewport for consistency
    await mainPage.setViewport({ width: 1440, height: 900 });

    const typography: { element: string; family: string; size: string; weight: string; lineHeight: string; letterSpacing: string }[] = await mainPage.evaluate(() => {
      const selectors = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "body"];
      const results: { element: string; family: string; size: string; weight: string; lineHeight: string; letterSpacing: string }[] = [];
      const seen = new Set<string>();
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const style = window.getComputedStyle(el);
        const key = `${sel}-${style.fontFamily}-${style.fontSize}-${style.fontWeight}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          element: sel,
          family: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
        });
      }
      return results;
    });

    // ═══════════════════════════════════════════════════════
    // PHASE 4: Component detection — easydiv heuristic detector
    // ═══════════════════════════════════════════════════════
    //
    // Runs the vendored easydiv detector inside the live Puppeteer page so
    // it can use real DOM APIs (matches, contains, parentElement, getBoundingClientRect).
    // Returns scored, deduplicated, sibling-clustered candidates.

    interface RawCandidate {
      type: string;
      score: number;
      reason?: string;
      tag: string;
      id: string;
      classes: string[];
      childCount: number;
      depth: number;
      textPreview: string;
      siblingCount?: number;
    }

    let easydivCandidates: RawCandidate[] = [];
    try {
      easydivCandidates = (await mainPage.evaluate(
        (detectorSrc: string): RawCandidate[] => {
          // Inject the detector — installs window.__easyDivDetector
          new Function(detectorSrc)();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ed = (window as any).__easyDivDetector;
          if (!ed?.scanPage) return [];
          const { candidates } = ed.scanPage(document);
          // Serialize DOM elements → plain data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return candidates.map((c: any) => {
            const el = c.el;
            const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
            let depthCount = 0;
            let p = el.parentElement;
            while (p) { depthCount++; p = p.parentElement; }
            return {
              type: c.type,
              score: c.score,
              reason: c.reason,
              tag: (el.tagName || "").toLowerCase(),
              id: el.id || "",
              classes: typeof el.className === "string"
                ? el.className.split(/\s+/).filter(Boolean).slice(0, 6)
                : [],
              childCount: el.children?.length || 0,
              depth: depthCount,
              textPreview: text,
              siblingCount: c.count,
            };
          });
        },
        EASYDIV_DETECTOR_JS,
      )) as RawCandidate[];
    } catch (err) {
      console.error("[scrape] easydiv detection failed:", err);
    }

    // Group by type and produce a legacy-shaped `components` array for the UI
    const groupedByType = easydivCandidates.reduce<Record<string, RawCandidate[]>>((acc, c) => {
      (acc[c.type] = acc[c.type] || []).push(c);
      return acc;
    }, {});

    const TYPE_LABEL: Record<string, string> = {
      nav: "Navigation",
      header: "Header",
      footer: "Footer",
      hero: "Hero",
      card: "Card",
      button: "Button",
      form: "Form",
      input: "Input",
      list: "List",
      grid: "Grid",
      modal: "Modal/Dialog",
      table: "Table",
      section: "Section",
      badge: "Badge/Pill",
      other: "Other",
    };

    const components = Object.entries(groupedByType)
      .map(([type, items]) => ({
        name: TYPE_LABEL[type] || type,
        selector: type,
        count: items.length,
      }))
      .sort((a, b) => b.count - a.count);

    // Top-scored candidates per type (for richer UI / inspection)
    const componentCandidates = Object.entries(groupedByType).reduce<
      Record<string, RawCandidate[]>
    >((acc, [type, items]) => {
      acc[type] = items.sort((a, b) => b.score - a.score).slice(0, 5);
      return acc;
    }, {});

    // ═══════════════════════════════════════════════════════
    // PHASE 5: SEO audit
    // ═══════════════════════════════════════════════════════

    const seoChecks: { name: string; passed: boolean; value: string }[] = [];

    // Title
    const titleText = $main("title").first().text().trim();
    seoChecks.push({
      name: "Has title",
      passed: titleText.length > 0,
      value: titleText ? `"${titleText}" (${titleText.length} chars)` : "Missing",
    });
    if (titleText) {
      seoChecks.push({
        name: "Title length optimal (30-60 chars)",
        passed: titleText.length >= 30 && titleText.length <= 60,
        value: `${titleText.length} chars`,
      });
    }

    // Meta description
    const metaDesc = $main('meta[name="description"]').attr("content") || "";
    seoChecks.push({
      name: "Has meta description",
      passed: metaDesc.length > 0,
      value: metaDesc ? `${metaDesc.length} chars` : "Missing",
    });
    if (metaDesc) {
      seoChecks.push({
        name: "Meta description length optimal (120-160 chars)",
        passed: metaDesc.length >= 120 && metaDesc.length <= 160,
        value: `${metaDesc.length} chars`,
      });
    }

    // H1 count
    const h1Count = $main("h1").length;
    seoChecks.push({
      name: "Single H1 tag",
      passed: h1Count === 1,
      value: `${h1Count} H1 tag(s) found`,
    });

    // Heading hierarchy
    const headingLevels = headings.map(h => h.level);
    let hierarchyValid = true;
    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] > headingLevels[i - 1] + 1) {
        hierarchyValid = false;
        break;
      }
    }
    seoChecks.push({
      name: "Valid heading hierarchy (no skipped levels)",
      passed: hierarchyValid,
      value: hierarchyValid ? "OK" : "Skipped heading levels detected",
    });

    // Canonical URL
    const canonical = $main('link[rel="canonical"]').attr("href") || "";
    seoChecks.push({
      name: "Has canonical URL",
      passed: canonical.length > 0,
      value: canonical || "Missing",
    });

    // Open Graph tags
    const hasOg = $main('meta[property^="og:"]').length > 0;
    const ogTags = $main('meta[property^="og:"]').map((_, el) => $main(el).attr("property")).get();
    seoChecks.push({
      name: "Has Open Graph tags",
      passed: hasOg,
      value: hasOg ? `Found: ${ogTags.join(", ")}` : "Missing",
    });

    // JSON-LD structured data
    const jsonLd = $main('script[type="application/ld+json"]');
    seoChecks.push({
      name: "Has structured data (JSON-LD)",
      passed: jsonLd.length > 0,
      value: jsonLd.length > 0 ? `${jsonLd.length} JSON-LD block(s)` : "Missing",
    });

    // Sitemap check
    let hasSitemap = false;
    try {
      const sitemapUrl = new URL("/sitemap.xml", url).href;
      const sitemapRes = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000), method: "HEAD" });
      hasSitemap = sitemapRes.ok;
    } catch { /* ignore */ }
    seoChecks.push({
      name: "Has sitemap.xml",
      passed: hasSitemap,
      value: hasSitemap ? "Found" : "Missing or inaccessible",
    });

    // Robots.txt check
    let hasRobots = false;
    try {
      const robotsUrl = new URL("/robots.txt", url).href;
      const robotsRes = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000), method: "HEAD" });
      hasRobots = robotsRes.ok;
    } catch { /* ignore */ }
    seoChecks.push({
      name: "Has robots.txt",
      passed: hasRobots,
      value: hasRobots ? "Found" : "Missing or inaccessible",
    });

    // Alt text coverage
    const totalImages = $main("img").length;
    const imagesWithAlt = $main("img[alt]").filter((_, el) => ($main(el).attr("alt") || "").trim().length > 0).length;
    const altCoverage = totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 100;
    seoChecks.push({
      name: "Image alt text coverage",
      passed: altCoverage >= 80,
      value: `${imagesWithAlt}/${totalImages} images have alt text (${altCoverage}%)`,
    });

    const seoScore = Math.round((seoChecks.filter(c => c.passed).length / seoChecks.length) * 100);
    const seo = { score: seoScore, checks: seoChecks };

    // ═══════════════════════════════════════════════════════
    // PHASE 6: Performance metrics
    // ═══════════════════════════════════════════════════════

    const puppeteerMetrics = await mainPage.metrics();

    const performance = {
      loadTimeMs: loadTimeMs,
      domNodes: puppeteerMetrics.Nodes ? Math.round(puppeteerMetrics.Nodes as number) : 0,
      jsHeapMB: puppeteerMetrics.JSHeapUsedSize ? Math.round((puppeteerMetrics.JSHeapUsedSize as number) / 1024 / 1024 * 100) / 100 : 0,
      totalRequests,
      jsFiles: jsFileCount,
      cssFiles: cssFileCount,
      estimatedPageWeightKB: Math.round(totalBytes / 1024),
      details: {
        documents: puppeteerMetrics.Documents ?? 0,
        frames: puppeteerMetrics.Frames ?? 0,
        jsEventListeners: puppeteerMetrics.JSEventListeners ?? 0,
        layoutCount: puppeteerMetrics.LayoutCount ?? 0,
      },
    };

    // ═══════════════════════════════════════════════════════
    // PHASE 7: Animation detection
    // ═══════════════════════════════════════════════════════

    const animations: { type: string; source: string; details: string }[] = [];

    // Check CSS for @keyframes
    const keyframeMatches = allCss.match(/@keyframes\s+[\w-]+/g) || [];
    if (keyframeMatches.length > 0) {
      animations.push({
        type: "CSS Keyframes",
        source: "stylesheet",
        details: `Found ${keyframeMatches.length} keyframe animation(s): ${keyframeMatches.slice(0, 5).map(k => k.replace("@keyframes ", "")).join(", ")}`,
      });
    }

    // Check for CSS transitions
    const transitionMatches = allCss.match(/transition\s*:/g) || [];
    if (transitionMatches.length > 0) {
      animations.push({
        type: "CSS Transitions",
        source: "stylesheet",
        details: `Found ${transitionMatches.length} transition declaration(s)`,
      });
    }

    // Check for animation libraries in scripts/html
    const allScriptSrcs = $main("script[src]").map((_, el) => $main(el).attr("src") || "").get().join(" ");
    const allInlineScripts = $main("script:not([src])").map((_, el) => $main(el).text()).get().join(" ");
    const scriptContent = allScriptSrcs + " " + allInlineScripts + " " + mainHtml;

    const animationDetectors: { pattern: RegExp; type: string; source: string; details: string }[] = [
      { pattern: /gsap|TweenMax|TweenLite|ScrollTrigger|greensock/i, type: "GSAP/GreenSock", source: "JavaScript", details: "GreenSock Animation Platform detected" },
      { pattern: /framer-motion|motion\.div|motion\.span|AnimatePresence/i, type: "Framer Motion", source: "JavaScript/React", details: "Framer Motion animation library detected" },
      { pattern: /data-aos/i, type: "AOS (Animate On Scroll)", source: "HTML attributes", details: "AOS scroll animation library detected" },
      { pattern: /lenis|locomotive-scroll|data-scroll/i, type: "Smooth Scroll Library", source: "JavaScript", details: "Lenis or Locomotive Scroll detected" },
      { pattern: /lottie|bodymovin/i, type: "Lottie Animations", source: "JavaScript", details: "Lottie/Bodymovin animation detected" },
      { pattern: /FLIP|data-flip/i, type: "FLIP Animations", source: "JavaScript", details: "FLIP animation technique detected" },
    ];

    for (const detector of animationDetectors) {
      if (detector.pattern.test(scriptContent)) {
        animations.push({ type: detector.type, source: detector.source, details: detector.details });
      }
    }

    // Check for AOS attributes in DOM specifically
    const aosCount = $main("[data-aos]").length;
    if (aosCount > 0 && !animations.find(a => a.type.includes("AOS"))) {
      animations.push({ type: "AOS (Animate On Scroll)", source: "HTML attributes", details: `${aosCount} elements with data-aos attributes` });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 8: Accessibility basics
    // ═══════════════════════════════════════════════════════

    const a11yChecks: { name: string; passed: boolean; details: string }[] = [];

    // Language attribute
    const langAttr = $main("html").attr("lang") || "";
    a11yChecks.push({
      name: "Language attribute on <html>",
      passed: langAttr.length > 0,
      details: langAttr ? `lang="${langAttr}"` : "Missing lang attribute",
    });

    // Alt text on images
    const imgsTotal = $main("img").length;
    const imgsWithAlt = $main("img[alt]").length;
    const imgsWithEmptyAlt = $main('img[alt=""]').length;
    const imgsWithoutAlt = imgsTotal - imgsWithAlt;
    a11yChecks.push({
      name: "Images have alt text",
      passed: imgsWithoutAlt === 0,
      details: `${imgsWithAlt}/${imgsTotal} images have alt attribute (${imgsWithEmptyAlt} empty, ${imgsWithoutAlt} missing)`,
    });

    // ARIA roles
    const ariaRoles = new Set<string>();
    $main("[role]").each((_, el) => {
      const role = $main(el).attr("role");
      if (role) ariaRoles.add(role);
    });
    a11yChecks.push({
      name: "ARIA roles used",
      passed: ariaRoles.size > 0,
      details: ariaRoles.size > 0 ? `Roles found: ${Array.from(ariaRoles).slice(0, 15).join(", ")}` : "No ARIA roles detected",
    });

    // Focus indicators (check for outline:none / outline:0 without replacement)
    const outlineNoneCount = (allCss.match(/outline\s*:\s*(?:none|0)\b/gi) || []).length;
    const customFocusCount = (allCss.match(/:focus-visible|:focus\s*\{[^}]*(?:box-shadow|border|outline(?!:\s*(?:none|0)))/gi) || []).length;
    a11yChecks.push({
      name: "Focus indicators preserved",
      passed: outlineNoneCount === 0 || customFocusCount > 0,
      details: outlineNoneCount === 0
        ? "No outline removal detected"
        : customFocusCount > 0
          ? `${outlineNoneCount} outline removals but ${customFocusCount} custom focus styles found`
          : `${outlineNoneCount} outline removal(s) without replacement — focus visibility may be broken`,
    });

    // Color contrast sampling (check primary text colors against common backgrounds)
    let contrastPassed = true;
    let contrastDetails = "No text/background color pairs detected for checking";
    const textColors: string[] = [];
    const bgColors: string[] = [];

    // Extract text colors from CSS
    const colorDecls = allCss.match(/(?:^|[{;])\s*color\s*:\s*(#[0-9a-fA-F]{3,8})/g) || [];
    for (const decl of colorDecls) {
      const hex = decl.match(/#[0-9a-fA-F]{3,8}/)?.[0];
      if (hex) textColors.push(hex.toLowerCase());
    }
    // Extract background colors
    const bgDecls = allCss.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/g) || [];
    for (const decl of bgDecls) {
      const hex = decl.match(/#[0-9a-fA-F]{3,8}/)?.[0];
      if (hex) bgColors.push(hex.toLowerCase());
    }

    if (textColors.length > 0 && bgColors.length > 0) {
      // Check common pairs
      const uniqueText = Array.from(new Set(textColors)).slice(0, 5);
      const uniqueBg = Array.from(new Set(bgColors)).slice(0, 5);
      let lowContrastPairs = 0;
      let totalPairs = 0;
      for (const tc of uniqueText) {
        for (const bc of uniqueBg) {
          const ratio = contrastRatio(tc, bc);
          if (ratio !== null) {
            totalPairs++;
            if (ratio < 4.5) lowContrastPairs++;
          }
        }
      }
      contrastPassed = lowContrastPairs === 0;
      contrastDetails = totalPairs > 0
        ? `${totalPairs} color pairs tested, ${lowContrastPairs} below 4.5:1 contrast ratio`
        : "Could not compute contrast ratios";
    }
    a11yChecks.push({
      name: "Color contrast (WCAG AA 4.5:1)",
      passed: contrastPassed,
      details: contrastDetails,
    });

    const a11yScore = Math.round((a11yChecks.filter(c => c.passed).length / a11yChecks.length) * 100);
    const accessibility = { score: a11yScore, checks: a11yChecks };

    // ═══════════════════════════════════════════════════════
    // PHASE 9: Multi-page crawl
    // ═══════════════════════════════════════════════════════

    // Collect internal nav links from main page
    const baseOrigin = new URL(url).origin;
    const internalNavLinks: string[] = [];
    const seenUrls = new Set<string>([url]);
    for (const link of navLinks) {
      try {
        const parsed = new URL(link.href);
        if (parsed.origin === baseOrigin && !seenUrls.has(parsed.href) && !parsed.hash && !parsed.href.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|mp4|mp3)$/i)) {
          seenUrls.add(parsed.href);
          internalNavLinks.push(parsed.href);
        }
      } catch { /* skip invalid URLs */ }
    }

    // Crawl up to crawlDepth internal pages
    const pagesToCrawl = internalNavLinks.slice(0, crawlDepth);
    const crawledPages: { url: string; title: string | null }[] = [];
    const mergedColors = new Map(colorMap);
    const mergedFonts = new Set(fonts.map(f => f.family));
    const mergedFeatures = new Set(features);
    const mergedHeadings = [...headings];
    const mergedImages = [...images];
    const seenImageSrcs = new Set(images.map(i => i.src));
    const seenHeadingTexts = new Set(headings.map(h => h.text));

    for (const pageUrl of pagesToCrawl) {
      try {
        const subPage = await browser.newPage();
        await subPage.setViewport({ width: 1440, height: 900 });
        await subPage.goto(pageUrl, { waitUntil: "networkidle2", timeout: 15000 });
        await new Promise((r: (v: void) => void) => setTimeout(r, 1500));
        const subHtml = await subPage.content();
        await subPage.close();

        const $sub = cheerio.load(subHtml);
        crawledPages.push({ url: pageUrl, title: $sub("title").first().text().trim() || null });

        // Merge colors
        let subCss = "";
        $sub("style").each((_, el) => { subCss += $sub(el).text() + "\n"; });
        $sub("[style]").each((_, el) => { subCss += $sub(el).attr("style") + "\n"; });
        const subColorMap = extractColors(subCss);
        for (const [hex, count] of Array.from(subColorMap.entries())) {
          mergedColors.set(hex, (mergedColors.get(hex) || 0) + count);
        }

        // Merge fonts
        const subFonts = extractFonts(subCss, $sub);
        for (const f of subFonts) mergedFonts.add(f.family);

        // Merge features
        const subFeatures = detectFeatures($sub);
        for (const f of subFeatures) mergedFeatures.add(f);

        // Merge headings (deduplicate)
        $sub("h1, h2, h3, h4, h5, h6").each((_, el) => {
          const level = parseInt(el.tagName.replace("h", ""), 10);
          const text = $sub(el).text().trim();
          if (text && text.length < 200 && !seenHeadingTexts.has(text)) {
            seenHeadingTexts.add(text);
            mergedHeadings.push({ level, text });
          }
        });

        // Merge images (deduplicate)
        $sub("img[src]").each((_, el) => {
          const src = $sub(el).attr("src");
          if (src && !src.startsWith("data:")) {
            const resolved = resolveUrl(pageUrl, src);
            if (!seenImageSrcs.has(resolved)) {
              seenImageSrcs.add(resolved);
              mergedImages.push({ src: resolved, alt: $sub(el).attr("alt") || null, width: $sub(el).attr("width") || null, height: $sub(el).attr("height") || null });
            }
          }
        });
      } catch { /* skip failed sub-pages */ }
    }

    // Build merged colors array
    const mergedColorsArray = Array.from(mergedColors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([hex, count]) => ({ hex, source: "CSS", count }));

    // Build merged fonts array
    const mergedFontsArray = Array.from(mergedFonts).map(f => ({
      family: f,
      source: f.includes(" ") ? "Google Fonts / CSS" : "CSS",
    }));

    // Color palette grouping
    const colorPalette = groupColors(mergedColorsArray);

    // Close the main page
    await mainPage.close();

    // ═══════════════════════════════════════════════════════
    // PHASE 10: Diff/compare (optional)
    // ═══════════════════════════════════════════════════════

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let comparison: any = null;

    if (compareUrl) {
      try {
        const comparePageData = await scrapeSinglePage(compareUrl, browser);
        const comp$ = comparePageData.$;
        const compCss = comparePageData.allCss;

        const compColorMap = extractColors(compCss);
        const compColors = Array.from(compColorMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([hex, count]) => ({ hex, count }));
        const compFonts = extractFonts(compCss, comp$);
        const compTechStack = detectTechStack(comp$, comparePageData.html, comparePageData.headers);
        const compFeatures = detectFeatures(comp$);

        // Find differences
        const mainColorHexes = new Set(mergedColorsArray.map(c => c.hex));
        const compColorHexes = new Set(compColors.map(c => c.hex));
        const mainFontFamilies = new Set(mergedFontsArray.map(f => f.family));
        const compFontFamilies = new Set(compFonts.map(f => f.family));
        const mainTechSet = new Set(techStack);
        const compTechSet = new Set(compTechStack);
        const mainFeatureSet = new Set(Array.from(mergedFeatures));
        const compFeatureSet = new Set(compFeatures);

        comparison = {
          compareUrl,
          colors: {
            onlyInMain: mergedColorsArray.filter(c => !compColorHexes.has(c.hex)).map(c => c.hex),
            onlyInCompare: compColors.filter(c => !mainColorHexes.has(c.hex)).map(c => c.hex),
            shared: mergedColorsArray.filter(c => compColorHexes.has(c.hex)).map(c => c.hex),
          },
          fonts: {
            onlyInMain: mergedFontsArray.filter(f => !compFontFamilies.has(f.family)).map(f => f.family),
            onlyInCompare: compFonts.filter(f => !mainFontFamilies.has(f.family)).map(f => f.family),
            shared: mergedFontsArray.filter(f => compFontFamilies.has(f.family)).map(f => f.family),
          },
          techStack: {
            onlyInMain: techStack.filter(t => !compTechSet.has(t)),
            onlyInCompare: compTechStack.filter(t => !mainTechSet.has(t)),
            shared: techStack.filter(t => compTechSet.has(t)),
          },
          features: {
            onlyInMain: Array.from(mergedFeatures).filter(f => !compFeatureSet.has(f)),
            onlyInCompare: compFeatures.filter(f => !mainFeatureSet.has(f)),
            shared: Array.from(mergedFeatures).filter(f => compFeatureSet.has(f)),
          },
        };
      } catch {
        comparison = { compareUrl, error: "Failed to scrape comparison URL" };
      }
    }

    // ═══════════════════════════════════════════════════════
    // Build final result
    // ═══════════════════════════════════════════════════════

    clearTimeout(operationTimeout);
    await browser.close();
    browser = null;

    const fullResult = {
      // Standard BrandData fields
      url,
      meta,
      colors: mergedColorsArray,
      fonts: mergedFontsArray,
      logos: logos.slice(0, 10),
      icons: icons.slice(0, 10),
      techStack,
      links: {
        navigation: navLinks.slice(0, 30),
        social: socialLinks,
        external: externalLinks.slice(0, 20),
      },
      images: mergedImages.slice(0, 50),
      structure: {
        headings: mergedHeadings.slice(0, 50),
        sections: sections.slice(0, 20),
        forms: $main("form").length,
        buttons: buttons.slice(0, 20),
        inputs: inputs.slice(0, 20),
      },
      features: Array.from(mergedFeatures),
      cssVariables: cssVars.slice(0, 50),
      rawCssUrls: cssUrls,

      // New comprehensive fields
      screenshots,
      colorPalette,
      typography,
      components,
      componentCandidates,
      seo,
      performance,
      animations,
      accessibility,
      crawledPages,
      ...(comparison ? { comparison } : {}),
    };

    return c.json({ data: deepSanitize(fullResult), error: null });

  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    const msg = e instanceof Error ? e.message : "Brand full scrape failed";
    throw new HTTPException(502, { message: msg });
  }
});

// ─── Facebook Page Scraper ───────────────────────────

const fbSchema = z.object({
  url: z.string().url().max(2000),
});

scrape.post("/facebook", requireAuth, requireTeam, zValidator("json", fbSchema), async (c) => {
  const { url } = c.req.valid("json");

  // Normalize to /about page for max info
  let pageUrl = url.replace(/\/$/, "");
  const aboutUrl = pageUrl.includes("/about") ? pageUrl : `${pageUrl}/about`;

  const fs = await import("fs");
  const execPath = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => {
    try { fs.accessSync(p); return true; } catch { return false; }
  });

  if (!execPath) {
    throw new HTTPException(500, { message: "No browser available" });
  }

  const puppeteerExtra = await import("puppeteer-extra");
  const StealthPlugin = await import("puppeteer-extra-plugin-stealth");
  const puppeteer = puppeteerExtra.default;
  puppeteer.use(StealthPlugin.default());

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080",
        "--lang=en-US",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // ─── Scrape the About page ─────────────────────
    await page.goto(aboutUrl, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 3000));

    // Scroll down to load lazy content
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise(r => setTimeout(r, 2000));

    const aboutHtml = await page.content();
    const $about = cheerio.load(aboutHtml);

    // Extract company info from the about page
    const pageTitle = $about('meta[property="og:title"]').attr("content") ||
      $about("title").text().replace(" | Facebook", "").trim() || null;
    const pageDescription = $about('meta[property="og:description"]').attr("content") || null;

    // Extract page profile image — prefer img whose alt matches the page name,
    // since og:image can leak the logged-in user's avatar when authenticated.
    let pageImage: string | null = null;
    if (pageTitle) {
      const titleLower = pageTitle.toLowerCase();
      $about("img").each((_, el) => {
        if (pageImage) return;
        const alt = ($about(el).attr("alt") || "").toLowerCase();
        const src = $about(el).attr("src") || "";
        // Match alt text to page name and ensure it's from FB CDN
        if (alt && alt.includes(titleLower.split(" ")[0]) && (src.includes("scontent") || src.includes("fbcdn"))) {
          pageImage = src;
        }
      });
    }
    // Fallback: og:image (may leak user avatar when authenticated, last resort)
    if (!pageImage) {
      pageImage = $about('meta[property="og:image"]').attr("content") || null;
    }

    // Extract all visible text blocks for parsing
    const allText = $about("body").text();

    // Try to find structured info
    const info: Record<string, string> = {};

    // Common Facebook page info patterns
    const infoLabels = [
      "Phone", "Email", "Website", "Address", "Hours", "Price range",
      "About", "Categories", "Founded", "Mission",
    ];

    // Extract from accessibility spans and structured elements
    $about('[role="main"] span, [role="main"] a, [data-pagelet] span').each((_, el) => {
      const text = $about(el).text().trim();
      for (const label of infoLabels) {
        if (text.startsWith(label + "\n") || text.startsWith(label + " ")) {
          const value = text.replace(label, "").trim();
          if (value && value.length < 500) {
            info[label.toLowerCase()] = value;
          }
        }
      }
    });

    // Extract links (website, phone, email)
    const links: { type: string; value: string }[] = [];
    $about('a[href]').each((_, el) => {
      const href = $about(el).attr("href") || "";

      // Decode FB redirect links
      let decoded = href;
      if (href.includes("l.facebook.com/l.php")) {
        try { decoded = decodeURIComponent(new URL(href).searchParams.get("u") || href); } catch { /* keep original */ }
      }

      // Skip internal FB links
      if (decoded.includes("facebook.com") || decoded.includes("fb.com")) {
        // only process tel/mailto
      } else if (decoded.match(/^https?:\/\//)) {
        // Check if it's a social platform first (handled below)
        const isSocial = /instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|linkedin\.com/i.test(decoded);
        if (!isSocial && !links.find(l => l.value === decoded)) {
          links.push({ type: "website", value: decoded });
        }
      }

      if (href.startsWith("tel:")) {
        const phone = href.replace("tel:", "").trim();
        if (phone.replace(/\D/g, "").length <= 15 && phone.replace(/\D/g, "").length >= 7) {
          links.push({ type: "phone", value: phone });
        }
      }
      if (href.startsWith("mailto:")) {
        links.push({ type: "email", value: href.replace("mailto:", "").trim() });
      }
      // Social links on the page — decode FB redirects
      const socialPatterns: [RegExp, string][] = [
        [/instagram\.com/i, "instagram"],
        [/tiktok\.com/i, "tiktok"],
        [/twitter\.com|x\.com/i, "twitter"],
        [/youtube\.com/i, "youtube"],
        [/linkedin\.com/i, "linkedin"],
      ];
      for (const [pattern, platform] of socialPatterns) {
        if (pattern.test(href) && !links.find(l => l.type === platform)) {
          // Decode FB redirect wrapper if present
          let cleanUrl = href;
          if (href.includes("l.facebook.com/l.php")) {
            try { cleanUrl = decodeURIComponent(new URL(href).searchParams.get("u") || href); } catch { /* keep original */ }
          }
          links.push({ type: platform, value: cleanUrl });
        }
      }
    });

    // Extract phone numbers — must have separators (spaces, dashes, dots) to be real
    const phoneMatches = allText.match(/(?:\+?\d{1,3}[-.\s])?\(?\d{2,4}\)?[-.\s]\d{3,4}[-.\s]\d{3,5}/g) || [];
    for (const phone of phoneMatches.slice(0, 3)) {
      const cleaned = phone.trim();
      const digits = cleaned.replace(/\D/g, "");
      // Real phones: 7-15 digits with separators
      if (digits.length >= 7 && digits.length <= 15 && !links.find(l => l.type === "phone" && l.value === cleaned)) {
        links.push({ type: "phone", value: cleaned });
      }
    }

    // Extract email from text — strict: must start with a letter
    const emailMatches = allText.match(/[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g) || [];
    for (const email of emailMatches.slice(0, 3)) {
      // Strip common FB UI text that gets appended
      const cleaned = email.replace(/(Email|Phone|Website|Address|Send|Mobile|Message).*$/i, "").trim();
      if (cleaned.includes("@") && cleaned.length > 5 && !links.find(l => l.type === "email" && l.value === cleaned)) {
        links.push({ type: "email", value: cleaned });
      }
    }

    // Extract addresses
    const addresses: string[] = [];
    const skipAddressLabels = ["places lived", "current city", "hometown", "from"];
    $about('a[href*="maps"], a[href*="place"], a[href*="location"]').each((_, el) => {
      const text = $about(el).text().trim();
      if (text && text.length > 10 && text.length < 300 && !skipAddressLabels.includes(text.toLowerCase())) {
        addresses.push(text);
      }
    });
    // Also try to find address in structured spans
    $about('span').each((_, el) => {
      const text = $about(el).text().trim();
      if (text.match(/\d+.*(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|City|Philippines|Manila)/i) && text.length < 300 && text.length > 15) {
        if (!addresses.includes(text)) addresses.push(text);
      }
    });

    // ─── Scrape the main page for ALL posts ────────
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 3000));

    // Click "See more" on any truncated "About" text
    try {
      const seeMoreButtons = await page.$$('div[role="button"]');
      for (const btn of seeMoreButtons.slice(0, 3)) {
        const text = await btn.evaluate((el: Element) => el.textContent || "");
        if (text.trim() === "See more") {
          await btn.click();
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch { /* non-critical */ }

    interface FBPost {
      text: string;
      date: string | null;
      likes: string | null;
      comments: string | null;
      shares: string | null;
      images: string[];
    }

    // Infinite scroll to load all posts — stop after no new content or max 60 scrolls
    let previousHeight = 0;
    let noNewContentCount = 0;
    const maxScrolls = 60; // ~60 scrolls * 2s = 2 min max
    const maxPosts = 200;

    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1500));

      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) {
        noNewContentCount++;
        if (noNewContentCount >= 3) break; // No new content after 3 attempts
      } else {
        noNewContentCount = 0;
      }
      previousHeight = currentHeight;

      // Early exit if we already have enough articles in DOM
      const articleCount = await page.evaluate(() => document.querySelectorAll('[role="article"]').length);
      if (articleCount >= maxPosts) break;
    }

    // Now extract all posts from the fully-loaded page
    const mainHtml = await page.content();
    const $main = cheerio.load(mainHtml);

    const posts: FBPost[] = [];
    const seenTexts = new Set<string>();

    $main('[role="article"]').each((_, el) => {
      // Get the main post text — first dir="auto" div that's not a UI element
      const textEls = $main(el).find('div[dir="auto"]');
      let postText = "";
      textEls.each((_, textEl) => {
        const t = $main(textEl).text().trim();
        // Skip short UI labels like "Like", "Comment", "Share", dates
        if (t.length > 30 && t.length > postText.length) {
          postText = t;
        }
      });

      if (!postText || postText.length < 15) return;

      // Dedup by first 80 chars
      const key = postText.slice(0, 80);
      if (seenTexts.has(key)) return;
      seenTexts.add(key);

      // Engagement metrics
      const articleText = $main(el).text();
      const likeMatch = articleText.match(/(\d+)\s*(?:likes?|reactions?)/i);
      const commentMatch = articleText.match(/(\d+)\s*comments?/i);
      const shareMatch = articleText.match(/(\d+)\s*shares?/i);

      // Date — FB shows relative dates like "2h", "Yesterday", "January 8"
      let date: string | null = null;
      $main(el).find('a[href*="/posts/"], a[href*="/photos/"], a[href*="story_fbid"]').each((_, a) => {
        const linkText = $main(a).text().trim();
        if (linkText && linkText.length < 30 && /\d/.test(linkText)) {
          date = linkText;
          return false; // break
        }
      });

      // Images in this post
      const postImages: string[] = [];
      $main(el).find('img[src*="scontent"], img[src*="fbcdn"]').each((_, img) => {
        const src = $main(img).attr("src") || "";
        if (src && !postImages.includes(src)) {
          // Filter out tiny profile pics (usually ~40px)
          const w = parseInt($main(img).attr("width") || "0", 10);
          if (w === 0 || w > 60) {
            postImages.push(src);
          }
        }
      });

      posts.push({
        text: postText.slice(0, 3000),
        date,
        likes: likeMatch ? likeMatch[1] : null,
        comments: commentMatch ? commentMatch[1] : null,
        shares: shareMatch ? shareMatch[1] : null,
        images: postImages.slice(0, 5),
      });
    });

    // Extract all unique photos from the page
    const photos: string[] = [];
    $main('img[src*="scontent"], img[src*="fbcdn"]').each((_, el) => {
      const src = $main(el).attr("src") || "";
      const w = parseInt($main(el).attr("width") || "0", 10);
      if (src && (w > 80 || w === 0) && !photos.includes(src)) {
        photos.push(src);
      }
    });

    // Extract page category/likes from meta or visible text
    const categories: string[] = [];
    const categoryMatch = allText.match(/(?:Category|Categories)\s*[:\n]\s*([^\n]+)/i);
    if (categoryMatch) {
      categories.push(...categoryMatch[1].split(/[,·]/).map(c => c.trim()).filter(Boolean));
    }

    // Followers/likes count
    let followers: string | null = null;
    let likes: string | null = null;
    const followersMatch = allText.match(/([\d,.]+[KMkm]?)\s*followers/i);
    const likesMatch = allText.match(/([\d,.]+[KMkm]?)\s*(?:people\s+)?(?:like|likes)\s+this/i);
    if (followersMatch) followers = followersMatch[1];
    if (likesMatch) likes = likesMatch[1];

    // Hours parsing
    const hours: string[] = [];
    const hoursSection = allText.match(/(?:Hours|Opening Hours|Business Hours)[:\s]*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[\s\S]*?)(?:\n\n|\z)/i);
    if (hoursSection) {
      hours.push(...hoursSection[1].split("\n").map(l => l.trim()).filter(l => l.length > 3 && l.length < 100));
    }

    await browser.close();

    const fbResult = {
      url: pageUrl,
      name: pageTitle,
      description: pageDescription,
      profileImage: pageImage,
      followers,
      likes,
      categories,
      info,
      contact: {
        links,
        addresses,
        hours: hours.slice(0, 14),
      },
      posts: posts.slice(0, 200),
      photos: photos.slice(0, 50),
    };

    return c.json({ data: deepSanitize(fbResult), error: null });

  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    const msg = e instanceof Error ? e.message : "Facebook scrape failed";
    throw new HTTPException(502, { message: msg });
  }
});

// ─── Scrape History (Save / List / Get) ──────────────

import { db } from "../db/connection.js";
import { scrapeResult } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

// Save a scrape result
const saveSchema = z.object({
  url: z.string().url().max(2000),
  type: z.enum(["brand", "facebook"]),
  data: z.record(z.unknown()),
});

scrape.post("/save", requireAuth, requireTeam, zValidator("json", saveSchema), async (c) => {
  const { url, type, data } = c.req.valid("json");
  const user = c.get("user");

  const [saved] = await db().insert(scrapeResult).values({
    url,
    type,
    data,
    scrapedBy: user.userId,
  }).returning();

  return c.json({ data: { scrapeResultId: saved.scrapeResultId, message: "Saved" }, error: null }, 201);
});

// List saved scrapes
scrape.get("/history", requireAuth, requireTeam, async (c) => {
  const type = c.req.query("type");
  const rows = await db()
    .select({
      scrapeResultId: scrapeResult.scrapeResultId,
      url: scrapeResult.url,
      type: scrapeResult.type,
      createdAt: scrapeResult.createdAt,
    })
    .from(scrapeResult)
    .where(type ? eq(scrapeResult.type, type) : undefined)
    .orderBy(desc(scrapeResult.createdAt))
    .limit(50);

  return c.json({ data: rows, error: null });
});

// Get a single saved scrape
scrape.get("/history/:id", requireAuth, requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db()
    .select()
    .from(scrapeResult)
    .where(eq(scrapeResult.scrapeResultId, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Scrape result not found" });
  return c.json({ data: row, error: null });
});

// Delete a saved scrape
scrape.delete("/history/:id", requireAuth, requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(scrapeResult)
    .where(eq(scrapeResult.scrapeResultId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Not found" });
  return c.json({ data: { message: "Deleted" }, error: null });
});

export default scrape;
