/**
 * Collector — drives an ALREADY-SIGNED-IN Chrome over CDP.
 *
 * Hard rules (account safety):
 *  - ATTACH ONLY. Never launches a browser, never logs in, never touches a
 *    profile dir. If the viewer is logged out we STOP and say so — we do not
 *    scrape a login wall and call it a result.
 *  - Every page load is charged to a per-hour budget; host load gates it.
 *  - Tabs we open are recorded and swept after a crash.
 *
 * Redundancy layers (each independent, all fed into one ledger):
 *   L1 SSR   <script type=application/json> blobs on first paint
 *   L2 NET   every /api/graphql/ response seen while scrolling (pagination)
 *   L3 DOM   permalink hrefs from the rendered feed (finds posts L1/L2 missed)
 *   L4 PERM  per-post permalink visit: exact counts + comment thread, cycling
 *            comment sort until the comment-id union stops growing
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  extractFromBlob,
  idFromPermalink,
  pageCountFromText,
  parseAboutText,
  parseGraphqlText,
  parseScriptBlob,
} from "./extract.js";
import { audit, Convergence, PostLedger } from "./ledger.js";
import { coolDownMs, jitter, loadPerCpu, makeBudget } from "./pace.js";
import type { Comment, PageInfo, Post } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface CollectOption {
  url: string;
  cdp: string; // http://127.0.0.1:6922
  out_dir: string;
  page_load_per_hour: number;
  max_round: number;
  max_post: number;
  max_minute: number;
  patience: number;
  /** Visit each post permalink for exact counts + full comment thread. */
  deep: boolean;
  max_deep_post: number;
  /** Reuse the checkpoint's post list; run only the per-post pass. */
  skip_feed?: boolean;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export const DEFAULT: Omit<CollectOption, "url" | "cdp" | "out_dir"> = {
  page_load_per_hour: 120,
  max_round: 800,
  max_post: 2000,
  max_minute: 60,
  patience: 8,
  deep: true,
  max_deep_post: 400,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CollectResult {
  page: Partial<PageInfo>;
  post: Post[];
  audit: ReturnType<typeof audit>;
  stat: Record<string, number | string | null>;
}

/** Normalise any facebook URL to the page slug / id used for permalink filtering. */
export function pageSlug(url: string): string {
  const u = new URL(url);
  if (u.pathname.startsWith("/profile.php")) return u.searchParams.get("id") ?? "";
  return u.pathname.split("/").filter(Boolean)[0] ?? "";
}

export async function collect(opt: CollectOption): Promise<CollectResult> {
  const log = opt.log ?? (() => {});
  mkdirSync(opt.out_dir, { recursive: true });
  const slug = pageSlug(opt.url);
  const checkpoint = join(opt.out_dir, "checkpoint.json");

  // playwright-core is already an api dependency.
  const { chromium } = (await import("playwright-core")) as Any;
  const browser = await connectWithRetry(chromium, opt.cdp, log);
  const context: Any = browser.contexts()[0];
  if (!context) throw new Error("CDP browser has no context — is it a signed-in profile?");

  const budget = makeBudget(opt.page_load_per_hour);
  const ledger = new PostLedger();
  const page_info: Partial<PageInfo> = {};
  const stat: Record<string, number | string | null> = {
    round: 0, ssr_post: 0, net_post: 0, dom_post: 0, perm_visit: 0, graphql_response: 0, rate_limit: 0, stop: null,
  };
  let rate_limited = false;
  let has_next: boolean | null = null;

  if (existsSync(checkpoint)) {
    try {
      ledger.load(JSON.parse(readFileSync(checkpoint, "utf8")).post as Post[]);
      log("resume", { post: ledger.size });
    } catch { /* corrupt checkpoint: start clean */ }
  }

  const locked_fid = new Map<string, string>();
  const save = () => writeFileSync(checkpoint, JSON.stringify({ post: ledger.all(), page: page_info }));

  const gate = async () => {
    while (loadPerCpu() > Number(process.env.FB_MAX_LOAD_PER_CPU || 4)) {
      log("host_busy", { load_per_cpu: loadPerCpu() });
      await sleep(30_000);
    }
    const w = budget.wait_ms();
    if (w > 0) {
      log("budget_wait", { wait_ms: w });
      await sleep(w);
    }
    budget.take();
  };

  const eat = (blob: Any, source: string, ctx: string | null = null): number => {
    const r = extractFromBlob(blob, source, ctx);
    let fresh = 0;
    // Ownership filter: permalink/SSR pages embed suggested posts from OTHER pages.
    const own = (p: Post) =>
      source === "graphql" && !ctx
        ? true
        : (p.permalink ?? "").toLowerCase().includes(slug.toLowerCase()) ||
          p.post_id === ctx || p.alias.includes(ctx ?? "") ||
          (!!page_info.page_id && p.author_id === page_info.page_id);
    r.post = r.post.filter(own);
    r.comment = r.comment.filter((c) => !ctx || c.post_id === ctx || ledger.get(c.post_id));
    // A reel viewer auto-advances and streams the NEXT reel's comments into the same page.
    // The first Feedback thread seen for a visited post is its own; any other thread is a neighbour's.
    if (ctx) {
      for (const c of r.comment) {
        if (!c.feedback_id || c.depth > 0) continue; // a reply expansion legitimately returns the parent comment's own thread
        const own_fid = locked_fid.get(ctx) ?? (locked_fid.set(ctx, c.feedback_id), c.feedback_id);
        if (c.feedback_id !== own_fid) { c.post_id = ""; stat.foreign_comment = ((stat.foreign_comment as number) ?? 0) + 1; }
      }
      r.comment = r.comment.filter((c) => c.post_id);
    }
    for (const p of r.post) if (ledger.ingest(p)) fresh++;
    // Comments arrive loose on permalink payloads: group by post and ingest.
    const by_post = new Map<string, Comment[]>();
    for (const c of r.comment) (by_post.get(c.post_id) ?? by_post.set(c.post_id, []).get(c.post_id)!).push(c);
    for (const [pid, list] of by_post) {
      const owner = ledger.get(pid)?.author_id ?? null;
      ledger.ingestComment(pid, list.map((c) => ({ ...c, is_page_author: !!owner && c.author_id === owner })));
    }
    for (const [k, v] of Object.entries(r.page)) if (page_info[k as keyof PageInfo] === undefined) (page_info as Any)[k] = v;
    for (const e of r.error) if (e.code === 1675004) { rate_limited = true; stat.rate_limit = (stat.rate_limit as number) + 1; }
    if (r.has_next_page !== null) has_next = r.has_next_page;
    return fresh;
  };

  const tab = await context.newPage();
  let new_in_flight = 0;
  tab.on("response", async (res: Any) => {
    if (!res.url().includes("/api/graphql")) return;
    try {
      const body = await res.text();
      stat.graphql_response = (stat.graphql_response as number) + 1;
      for (const blob of parseGraphqlText(body)) new_in_flight += eat(blob, "graphql");
    } catch { /* response body gone */ }
  });

  try {
    await gate();
    await tab.goto(opt.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await tab.waitForTimeout(5000);

    // ── Login check: refuse to scrape a login wall ──
    const html0: string = await tab.content();
    const viewer = (html0.match(/"USER_ID":"(\d+)"/) || [])[1];
    const login_ok = !!viewer && viewer !== "0";
    log("login", { login_ok, viewer: login_ok ? viewer : null });
    if (!login_ok) {
      stat.stop = "logged-out";
      const result = finish(ledger, page_info, stat, { login_ok, rate_limited, round: 0 });
      return result;
    }

    // ── L1 SSR ──
    for (const blob of parseScriptBlob(html0)) stat.ssr_post = (stat.ssr_post as number) + eat(blob, "ssr");
    Object.assign(page_info, { ...pageCountFromText(await tab.innerText("body").catch(() => "")), ...page_info });

    Object.assign(page_info, await collectAbout(tab, opt.url, gate, log, page_info));

    // ── L2 NET + L3 DOM: scroll to convergence ──
    const conv = new Convergence({ patience: opt.patience, max_round: opt.max_round, max_ms: opt.max_minute * 60_000, max_post: opt.max_post });
    let stop_reason: string | null = null;
    for (;;) {
      if (opt.skip_feed && ledger.size > 0) { stop_reason = "checkpoint"; break; }
      new_in_flight = 0;
      const before = ledger.size;
      await tab.mouse.wheel(0, 2400 + Math.floor(Math.random() * 900));
      await sleep(jitter(2200));
      const href: string[] = await tab.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") || "").filter((h) => /\/(posts|permalink|videos|reel)\//.test(h)),
      );
      for (const h of href) {
        const id = idFromPermalink(h);
        if (!id || !h.toLowerCase().includes(slug.toLowerCase())) continue;
        if (!ledger.get(id)) {
          // DOM-only discovery: record a stub so L4 backfills it.
          const url = new URL(h, "https://www.facebook.com");
          url.search = "";
          const stub: Post = emptyPost(id, url.toString());
          if (ledger.ingest(stub)) stat.dom_post = (stat.dom_post as number) + 1;
        }
      }
      stat.round = (stat.round as number) + 1;
      const d = conv.record(ledger.size - before, ledger.size, has_next);
      log("round", { round: stat.round, post: ledger.size, new: ledger.size - before, net_new: new_in_flight, has_next });
      if (stat.round as number % 5 === 0) save();
      if (rate_limited) {
        const cd = coolDownMs(1);
        log("rate_limited_cooldown", { ms: cd });
        stop_reason = "rate-limited";
        break;
      }
      if (d.stop) { stop_reason = d.reason; break; }
    }
    stat.stop = stop_reason;
    save();

    // ── L4 PERM: per-post permalink pass ──
    if (opt.deep && !rate_limited) {
      const target = ledger
        .all()
        .filter((p) => process.env.FB_REPLY_ONLY ? reply_gap(p) > 0 : true)
        .filter((p) => p.permalink && (((p.comment_count === null || p.comment_count > 0) && p.comment.length < (p.comment_count ?? Infinity)) || reply_gap(p) > 0))
        .slice(0, opt.max_deep_post);
      let visited = 0;
      for (const p of target) {
        await gate();
        await deepVisit(context, p, ledger, eat, log, stat);
        if (rate_limited) { stat.stop = "rate-limited"; break; }
        await sleep(jitter(1500));
        if (++visited % 10 === 0) save();
      }
      save();
    }
  } finally {
    await tab.close().catch(() => {});
    await browser.close().catch(() => {}); // detaches the CDP client; Chrome keeps running
  }

  return finish(ledger, page_info, stat, { login_ok: true, rate_limited, round: stat.round as number });
}

/** Visit the About sub-pages and parse brand/contact fields. Exported for the about-only CLI mode. */
export async function collectAbout(
  tab: Any, url: string, gate: () => Promise<void>, log: NonNullable<CollectOption["log"]>, have: Partial<PageInfo>,
): Promise<Partial<PageInfo>> {
  const base = url.split("?")[0].replace(/\/?$/, "/");
  // Main-page Intro carries the street address; grab it before navigating away.
  let text = "\n" + (await tab.innerText("body").catch(() => "")) + "\n";
  for (const sub of ["about", "directory_contact_info", "directory_links", "directory_privacy_and_legal_info"]) {
    try {
      await gate();
      await tab.goto(base + sub, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await tab.waitForTimeout(3500);
      const body: string = await tab.innerText("body").catch(() => "");
      text += "\n" + (body.split("\nPrivacy and legal info\n").slice(1).join("\n") || body) + "\n";
    } catch (e) { log("about_fail", { sub, error: String((e as Error).message).slice(0, 100) }); }
  }
  const about = parseAboutText(text);
  const fresh: Partial<PageInfo> = {};
  for (const [k, v] of Object.entries(about)) if ((have as Any)[k] === undefined) (fresh as Any)[k] = v;
  log("about", fresh as Record<string, unknown>);
  try {
    await gate();
    await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await tab.waitForTimeout(3500);
  } catch { /* the feed phase navigates itself */ }
  return fresh;
}

/**
 * In-page expander, shipped as a STRING: a TS function body passed to
 * page.evaluate gets esbuild's `__name` helper injected under tsx and then
 * throws ReferenceError in the page. A string cannot be transformed.
 */
const IN_PAGE_OPEN_COMMENT = `(() => {
  const e = [...document.querySelectorAll("[aria-label]")].find((x) => /^Comment, \\d+ comments?$/i.test(x.getAttribute("aria-label")));
  if (e) e.click();
})()`;

const IN_PAGE_EXPAND = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const MORE = /^(view (hidden |more |previous )?(\\d+ )?(more )?(comments?|repl(y|ies))|view all \\d+ repl(y|ies)|\\d+ repl(y|ies)|see more comments)$/i;
  const btn = [...document.querySelectorAll("div[role=button],span[role=button],span")].filter((e) => MORE.test((e.textContent || "").trim())).slice(0, 4);
  for (const e of btn) { e.click(); await wait(900); }
  for (const e of document.querySelectorAll("*")) {
    if (e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
  }
  window.scrollBy(0, 1500);
})()`;

function emptyPost(id: string, permalink: string): Post {
  return {
    post_id: id, alias: [id], permalink, kind: "unknown", text: "", created_at: null, created_unix: null,
    author_id: null, author_name: null, reaction_count: null, reaction_breakdown: {}, comment_count: null,
    share_count: null, view_count: null, image_url: [], video_url: null, external_url: [], hashtag: [], mention: [],
    is_sponsored: false, is_pinned: false, source: ["dom"], comment: [],
  };
}

async function connectWithRetry(chromium: Any, cdp: string, log: NonNullable<CollectOption["log"]>): Promise<Any> {
  let wait = 5000;
  for (let attempt = 1; ; attempt++) {
    try { return await chromium.connectOverCDP(cdp, { timeout: 30_000 }); }
    catch (e) {
      if (attempt >= 5) throw new Error(`CDP ${cdp}: ${(e as Error).message}`);
      log("cdp_retry", { attempt, wait_ms: wait });
      await sleep(wait);
      wait = Math.min(wait * 2, 60_000);
    }
  }
}

/** Click "View N repl(y|ies)" with real pointer events (max 4 per call, in view only). */
async function expandReplies(tab: Any): Promise<void> {
  const loc = tab.getByText(/^(view (all )?\d+ )?(more )?repl(y|ies)$|^view \d+ repl(y|ies)$|^\d+ repl(y|ies)$/i);
  for (let i = 0; i < 4; i++) {
    const el = loc.first();
    if (!(await el.count())) return;
    const ok = await el.click({ timeout: 3000 }).then(() => true, () => false);
    if (!ok) return;
    await sleep(jitter(1200));
  }
}

/** Replies Facebook says exist (sum of per-comment reply_count) minus replies captured (depth>0). */
function reply_gap(p: Post): number {
  const said = p.comment.reduce((a, c) => a + (c.reply_count ?? 0), 0);
  return said - p.comment.filter((c) => c.depth > 0).length;
}

/** Open one post permalink and pull its comment thread — only as far as FB says there are comments. */
async function deepVisit(
  context: Any, p: Post, ledger: PostLedger,
  eat: (blob: Any, source: string, ctx: string | null) => number,
  log: NonNullable<CollectOption["log"]>, stat: Record<string, number | string | null>,
): Promise<void> {
  const want = p.comment_count ?? Infinity;
  const have = () => ledger.get(p.post_id)?.comment.length ?? 0;
  const gap = () => { const q = ledger.get(p.post_id); return q ? reply_gap(q) : 0; };
  const tab = await context.newPage();
  // Heavy assets are useless for comment text: cut bandwidth + host load + page-load time.
  await tab.route("**/*", (r: Any) => (["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
  const handler = async (res: Any) => {
    if (!res.url().includes("/api/graphql")) return;
    try { for (const b of parseGraphqlText(await res.text())) eat(b, "permalink", p.post_id); } catch { /* gone */ }
  };
  tab.on("response", handler);
  try {
    await tab.goto(p.permalink!, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await tab.waitForSelector('[aria-label^="Comment by"]', { timeout: 7000 }).catch(() => {});
    for (const b of parseScriptBlob(await tab.content())) eat(b, "permalink", p.post_id);
    const labelCount = (): Promise<number> =>
      tab.evaluate(() => new Set([...document.querySelectorAll('[aria-label^="Comment by"],[aria-label^="Reply by"]')].map((e) => e.getAttribute("aria-label"))).size);
    const vp = (await tab.viewportSize()) ?? { width: 1280, height: 720 };
    // Reels / videos keep comments behind a button ("Comment, 28 comments") and render no `Comment by` labels.
    if (/\/(reel|videos|watch)\b/.test(p.permalink ?? "")) {
      await tab.evaluate(IN_PAGE_OPEN_COMMENT);
      await sleep(jitter(2500));
    }
    // At most 2 passes, and only while the last one grew the thread AND FB says more exist.
    for (let pass = 0; pass < 2 && (have() < want || gap() > 0); pass++) {
      const start = have();
      let last = Math.max(await labelCount(), have());
      let still = 0;
      for (let i = 0; i < 40 && still < 3 && (have() < want || gap() > 0); i++) {
        await tab.evaluate(IN_PAGE_EXPAND);
        if (gap() > 0) await expandReplies(tab); // Facebook ignores synthetic in-page clicks on reply expanders
        for (const x of [0.5, 0.8]) {
          await tab.mouse.move(vp.width * x, vp.height * 0.6);
          await tab.mouse.wheel(0, 1400);
        }
        await sleep(jitter(1500));
        const now = Math.max(await labelCount(), have());
        still = now > last ? 0 : still + 1;
        last = now;
      }
      log("deep_pass", { post: p.post_id, pass, rendered: last, comment: have(), fb_count: p.comment_count });
      if (have() === start) break; // a pass that adds nothing: the rest are hidden/filtered by FB
    }
    stat.perm_visit = (stat.perm_visit as number) + 1;
  } catch (e) {
    log("deep_fail", { post: p.post_id, error: String((e as Error).message).slice(0, 120) });
  } finally {
    tab.off("response", handler);
    await tab.close().catch(() => {});
  }
}

function finish(
  ledger: PostLedger, page: Partial<PageInfo>, stat: Record<string, number | string | null>,
  ctx: { login_ok: boolean; rate_limited: boolean; round: number },
): CollectResult {
  const post = ledger.all();
  return {
    page, post, stat,
    audit: audit(post, { follower_count: page.follower_count ?? null, stop_reason: (stat.stop as string) ?? null, ...ctx }),
  };
}

export { dirname };
