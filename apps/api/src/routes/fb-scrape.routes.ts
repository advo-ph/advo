/**
 * Facebook Authenticated Page Scraper
 *
 * Uses blead's saved Facebook session to scrape full post history
 * from any public/accessible Facebook page.
 *
 * Key technique from blead: SSR <script> tag parsing — Facebook embeds
 * all page data as JSON in <script type="application/json"> tags.
 * This gets ALL data without infinite scrolling.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import * as cheerio from "cheerio";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const fbScrape = new Hono<{ Variables: Variables }>();

const SESSION_PATH = process.env.FB_SESSION_PATH || "/root/blead/data/facebook-session.json";

// ─── SSR Script Tag Parser ───────────────────────────
// Facebook embeds post data in <script type="application/json"> tags
// via RelayPrefetchedStreamCache. This extracts everything without DOM parsing.

interface FBPostData {
  postId: string;
  text: string;
  date: string | null;
  timestamp: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  images: string[];
  videoUrl: string | null;
  authorName: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepSanitize(obj: any): any {
  if (typeof obj === "string") {
    // Remove ALL control chars (0x00-0x1F except \n \r \t, plus 0x7F-0x9F)
    // Remove lone surrogates that break JSON/PostgreSQL
    let s = "";
    for (let i = 0; i < obj.length; i++) {
      const code = obj.charCodeAt(i);
      // Allow \n (10), \r (13), \t (9) — skip all other control chars
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
      if (code === 127) continue;
      if (code >= 128 && code <= 159) continue;
      // Skip lone surrogates
      if (code >= 0xD800 && code <= 0xDBFF) {
        const next = i + 1 < obj.length ? obj.charCodeAt(i + 1) : 0;
        if (next >= 0xDC00 && next <= 0xDFFF) {
          s += obj[i] + obj[i + 1]; // valid pair
          i++;
        }
        continue; // lone high surrogate — skip
      }
      if (code >= 0xDC00 && code <= 0xDFFF) continue; // lone low surrogate
      s += obj[i];
    }
    return s;
  }
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepSanitize(v);
    return out;
  }
  return obj;
}

/**
 * Recursively walk a JSON object looking for post-like structures.
 * Facebook's relay cache has deeply nested objects — we look for nodes
 * that have `message.text` or `creation_story` fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkForPosts(obj: any, posts: Map<string, FBPostData>, depth = 0): void {
  if (!obj || typeof obj !== "object" || depth > 20) return;

  // Check if this looks like a post node
  if (obj.post_id || obj.legacy_post_id || obj.id) {
    const postId = String(obj.post_id || obj.legacy_post_id || obj.id || "");

    // Must have message text
    const text = obj.message?.text || obj.initial_text?.text || obj.snippet?.text || "";

    if (text && text.length > 5 && !posts.has(postId)) {
      // Extract engagement
      const reactionCount = obj.reaction_count?.count
        || obj.feedback?.reaction_count?.count
        || obj.i18n_reaction_count
        || null;

      const commentCount = obj.comment_count?.total_count
        || obj.feedback?.comment_count?.total_count
        || obj.total_comment_count
        || null;

      const shareCount = obj.share_count?.count
        || obj.feedback?.share_count?.count
        || null;

      // Extract images
      const images: string[] = [];
      if (obj.attachments) {
        walkForImages(obj.attachments, images);
      }
      if (obj.photo_image?.uri) images.push(obj.photo_image.uri);
      if (obj.full_picture) images.push(obj.full_picture);

      // Extract video
      let videoUrl: string | null = null;
      if (obj.video?.playable_url) videoUrl = obj.video.playable_url;
      if (obj.video?.browser_native_hd_url) videoUrl = obj.video.browser_native_hd_url;

      // Timestamp
      const timestamp = obj.creation_time || obj.created_time || obj.publish_time || null;
      const date = timestamp ? new Date(timestamp * 1000).toISOString() : null;

      // Author
      const authorName = obj.author?.name || obj.actor?.name || obj.comet_sections?.context_layout?.story?.comet_sections?.actor_photo?.story?.actors?.[0]?.name || null;

      posts.set(postId, {
        postId,
        text,
        date,
        timestamp,
        likes: typeof reactionCount === "number" ? reactionCount : parseInt(reactionCount, 10) || null,
        comments: typeof commentCount === "number" ? commentCount : parseInt(commentCount, 10) || null,
        shares: typeof shareCount === "number" ? shareCount : parseInt(shareCount, 10) || null,
        images: [...new Set(images)].slice(0, 10),
        videoUrl,
        authorName,
      });
    }
  }

  // Recurse into all values
  if (Array.isArray(obj)) {
    for (const item of obj) walkForPosts(item, posts, depth + 1);
  } else {
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") walkForPosts(val, posts, depth + 1);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkForImages(obj: any, images: string[], depth = 0): void {
  if (!obj || typeof obj !== "object" || depth > 10) return;
  if (typeof obj === "string" && (obj.includes("scontent") || obj.includes("fbcdn")) && obj.startsWith("http")) {
    images.push(obj);
    return;
  }
  if (obj.uri && typeof obj.uri === "string" && obj.uri.startsWith("http")) {
    images.push(obj.uri);
  }
  if (obj.url && typeof obj.url === "string" && obj.url.startsWith("http") && (obj.url.includes("scontent") || obj.url.includes("fbcdn"))) {
    images.push(obj.url);
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walkForImages(item, images, depth + 1);
  } else {
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") walkForImages(val, images, depth + 1);
    }
  }
}

// ─── Page Info Extraction ────────────────────────────

interface FBPageInfo {
  name: string | null;
  category: string | null;
  followers: string | null;
  likes: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  profileImage: string | null;
  coverImage: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPageInfo(scriptData: any[]): FBPageInfo {
  const info: FBPageInfo = {
    name: null, category: null, followers: null, likes: null,
    description: null, website: null, phone: null, email: null,
    address: null, hours: null, profileImage: null, coverImage: null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(obj: any, depth = 0): void {
    if (!obj || typeof obj !== "object" || depth > 15) return;

    // Page name
    if (obj.name && obj.page_likers?.count && !info.name) {
      info.name = obj.name;
      info.likes = String(obj.page_likers.count);
    }
    if (obj.name && obj.followers_count && !info.name) {
      info.name = obj.name;
      info.followers = String(obj.followers_count);
    }
    if (obj.page_title && !info.name) info.name = obj.page_title;

    // Category
    if (obj.category_name && !info.category) info.category = obj.category_name;
    if (obj.category_type && !info.category) info.category = obj.category_type;

    // Description / About
    if (obj.about && typeof obj.about === "string" && !info.description) info.description = obj.about;
    if (obj.blurb && typeof obj.blurb === "string" && !info.description) info.description = obj.blurb;

    // Contact
    if (obj.website && typeof obj.website === "string" && !info.website) info.website = obj.website;
    if (obj.phone && typeof obj.phone === "string" && !info.phone) info.phone = obj.phone;
    if (obj.single_line_address && !info.address) info.address = obj.single_line_address;
    if (obj.emails && Array.isArray(obj.emails) && obj.emails.length > 0 && !info.email) {
      info.email = obj.emails[0];
    }

    // Images
    if (obj.profilePicLarge?.uri && !info.profileImage) info.profileImage = obj.profilePicLarge.uri;
    if (obj.profile_picture?.uri && !info.profileImage) info.profileImage = obj.profile_picture.uri;
    if (obj.cover_photo?.photo?.image?.uri && !info.coverImage) info.coverImage = obj.cover_photo.photo.image.uri;

    // Followers / likes from text
    if (typeof obj.text === "string") {
      const fMatch = obj.text.match(/([\d,.]+)\s*followers/i);
      const lMatch = obj.text.match(/([\d,.]+)\s*(?:people\s+)?like/i);
      if (fMatch && !info.followers) info.followers = fMatch[1];
      if (lMatch && !info.likes) info.likes = lMatch[1];
    }

    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, depth + 1);
    } else {
      for (const val of Object.values(obj)) {
        if (val && typeof val === "object") walk(val, depth + 1);
      }
    }
  }

  for (const data of scriptData) walk(data);
  return info;
}

// ─── Main Endpoint ───────────────────────────────────

const fbScrapeSchema = z.object({
  url: z.string().url().max(2000),
});

fbScrape.post("/facebook-full", requireAuth, requireTeam, zValidator("json", fbScrapeSchema), async (c) => {
  const { url } = c.req.valid("json");

  // Validate it's a Facebook URL
  if (!url.includes("facebook.com")) {
    throw new HTTPException(400, { message: "Must be a Facebook URL" });
  }

  const pageUrl = url.replace(/\/$/, "");

  // Check for session file
  const fs = await import("fs");
  if (!fs.existsSync(SESSION_PATH)) {
    throw new HTTPException(500, { message: "No Facebook session found. Login via noVNC on VPS first." });
  }

  const session = JSON.parse(fs.readFileSync(SESSION_PATH, "utf8"));

  // Launch Playwright with session
  const pw = await import("playwright-core");

  const execPath = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find((p) => {
    try { fs.accessSync(p); return true; } catch { return false; }
  });

  if (!execPath) {
    throw new HTTPException(500, { message: "No browser found on server" });
  }

  let browser;
  try {
    browser = await pw.chromium.launch({
      executablePath: execPath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const context = await browser.newContext({
      storageState: session,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "Asia/Manila",
    });

    const page = await context.newPage();

    // ─── Navigate to page ─────────────────────────
    console.log(`[FB-Scrape] Navigating to ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    // Check if we're actually logged in
    const cookies = await context.cookies("https://www.facebook.com");
    const isLoggedIn = cookies.some(c => c.name === "c_user");
    if (!isLoggedIn) {
      await browser.close();
      throw new HTTPException(401, { message: "Facebook session expired. Re-login via noVNC on VPS." });
    }

    // ─── Parse SSR <script> tags ─────────────────
    const html = await page.content();
    const $ = cheerio.load(html);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scriptData: any[] = [];
    $('script[type="application/json"]').each((_, el) => {
      const text = $(el).text();
      try {
        const parsed = JSON.parse(text);
        scriptData.push(parsed);
      } catch { /* skip unparseable */ }
    });

    console.log(`[FB-Scrape] Found ${scriptData.length} SSR script tags`);

    // Extract page info from SSR data
    const pageInfo = extractPageInfo(scriptData);

    // Extract page name + profile pic from live DOM
    const pageDOM = await page.evaluate(() => {
      const uiNoise = new Set(["Facebook", "Notifications", "Search", "Menu", "Settings", "Home", "Watch", "Marketplace", "Groups", "Gaming"]);

      // Page name: find h1 near follow/like buttons or after profile pic
      let name: string | null = null;
      const h1s = document.querySelectorAll("h1");
      for (const h1 of h1s) {
        const text = h1.textContent?.trim() || "";
        if (text.length < 2) continue;
        if (uiNoise.has(text)) continue;
        if (text.startsWith("Shared with")) continue;
        if (text.includes("Verified account")) {
          name = text.replace("Verified account", "").trim();
          break;
        }
        // Check if this h1 is near a Follow/Like button (page header area)
        const parent = h1.closest('[role="main"]') || h1.parentElement?.parentElement?.parentElement;
        if (parent) {
          const btns = parent.querySelectorAll('[role="button"]');
          const hasFollow = Array.from(btns).some(b => /follow|like|message/i.test(b.textContent || ""));
          if (hasFollow) { name = text; break; }
        }
        // Fallback: take first non-UI h1
        if (!name) name = text;
      }

      // Page profile pic: the image inside the page header (near the page name), NOT the logged-in user avatar
      // User avatar is usually small (32-40px) in top nav; page pic is larger (120-176px)
      let profilePic: string | null = null;
      const imgs = document.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
      for (const img of imgs) {
        const w = (img as HTMLImageElement).width;
        const h = (img as HTMLImageElement).height;
        const src = (img as HTMLImageElement).src;
        // Page profile pics are typically 120-176px, user nav avatars are 28-40px
        if (w >= 80 && w <= 200 && h >= 80 && h <= 200 && src) {
          // Make sure it's in the main content area, not the nav
          const inNav = img.closest('nav, [role="banner"], [aria-label="Facebook"]');
          if (!inNav) {
            profilePic = src;
            break;
          }
        }
      }

      return { name, profilePic };
    });
    if (pageDOM.name) pageInfo.name = pageDOM.name;
    if (pageDOM.profilePic) pageInfo.profileImage = pageDOM.profilePic;
    if (!pageInfo.description) pageInfo.description = $('meta[property="og:description"]').attr("content") || null;
    if (!pageInfo.profileImage) pageInfo.profileImage = $('meta[property="og:image"]').attr("content") || null;

    // ─── Extract posts from SSR ──────────────────
    const postMap = new Map<string, FBPostData>();
    for (const data of scriptData) {
      walkForPosts(data, postMap);
    }

    console.log(`[FB-Scrape] Found ${postMap.size} posts from SSR`);

    // ─── Scroll to load more posts ───────────────
    // SSR gives us the first batch. Scrolling triggers GraphQL loads for more.
    // Facebook lazy-loads posts in batches of ~3-5 — need patience.
    let previousPostCount = postMap.size;
    let noNewPostsCount = 0;
    const maxScrolls = 25; // ~25 scrolls for non-streaming endpoint (use /facebook-stream for full capture)
    let previousHeight = 0;

    for (let i = 0; i < maxScrolls; i++) {
      // Click "See more" on currently visible posts before scrolling past them
      await page.evaluate(() => {
        document.querySelectorAll('div[role="button"], span[role="button"]').forEach((el) => {
          if ((el as HTMLElement).innerText?.trim() === "See more") {
            (el as HTMLElement).click();
          }
        });
      });

      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
 

      // Also check if page height changed (content loaded)
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const heightChanged = currentHeight !== previousHeight;
      previousHeight = currentHeight;

      // Re-parse the updated DOM for new posts
      const newHtml = await page.content();
      const $new = cheerio.load(newHtml);
      $new('script[type="application/json"]').each((_, el) => {
        const text = $new(el).text();
        try {
          const parsed = JSON.parse(text);
          walkForPosts(parsed, postMap);
        } catch { /* skip */ }
      });

      // Extract posts from DOM using multiple selectors
      // data-ad-comet-preview="message" is the most reliable for FB page posts
      const postSelectors = [
        '[data-ad-comet-preview="message"]',
        '[data-ad-preview="message"]',
      ];

      for (const sel of postSelectors) {
        $new(sel).each((_, el) => {
          const text = $new(el).text().trim();
          if (text && text.length > 10) {
            const key = text.slice(0, 80);
            const hashId = `dom_${key.replace(/\s+/g, "_").slice(0, 50)}`;
            if (postMap.has(hashId)) return;

            // Walk up the DOM to find the full post wrapper
            // FB nests posts deeply — go up until we find role="article" or a large enough container
            let postContainer = $new(el).closest('[role="article"]');
            if (postContainer.length === 0) {
              // Walk up progressively until we find a container > 5000 bytes (a real post wrapper)
              let current = $new(el);
              for (let up = 0; up < 15; up++) {
                current = current.parent();
                if (!current.length) break;
                const htmlLen = (current.html() || "").length;
                if (htmlLen > 5000) { postContainer = current; break; }
              }
            }

            // Extract ALL images from the post container — FB images, not icons
            const images: string[] = [];
            const searchScope = postContainer.length > 0 ? postContainer : $new(el).parent().parent().parent().parent().parent().parent();
            searchScope.find('img[src*="scontent"], img[src*="fbcdn"]').each((_: number, img: any) => {
              const src = $new(img).attr("src") || "";
              const w = parseInt($new(img).attr("width") || "0", 10);
              const h = parseInt($new(img).attr("height") || "0", 10);
              // Skip tiny profile pics and reaction icons (usually < 50px)
              if (src && (w > 50 || h > 50 || (w === 0 && h === 0)) && !images.includes(src)) {
                images.push(src);
              }
            });

            const containerText = searchScope.text ? searchScope.text() : "";
            const likeMatch = containerText.match(/(\d+)\s*(?:likes?|reactions?)/i);
            const commentMatch = containerText.match(/(\d+)\s*comments?/i);
            const shareMatch = containerText.match(/(\d+)\s*shares?/i);

            postMap.set(hashId, {
              postId: hashId,
              text: text.slice(0, 3000),
              date: null,
              timestamp: null,
              likes: likeMatch ? parseInt(likeMatch[1], 10) : null,
              comments: commentMatch ? parseInt(commentMatch[1], 10) : null,
              shares: shareMatch ? parseInt(shareMatch[1], 10) : null,
              images: [...new Set(images)].slice(0, 20),
              videoUrl: null,
              authorName: null,
            });
          }
        });
      }

      // Also capture image-only posts from role="article" that have no text
      $new('[role="article"]').each((_, el) => {
        const images: string[] = [];
        $new(el).find('img[src*="scontent"], img[src*="fbcdn"]').each((_: number, img: any) => {
          const src = $new(img).attr("src") || "";
          const w = parseInt($new(img).attr("width") || "0", 10);
          if (src && (w > 60 || w === 0) && !images.includes(src)) images.push(src);
        });

        if (images.length > 0) {
          const hashId = `img_${images[0].slice(-30).replace(/\W/g, "_")}`;
          if (!postMap.has(hashId)) {
            postMap.set(hashId, {
              postId: hashId,
              text: "[Image/Video post]",
              date: null,
              timestamp: null,
              likes: null,
              comments: null,
              shares: null,
              images: images.slice(0, 10),
              videoUrl: null,
              authorName: null,
            });
          }
        }
      });

      if (postMap.size === previousPostCount && !heightChanged) {
        noNewPostsCount++;
        if (noNewPostsCount >= 4) {
          console.log(`[FB-Scrape] No new posts after ${i + 1} scrolls (${noNewPostsCount} idle). Done.`);
          break;
        }
        // Extra wait on idle — FB sometimes delays loading
        await page.waitForTimeout(2000);
      } else {
        noNewPostsCount = 0;
        if (postMap.size !== previousPostCount) {
          console.log(`[FB-Scrape] Scroll ${i + 1}: ${postMap.size} posts total (+${postMap.size - previousPostCount})`);
        }
      }
      previousPostCount = postMap.size;
    }

    // ─── Click all "See more" buttons ─────────────
    // Facebook truncates post text behind "See more" links.
    // We click them all to expand, then re-extract text.
    console.log(`[FB-Scrape] Clicking "See more" buttons...`);
    let seeMoreClicked = 0;

    // Scroll back to top first, then scan down clicking "See more"
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    for (let round = 0; round < 3; round++) {
      // Use JS to find and click all "See more" spans/divs in the page
      const clicked = await page.evaluate(() => {
        let count = 0;
        // Facebook uses both div[role="button"] and span for "See more"
        const candidates = document.querySelectorAll('div[role="button"], span[role="button"], div.x1i10hfl');
        candidates.forEach((el) => {
          const text = (el as HTMLElement).innerText?.trim();
          if (text === "See more") {
            (el as HTMLElement).click();
            count++;
          }
        });
        return count;
      });
      seeMoreClicked += clicked;
      if (clicked === 0) break;
      // Scroll down incrementally to trigger more
      await page.evaluate(() => window.scrollBy(0, 3000));
      await page.waitForTimeout(1500);
    }
    console.log(`[FB-Scrape] Expanded ${seeMoreClicked} "See more" buttons`);

    // ─── Re-extract post text from live DOM ──────
    // Now that "See more" is expanded, get full text via Playwright
    const expandedPosts = await page.evaluate(() => {
      const results: Array<{ text: string; images: string[] }> = [];
      const msgEls = document.querySelectorAll('[data-ad-comet-preview="message"], [data-ad-preview="message"]');
      msgEls.forEach((el) => {
        const text = (el as HTMLElement).innerText?.trim() || "";
        if (text.length < 10) return;

        // Walk up to find post container for images
        let container: HTMLElement | null = el as HTMLElement;
        for (let up = 0; up < 20; up++) {
          if (!container?.parentElement) break;
          container = container.parentElement;
          if (container.getAttribute("role") === "article") break;
          if (container.outerHTML.length > 8000) break;
        }

        const images: string[] = [];
        if (container) {
          container.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]').forEach((img) => {
            const src = (img as HTMLImageElement).src;
            const w = parseInt((img as HTMLImageElement).getAttribute("width") || "0", 10);
            if (src && (w > 50 || w === 0) && !images.includes(src)) images.push(src);
          });
        }

        results.push({ text: text.slice(0, 5000), images: images.slice(0, 20) });
      });
      return results;
    });

    // Merge expanded text back into postMap
    for (const ep of expandedPosts) {
      const key = ep.text.slice(0, 80);
      const hashId = `dom_${key.replace(/\s+/g, "_").slice(0, 50)}`;
      // Update existing or add new
      const existing = Array.from(postMap.values()).find(
        (p) => ep.text.startsWith(p.text.slice(0, 60)) || p.text.startsWith(ep.text.slice(0, 60))
      );
      if (existing) {
        // Expanded text is longer — update
        if (ep.text.length > existing.text.length) {
          existing.text = ep.text;
        }
        // Merge images
        for (const img of ep.images) {
          if (!existing.images.includes(img)) existing.images.push(img);
        }
        existing.images = existing.images.slice(0, 20);
      } else if (ep.text.length > 10) {
        postMap.set(hashId, {
          postId: hashId,
          text: ep.text,
          date: null,
          timestamp: null,
          likes: null,
          comments: null,
          shares: null,
          images: ep.images,
          videoUrl: null,
          authorName: null,
        });
      }
    }

    console.log(`[FB-Scrape] After expansion: ${postMap.size} posts total`);

    // ─── Extract all photos ──────────────────────
    const finalHtml = await page.content();
    const $final = cheerio.load(finalHtml);
    const allPhotoCdnUrls: string[] = [];
    $final('img[src*="scontent"], img[src*="fbcdn"]').each((_, el) => {
      const src = $final(el).attr("src") || "";
      const w = parseInt($final(el).attr("width") || "0", 10);
      if (src && (w > 80 || w === 0) && !allPhotoCdnUrls.includes(src)) {
        allPhotoCdnUrls.push(src);
      }
    });

    // ─── Download images to local storage ───────
    console.log(`[FB-Scrape] Downloading ${allPhotoCdnUrls.length} images...`);
    const fs2 = await import("fs");
    const path = await import("path");
    const { nanoid } = await import("nanoid");

    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    const pageSlug = pageUrl.replace(/^.*facebook\.com\//, "").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
    const scrapeDir = path.default.join(uploadDir, "fb-scrapes", pageSlug);
    fs2.mkdirSync(scrapeDir, { recursive: true });

    const downloadImage = async (cdnUrl: string): Promise<string | null> => {
      try {
        const res = await fetch(cdnUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = cdnUrl.includes(".png") ? ".png" : ".jpg";
        const filename = `${nanoid(8)}${ext}`;
        fs2.writeFileSync(path.default.join(scrapeDir, filename), buffer);
        return `/uploads/fb-scrapes/${pageSlug}/${filename}`;
      } catch {
        return null;
      }
    };

    // Download in parallel batches of 10
    const urlMap = new Map<string, string>(); // cdnUrl -> localUrl
    const cdnUrls = [...new Set([
      ...allPhotoCdnUrls,
      ...Array.from(postMap.values()).flatMap(p => p.images),
    ])];

    for (let i = 0; i < cdnUrls.length; i += 10) {
      const batch = cdnUrls.slice(i, i + 10);
      await Promise.allSettled(batch.map(async (u) => {
        const local = await downloadImage(u);
        if (local) urlMap.set(u, local);
      }));
    }

    console.log(`[FB-Scrape] Downloaded ${urlMap.size}/${cdnUrls.length} images`);

    // Replace CDN URLs with local URLs in posts
    for (const post of postMap.values()) {
      post.images = post.images.map(u => urlMap.get(u) || u);
    }

    const allPhotos = allPhotoCdnUrls.map(u => urlMap.get(u) || u);

    // Replace page info images too
    if (pageInfo.profileImage && urlMap.has(pageInfo.profileImage)) {
      pageInfo.profileImage = urlMap.get(pageInfo.profileImage)!;
    }
    if (pageInfo.coverImage && urlMap.has(pageInfo.coverImage)) {
      pageInfo.coverImage = urlMap.get(pageInfo.coverImage)!;
    }

    await browser.close();

    // Sort posts by timestamp (newest first)
    const sortedPosts = Array.from(postMap.values()).sort((a, b) => {
      if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
      return 0;
    });

    const result = {
      url: pageUrl,
      pageInfo,
      totalPosts: sortedPosts.length,
      posts: sortedPosts,
      photos: allPhotos.slice(0, 100),
      sessionValid: true,
      scrapedAt: new Date().toISOString(),
    };

    // Sanitize deeply then manually serialize to avoid JSON.stringify choking on stray chars
    const sanitized = deepSanitize(result);
    let jsonStr: string;
    try {
      jsonStr = JSON.stringify({ data: sanitized, error: null });
    } catch {
      // Nuclear option: strip all non-ASCII if JSON.stringify still fails
      const raw = JSON.stringify({ data: sanitized, error: null }, (_k, v) =>
        typeof v === "string" ? v.replace(/[^\x20-\x7E\n\r\t]/g, "") : v
      );
      jsonStr = raw;
    }
    return new Response(jsonStr, {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    if (e instanceof HTTPException) throw e;
    const msg = e instanceof Error ? e.message : "Facebook scrape failed";
    throw new HTTPException(502, { message: msg });
  }
});

// ─── SSE Streaming Scrape ────────────────────────────

fbScrape.post("/facebook-stream", requireAuth, requireTeam, zValidator("json", fbScrapeSchema), async (c) => {
  const { url } = c.req.valid("json");

  if (!url.includes("facebook.com")) {
    return c.json({ error: "Must be a Facebook URL" }, 400);
  }

  const pageUrl = url.replace(/\/$/, "");
  const fs = await import("fs");

  if (!fs.existsSync(SESSION_PATH)) {
    return c.json({ error: "No Facebook session found" }, 500);
  }

  const session = JSON.parse(fs.readFileSync(SESSION_PATH, "utf8"));
  const pw = await import("playwright-core");

  const execPath = ["/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome"]
    .find((p) => { try { fs.accessSync(p); return true; } catch { return false; } });

  if (!execPath) return c.json({ error: "No browser found" }, 500);

  // SSE response
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          const sanitized = deepSanitize(data);
          const json = JSON.stringify(sanitized);
          controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${json}\n\n`));
        };

        let browser;
        try {
          send("status", { step: "Launching browser...", progress: 2 });

          browser = await pw.chromium.launch({
            executablePath: execPath,
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
          });

          const context = await browser.newContext({
            storageState: session,
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport: { width: 1920, height: 1080 },
            locale: "en-US",
            timezoneId: "Asia/Manila",
          });

          const page = await context.newPage();

          send("status", { step: "Navigating to page...", progress: 5 });
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(5000);

          // Check login
          const cookies = await context.cookies("https://www.facebook.com");
          const isLoggedIn = cookies.some((ck: { name: string }) => ck.name === "c_user");
          if (!isLoggedIn) {
            send("error", { message: "Facebook session expired. Re-login via noVNC." });
            await browser.close();
            controller.close();
            return;
          }

          send("status", { step: "Parsing page data...", progress: 10 });

          // Parse SSR script tags
          const html = await page.content();
          const $ = cheerio.load(html);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const scriptData: any[] = [];
          $('script[type="application/json"]').each((_, el) => {
            try { scriptData.push(JSON.parse($(el).text())); } catch { /* skip */ }
          });

          // Page info
          const pageInfo = extractPageInfo(scriptData);
          // Extract page name + profile pic from live DOM
          const streamPageDOM = await page.evaluate(() => {
            const uiNoise = new Set(["Facebook", "Notifications", "Search", "Menu", "Settings", "Home", "Watch", "Marketplace", "Groups", "Gaming"]);
            let name: string | null = null;
            const h1s = document.querySelectorAll("h1");
            for (const h1 of h1s) {
              const text = h1.textContent?.trim() || "";
              if (text.length < 2 || uiNoise.has(text) || text.startsWith("Shared with")) continue;
              const cleaned = text.replace("Verified account", "").trim();
              const parent = h1.closest('[role="main"]') || h1.parentElement?.parentElement?.parentElement;
              if (parent) {
                const btns = parent.querySelectorAll('[role="button"]');
                const hasFollow = Array.from(btns).some(b => /follow|like|message/i.test(b.textContent || ""));
                if (hasFollow) { name = cleaned; break; }
              }
              if (!name) name = cleaned;
            }
            let profilePic: string | null = null;
            const imgs = document.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
            for (const img of imgs) {
              const w = (img as HTMLImageElement).width;
              const h = (img as HTMLImageElement).height;
              const src = (img as HTMLImageElement).src;
              if (w >= 80 && w <= 200 && h >= 80 && h <= 200 && src) {
                const inNav = img.closest('nav, [role="banner"], [aria-label="Facebook"]');
                if (!inNav) { profilePic = src; break; }
              }
            }
            return { name, profilePic };
          });
          if (streamPageDOM.name) pageInfo.name = streamPageDOM.name;
          if (streamPageDOM.profilePic) pageInfo.profileImage = streamPageDOM.profilePic;
          if (!pageInfo.description) pageInfo.description = $('meta[property="og:description"]').attr("content") || null;
          if (!pageInfo.profileImage) pageInfo.profileImage = $('meta[property="og:image"]').attr("content") || null;

          send("pageInfo", pageInfo);

          // SSR posts
          const postMap = new Map<string, FBPostData>();
          for (const data of scriptData) walkForPosts(data, postMap);

          // Send SSR posts immediately
          for (const p of postMap.values()) {
            send("post", p);
          }

          send("status", { step: `Found ${postMap.size} posts from initial load. Scrolling...`, progress: 15 });

          // ─── Scroll loop (no cap — scroll until end) ────
          let previousPostCount = postMap.size;
          let noNewPostsCount = 0;
          let scrollCount = 0;
          const maxScrolls = 9999; // no cap — scroll until bottom
          let previousHeight = 0;

          for (let i = 0; i < maxScrolls; i++) {
            scrollCount = i + 1;

            // Click "See more" on visible posts
            await page.evaluate(() => {
              document.querySelectorAll('div[role="button"], span[role="button"]').forEach((el) => {
                const text = (el as HTMLElement).innerText?.trim().toLowerCase() || "";
                if (text === "see more" || text === "...more" || text === "see more..." || text.startsWith("see mo")) {
                  (el as HTMLElement).click();
                }
              });
            });

            // Scroll
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000 + Math.random() * 1000);

            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            const heightChanged = currentHeight !== previousHeight;
            previousHeight = currentHeight;

            // Extract new posts from DOM
            const domDebug = await page.evaluate(() => ({
              articles: document.querySelectorAll('[role="article"]').length,
              messages: document.querySelectorAll('[data-ad-comet-preview="message"], [data-ad-preview="message"]').length,
              dirAutos: document.querySelectorAll('div[dir="auto"]').length,
              bodyLen: document.body.innerHTML.length,
            }));
            if (scrollCount <= 3) {
              console.log(`[FB-Stream] DOM debug scroll ${scrollCount}: ${JSON.stringify(domDebug)}`);
            }

            const newPosts = await page.evaluate(() => {
              const results: Array<{ text: string; images: string[] }> = [];
              const msgEls = document.querySelectorAll('[data-ad-comet-preview="message"], [data-ad-preview="message"]');
              msgEls.forEach((el) => {
                const text = (el as HTMLElement).innerText?.trim() || "";
                if (text.length < 10) return;

                let container: HTMLElement | null = el as HTMLElement;
                for (let up = 0; up < 20; up++) {
                  if (!container?.parentElement) break;
                  container = container.parentElement;
                  if (container.getAttribute("role") === "article") break;
                  if (container.outerHTML.length > 8000) break;
                }

                const images: string[] = [];
                container?.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]').forEach((img) => {
                  const src = (img as HTMLImageElement).src;
                  const w = (img as HTMLImageElement).width;
                  const h = (img as HTMLImageElement).height;
                  if (src && (w > 50 || h > 50 || (w === 0 && h === 0))) images.push(src);
                });

                results.push({ text: text.slice(0, 3000), images: [...new Set(images)].slice(0, 20) });
              });
              return results;
            });

            // Deduplicate and stream new posts
            let newCount = 0;
            for (const np of newPosts) {
              const hashId = `dom_${np.text.slice(0, 50).replace(/\s+/g, "_")}`;
              const existing = Array.from(postMap.values()).find(
                (p) => np.text.startsWith(p.text.slice(0, 60)) || p.text.startsWith(np.text.slice(0, 60))
              );

              if (existing) {
                if (np.text.length > existing.text.length) existing.text = np.text;
                for (const img of np.images) {
                  if (!existing.images.includes(img)) existing.images.push(img);
                }
                existing.images = existing.images.slice(0, 20);
              } else if (!postMap.has(hashId)) {
                const post: FBPostData = {
                  postId: hashId,
                  text: np.text,
                  date: null,
                  timestamp: null,
                  likes: null,
                  comments: null,
                  shares: null,
                  images: np.images,
                  videoUrl: null,
                  authorName: null,
                };
                postMap.set(hashId, post);
                send("post", post);
                newCount++;
              }
            }

            // Also parse any new SSR script tags
            const newHtml = await page.content();
            const $new = cheerio.load(newHtml);
            $new('script[type="application/json"]').each((_, el) => {
              try {
                const parsed = JSON.parse($new(el).text());
                const before = postMap.size;
                walkForPosts(parsed, postMap);
                // Stream any SSR-discovered posts
                if (postMap.size > before) {
                  const newEntries = Array.from(postMap.entries()).slice(before);
                  for (const [, p] of newEntries) send("post", p);
                }
              } catch { /* skip */ }
            });

            const totalNow = postMap.size;
            send("progress", {
              postsFound: totalNow,
              scrollCount,
              newThisScroll: totalNow - previousPostCount,
              step: `Scrolling... ${totalNow} posts found`,
              progress: Math.min(15 + Math.round((scrollCount / 50) * 70), 85),
            });

            if (totalNow === previousPostCount && !heightChanged) {
              noNewPostsCount++;
              if (noNewPostsCount >= 4) {
                send("status", { step: `Reached end of page after ${scrollCount} scrolls`, progress: 88 });
                break;
              }
              await page.waitForTimeout(2000);
            } else {
              noNewPostsCount = 0;
            }
            previousPostCount = totalNow;
          }

          // ─── Extract & download photos ─────────────
          send("status", { step: "Downloading images...", progress: 88 });
          const finalHtml = await page.content();
          const $final = cheerio.load(finalHtml);
          const allPhotoCdns: string[] = [];
          $final('img[src*="scontent"], img[src*="fbcdn"]').each((_, el) => {
            const src = $final(el).attr("src") || "";
            const w = parseInt($final(el).attr("width") || "0", 10);
            if (src && (w > 80 || w === 0) && !allPhotoCdns.includes(src)) allPhotoCdns.push(src);
          });

          // Download images to local storage
          const fs2 = await import("fs");
          const pathMod = await import("path");
          const { nanoid: nid } = await import("nanoid");
          const upDir = process.env.UPLOAD_DIR || "./uploads";
          const slug = pageUrl.replace(/^.*facebook\.com\//, "").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
          const imgDir = pathMod.default.join(upDir, "fb-scrapes", slug);
          fs2.mkdirSync(imgDir, { recursive: true });

          const dlImage = async (cdnUrl: string): Promise<string | null> => {
            try {
              const r = await fetch(cdnUrl, { signal: AbortSignal.timeout(10000) });
              if (!r.ok) return null;
              const buf = Buffer.from(await r.arrayBuffer());
              const ext = cdnUrl.includes(".png") ? ".png" : ".jpg";
              const fname = `${nid(8)}${ext}`;
              fs2.writeFileSync(pathMod.default.join(imgDir, fname), buf);
              return `/uploads/fb-scrapes/${slug}/${fname}`;
            } catch { return null; }
          };

          const streamUrlMap = new Map<string, string>();
          const allCdns = [...new Set([
            ...allPhotoCdns,
            ...Array.from(postMap.values()).flatMap(p => p.images),
          ])];

          send("status", { step: `Downloading ${allCdns.length} images...`, progress: 90 });

          for (let i = 0; i < allCdns.length; i += 10) {
            const batch = allCdns.slice(i, i + 10);
            await Promise.allSettled(batch.map(async (u) => {
              const local = await dlImage(u);
              if (local) streamUrlMap.set(u, local);
            }));
            send("progress", {
              postsFound: postMap.size,
              scrollCount,
              step: `Downloaded ${streamUrlMap.size}/${allCdns.length} images...`,
              progress: 90 + Math.round((i / allCdns.length) * 5),
            });
          }

          // Replace CDN URLs with local
          for (const post of postMap.values()) {
            post.images = post.images.map(u => streamUrlMap.get(u) || u);
          }
          const allPhotos = allPhotoCdns.map(u => streamUrlMap.get(u) || u);

          if (pageInfo.profileImage && streamUrlMap.has(pageInfo.profileImage)) {
            pageInfo.profileImage = streamUrlMap.get(pageInfo.profileImage)!;
          }
          if (pageInfo.coverImage && streamUrlMap.has(pageInfo.coverImage)) {
            pageInfo.coverImage = streamUrlMap.get(pageInfo.coverImage)!;
          }

          await browser.close();

          // Sort posts
          const sortedPosts = Array.from(postMap.values()).sort((a, b) => {
            if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
            return 0;
          });

          send("status", { step: "Saving results...", progress: 95 });

          // Auto-save to scrape_result
          try {
            const { db: getDb } = await import("../db/connection.js");
            const { scrapeResult } = await import("../db/schema.js");
            const authUser = c.get("user");
            await getDb().insert(scrapeResult).values({
              url: pageUrl,
              type: "facebook",
              data: deepSanitize({
                url: pageUrl,
                pageInfo,
                totalPosts: sortedPosts.length,
                posts: sortedPosts,
                photos: allPhotos.slice(0, 200),
                sessionValid: true,
                scrapedAt: new Date().toISOString(),
              }),
              scrapedBy: authUser?.userId || null,
            });
          } catch (e) {
            console.error("[FB-Stream] Save error:", e instanceof Error ? e.message : e);
          }

          send("complete", {
            totalPosts: sortedPosts.length,
            totalPhotos: allPhotos.length,
            scrollCount,
            scrapedAt: new Date().toISOString(),
          });

          controller.close();

        } catch (e) {
          if (browser) await browser.close().catch(() => {});
          const msg = e instanceof Error ? e.message : "Scrape failed";
          send("error", { message: msg });
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
});

// ─── Session Status ──────────────────────────────────

fbScrape.get("/facebook-session", requireAuth, requireTeam, async (c) => {
  const fs = await import("fs");
  if (!fs.existsSync(SESSION_PATH)) {
    return c.json({ data: { valid: false, message: "No session file found" }, error: null });
  }

  try {
    const session = JSON.parse(fs.readFileSync(SESSION_PATH, "utf8"));
    const cookieCount = session.cookies?.length || 0;
    const hasCUser = session.cookies?.some((c: { name: string }) => c.name === "c_user") || false;

    return c.json({
      data: {
        valid: hasCUser,
        cookieCount,
        message: hasCUser ? "Session appears valid" : "Session missing c_user cookie — may be expired",
      },
      error: null,
    });
  } catch {
    return c.json({ data: { valid: false, message: "Failed to parse session file" }, error: null });
  }
});

export default fbScrape;
