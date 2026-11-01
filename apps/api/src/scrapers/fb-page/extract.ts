/**
 * Pure extractors: Facebook Relay JSON -> normalized Post / Comment / PageInfo.
 *
 * Design rules (why this replaces the old first-match walker):
 *  1. Anchor on real Story nodes (`post_id` + `creation_time`), never on any
 *     object that happens to carry an `id`.
 *  2. Pull each field with `dig()` (first hit under the node) so a reshuffled
 *     `comet_sections` tree does not zero a field.
 *  3. Never throw on a malformed blob: return what was found.
 *  4. Counts distinguish 0 from "not present" (null).
 */

import type { Comment, ExtractResult, PageInfo, Post, PostKind } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const MAX_DEPTH = 60;

/** Strip control chars + lone surrogates that break JSON / PostgreSQL. */
export function sanitize(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) continue;
    if (c === 127 || (c >= 128 && c <= 159)) continue;
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    out += input[i];
  }
  return out;
}

/** First value for `key` found at any depth under `obj` (breadth-limited DFS). */
export function dig(obj: Json, key: string, depth = 0): Json {
  if (!obj || typeof obj !== "object" || depth > MAX_DEPTH) return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = dig(item, key, depth + 1);
      if (r !== undefined && r !== null) return r;
    }
    return undefined;
  }
  if (key in obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  for (const v of Object.values(obj)) {
    const r = dig(v, key, depth + 1);
    if (r !== undefined && r !== null) return r;
  }
  return undefined;
}

/** Best `message` object (at any depth): has caption text, prefers the one carrying entity ranges. */
function findMessage(obj: Json): Json {
  let best: Json;
  const score = (m: Json) => (Array.isArray(m.ranges) ? m.ranges.length : 0) * 1e6 + m.text.length;
  const go = (o: Json, depth: number): void => {
    if (!o || typeof o !== "object" || depth > MAX_DEPTH) return;
    if (!Array.isArray(o) && o.message && typeof o.message === "object" && typeof o.message.text === "string") {
      if (!best || score(o.message) > score(best)) best = o.message;
    }
    for (const v of Object.values(o)) go(v, depth + 1);
  };
  go(obj, 0);
  return best;
}

function num(v: Json): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseCount(v);
  return null;
}

/** "3.2K" -> 3200, "1,204" -> 1204, "1.5M" -> 1500000. */
export function parseCount(raw: string): number | null {
  const m = raw.trim().replace(/,/g, "").match(/^([\d.]+)\s*([KkMmBb])?$/);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Math.round(base * mult);
}

function unique<T>(a: T[]): T[] {
  return [...new Set(a)];
}

function isFbCdn(u: string): boolean {
  return /^https?:\/\//.test(u) && /(scontent|fbcdn)/.test(u);
}

/** Unwrap l.facebook.com/l.php?u=… redirect links. */
export function unwrapLinkShim(u: string): string {
  try {
    const url = new URL(u);
    if (url.hostname === "l.facebook.com" || url.hostname === "lm.facebook.com") {
      const t = url.searchParams.get("u");
      if (t) return t;
    }
  } catch {
    /* fall through */
  }
  return u;
}

/** Pull the pfbid / numeric id out of a permalink. */
export function idFromPermalink(url: string | null | undefined): string | null {
  if (!url) return null;
  const pf = url.match(/pfbid[0-9A-Za-z]+/);
  if (pf) return pf[0];
  const m =
    url.match(/\/posts\/(\d{6,})/) ||
    url.match(/[?&](?:story_fbid|fbid|v)=(\d{6,})/) ||
    url.match(/\/(?:videos|reel)\/(\d{6,})/);
  return m ? m[1] : null;
}

function collectImage(node: Json, out: string[], depth = 0): void {
  if (!node || typeof node !== "object" || depth > 25) return;
  if (Array.isArray(node)) {
    for (const i of node) collectImage(i, out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "string" && isFbCdn(v) && /(^|_)(uri|url|src)$/.test(k) && /\.(jpe?g|png|webp)|_n\.|stp=/.test(v)) {
      out.push(v);
    } else if (v && typeof v === "object") collectImage(v, out, depth + 1);
  }
}

function classify(node: Json, hasVideo: boolean, image: string[], external: string[]): PostKind {
  const attachmentType = JSON.stringify(
    (node.attachments || []).map((a: Json) => [a?.media?.__typename, a?.styles?.__typename]),
  );
  if (/Video/.test(attachmentType) || hasVideo) return /reel/i.test(node.permalink_url || "") ? "reel" : "video";
  if (/Album/.test(attachmentType) || image.length > 1) return "album";
  if (/Photo/.test(attachmentType) || image.length === 1) return "photo";
  if (/Event/.test(attachmentType)) return "event";
  if (external.length) return "link";
  if (node.attached_story || node.work_reposted_story) return "share";
  return "text";
}

/** Is this object a feed Story we can turn into a Post? */
function isStory(o: Json): boolean {
  return (
    o &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    typeof o.post_id === "string" &&
    typeof o.creation_time === "number" &&
    (o.comet_sections !== undefined || o.attachments !== undefined || o.feedback !== undefined)
  );
}

export function storyToPost(node: Json, source: string): Post {
  const sections = node.comet_sections ?? {};
  const msg = findMessage(sections) ?? findMessage(node);
  const text = sanitize(
    (typeof msg?.text === "string" && msg.text) ||
      dig(sections?.content, "story")?.message?.text ||
      node.message?.text ||
      "",
  );

  const range = (dig(msg, "ranges") as Json[]) || [];
  const hashtag: string[] = [];
  const mention: string[] = [];
  const external: string[] = [];
  for (const r of range) {
    const e = r?.entity;
    if (!e) continue;
    if (e.__typename === "Hashtag") {
      const t = String(e.url || "").match(/hashtag\/([^/?]+)/);
      if (t) hashtag.push(decodeURIComponent(t[1]).toLowerCase());
    } else if (e.__typename === "ExternalUrl" || e.web_link?.url) {
      external.push(unwrapLinkShim(e.web_link?.url || e.url));
    } else if (e.__typename === "User" || e.__typename === "Page") {
      if (e.name) mention.push(String(e.name));
    }
  }
  // Fallback: hashtags/links typed in the caption but not ranged.
  for (const h of text.match(/#[\p{L}\p{N}_]+/gu) ?? []) hashtag.push(h.slice(1).toLowerCase());
  for (const l of text.match(/https?:\/\/[^\s)]+/g) ?? []) external.push(l);

  const permalink: string | null =
    node.permalink_url || dig(sections, "story")?.url || dig(node, "wwwURL") || null;

  // Feedback (reactions / comments / shares). Counts are split across
  // adaptive_ufi_action_renderers[n].feedback in paginated payloads and live
  // on the summary node in SSR, so read them from the whole UFI subtree.
  const ufi = sections.feedback ?? node.feedback ?? node;
  const reaction_count = num(dig(ufi, "reaction_count")?.count ?? dig(ufi, "i18n_reaction_count"));
  const comment_count = num(
    dig(ufi, "comment_rendering_instance")?.comments?.total_count ??
      dig(ufi, "comments_count_summary_renderer")?.feedback?.comment_rendering_instance?.comments?.total_count,
  );
  const share_count = num(dig(ufi, "share_count")?.count ?? dig(ufi, "i18n_share_count"));
  const vv = dig(ufi, "video_view_count");
  const view_count = num(typeof vv === "object" ? null : vv) ?? num(dig(ufi, "play_count"));

  const reaction_breakdown: Record<string, number> = {};
  for (const e of dig(ufi, "top_reactions")?.edges ?? []) {
    const name = e?.node?.localized_name;
    const c = num(e?.reaction_count ?? e?.i18n_reaction_count);
    if (name && c !== null) reaction_breakdown[name] = c;
  }

  const image: string[] = [];
  collectImage(node.attachments, image);
  const videoNode = dig(node.attachments, "playable_url") ?? dig(node.attachments, "browser_native_hd_url");
  const hasVideo = !!dig(node.attachments, "video") || /Video/.test(JSON.stringify(node.attachments ?? "").slice(0, 4000));
  const kind = classify(node, hasVideo, unique(image), unique(external));

  const actor = (node.actors ?? [])[0] ?? dig(sections, "actors")?.[0] ?? null;
  const created_unix = node.creation_time ?? null;
  const id = node.post_id as string;
  const alias = unique([id, idFromPermalink(permalink)].filter((x): x is string => !!x));

  return {
    post_id: id,
    alias,
    permalink,
    kind,
    text,
    created_unix,
    created_at: created_unix ? new Date(created_unix * 1000).toISOString() : null,
    author_id: actor?.id ?? null,
    author_name: actor?.name ?? null,
    reaction_count,
    reaction_breakdown,
    comment_count,
    share_count,
    view_count,
    image_url: unique(image).slice(0, 40),
    video_url: typeof videoNode === "string" ? videoNode : null,
    external_url: unique(external),
    hashtag: unique(hashtag),
    mention: unique(mention),
    is_sponsored: !!node.sponsored_data,
    is_pinned: /pinned/i.test(JSON.stringify(dig(sections, "context_layout") ?? "").slice(0, 3000)),
    source: [source],
    comment: [],
  };
}

function toComment(o: Json, post_id: string, parent: string | null, depth: number): Comment | null {
  const id = o.legacy_fbid || o.id;
  const text = o.body?.text ?? o.preferred_body?.text ?? o.message?.text;
  if (!id || typeof text !== "string") return null;
  const t = o.created_time ?? o.creation_time ?? null;
  return {
    comment_id: String(id),
    post_id,
    parent_comment_id: parent,
    depth: typeof o.depth === "number" ? o.depth : depth,
    author_id: o.author?.id ?? null,
    author_name: o.author?.name ?? null,
    is_page_author: !!(o.is_author_original_poster ?? o.author_is_page_owner ?? false),
    text: sanitize(text),
    created_at: typeof t === "number" ? new Date(t * 1000).toISOString() : null,
    reaction_count: num(o.feedback?.reactors?.count ?? o.feedback?.reaction_count?.count),
    reply_count: num(o.feedback?.replies_fields?.total_count ?? o.feedback?.total_reply_count),
    permalink: o.url ?? null,
  };
}

/**
 * Walk a blob once, emitting stories, comments and page fields.
 * `context_post` attributes comments in permalink responses that have no
 * enclosing Story node.
 */
export function extractFromBlob(blob: Json, source: string, context_post: string | null = null): ExtractResult {
  const post = new Map<string, Post>();
  const comment = new Map<string, Comment>();
  const page: Partial<PageInfo> = {};
  const result: ExtractResult = { post: [], comment: [], page, cursor: null, has_next_page: null, error: [] };

  let cur_fid: string | null = null; // nearest enclosing Feedback id: which post's thread a comment belongs to
  const walk = (o: Json, post_ctx: string | null, depth: number, parent: string | null, cdepth: number): void => {
    if (!o || typeof o !== "object" || depth > MAX_DEPTH) return;
    if (!Array.isArray(o) && o.__typename === "Feedback" && typeof o.id === "string") {
      const saved = cur_fid;
      cur_fid = o.id;
      walkBody(o, post_ctx, depth, parent, cdepth);
      cur_fid = saved;
      return;
    }
    walkBody(o, post_ctx, depth, parent, cdepth);
  };
  const walkBody = (o: Json, post_ctx: string | null, depth: number, parent: string | null, cdepth: number): void => {
    if (Array.isArray(o)) {
      for (const i of o) walk(i, post_ctx, depth + 1, parent, cdepth);
      return;
    }

    if (Array.isArray(o.errors)) {
      for (const e of o.errors) result.error.push({ code: e?.code ?? null, message: String(e?.message ?? "") });
    }
    if (o.page_info && typeof o.page_info === "object" && "has_next_page" in o.page_info) {
      result.has_next_page = !!o.page_info.has_next_page;
      if (o.page_info.end_cursor) result.cursor = String(o.page_info.end_cursor);
    }

    let ctx = post_ctx;
    if (isStory(o)) {
      const p = storyToPost(o, source);
      const prev = post.get(p.post_id);
      post.set(p.post_id, prev ? mergeSparse(prev, p) : p);
      ctx = p.post_id;
    }

    // Comment nodes.
    if (o.__typename === "Comment" && ctx) {
      const c = toComment(o, ctx, parent, cdepth);
      if (c) {
        c.feedback_id = cur_fid;
        comment.set(c.comment_id, c);
        // Replies live under this comment's feedback.
        // (replies_fields / replies / replies_connection ... — Facebook renames this per query, so walk the whole feedback subtree)
        if (o.feedback && typeof o.feedback === "object") walk(o.feedback, ctx, depth + 1, c.comment_id, cdepth + 1);
        // Walk everything else except the already-handled feedback subtree.
        for (const [k, v] of Object.entries(o)) {
          if (k !== "feedback" && v && typeof v === "object") walk(v, ctx, depth + 1, parent, cdepth);
        }
        return;
      }
    }

    // Page header fields.
    if (o.__typename === "Page" || o.profile_intro_card || o.profile_tabs || o.page_likers || o.followers_count !== undefined) {
      pickPage(o, page);
    }

    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, ctx, depth + 1, parent, cdepth);
  };

  try {
    walk(blob, context_post, 0, null, 0);
  } catch {
    /* never throw from an extractor */
  }

  // Attach comments to their post.
  result.comment = [...comment.values()];
  for (const c of result.comment) post.get(c.post_id)?.comment.push(c);
  result.post = [...post.values()];
  return result;
}

function pickPage(o: Json, page: Partial<PageInfo>): void {
  if (o.profile_intro_card?.context_items?.edges) {
    for (const e of o.profile_intro_card.context_items.edges) {
      const n = e?.node;
      if (n?.profile_field_type === "category" && n.short_title?.text && page.category === undefined) page.category = n.short_title.text;
    }
    if (typeof o.name === "string" && page.name === undefined) page.name = sanitize(o.name);
    if (typeof o.id === "string" && page.page_id === undefined) page.page_id = o.id;
    if (o.profilePicLarge?.uri && page.profile_image === undefined) page.profile_image = o.profilePicLarge.uri;
  }
  const set = <K extends keyof PageInfo>(k: K, v: PageInfo[K] | null | undefined) => {
    if (v !== null && v !== undefined && v !== "" && page[k] === undefined) page[k] = v;
  };
  if (typeof o.name === "string" && (o.__typename === "Page" || o.page_likers || o.followers_count !== undefined)) {
    set("name", sanitize(o.name));
  }
  set("page_id", typeof o.id === "string" && /^\d+$/.test(o.id) && o.__typename === "Page" ? o.id : undefined);
  set("category", o.category_name ?? o.category_type);
  set("like_count", num(o.page_likers?.count));
  set("follower_count", num(o.followers_count ?? o.follower_count?.count));
  set("website", typeof o.website === "string" ? unwrapLinkShim(o.website) : undefined);
  set("phone", o.phone);
  set("address", o.single_line_address ?? o.address?.text);
  set("is_verified", typeof o.is_verified === "boolean" ? o.is_verified : undefined);
  set("profile_image", o.profilePicLarge?.uri ?? o.profile_picture?.uri);
  set("cover_image", o.cover_photo?.photo?.image?.uri);
  if (Array.isArray(o.emails) && o.emails[0]) set("email", o.emails[0]);
}

/** Merge a sparse (deferred / partial) record into a richer one — never lose a known value. */
export function mergeSparse(a: Post, b: Post): Post {
  const pick = <T>(x: T | null, y: T | null): T | null => (x !== null && x !== undefined && x !== ("" as unknown as T) ? x : y);
  const longer = (x: string, y: string) => (y.length > x.length ? y : x);
  const breakdown = { ...b.reaction_breakdown, ...a.reaction_breakdown };
  return {
    ...a,
    permalink: pick(a.permalink, b.permalink),
    kind: a.kind === "text" || a.kind === "unknown" ? b.kind : a.kind,
    text: longer(a.text, b.text),
    created_at: pick(a.created_at, b.created_at),
    created_unix: pick(a.created_unix, b.created_unix),
    author_id: pick(a.author_id, b.author_id),
    author_name: pick(a.author_name, b.author_name),
    // For counts the larger value is the fresher one (counters only grow in a scrape window).
    reaction_count: maxNullable(a.reaction_count, b.reaction_count),
    comment_count: maxNullable(a.comment_count, b.comment_count),
    share_count: maxNullable(a.share_count, b.share_count),
    view_count: maxNullable(a.view_count, b.view_count),
    reaction_breakdown: breakdown,
    image_url: unique([...a.image_url, ...b.image_url]),
    video_url: pick(a.video_url, b.video_url),
    external_url: unique([...a.external_url, ...b.external_url]),
    hashtag: unique([...a.hashtag, ...b.hashtag]),
    mention: unique([...a.mention, ...b.mention]),
    alias: unique([...a.alias, ...b.alias]),
    is_sponsored: a.is_sponsored || b.is_sponsored,
    is_pinned: a.is_pinned || b.is_pinned,
    source: unique([...a.source, ...b.source]),
    comment: mergeComment(a.comment, b.comment),
  };
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

export function mergeComment(a: Comment[], b: Comment[]): Comment[] {
  const m = new Map<string, Comment>();
  for (const c of [...a, ...b]) {
    const prev = m.get(c.comment_id);
    m.set(c.comment_id, prev ? { ...prev, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null && v !== "")) } : c);
  }
  return [...m.values()];
}

// ─── Blob sources ────────────────────────────────────────────────

/** Every `<script type="application/json">` body in a page, parsed. Bad blobs are skipped. */
export function parseScriptBlob(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!/post_id|reaction_count|timeline_list_feed_units|followers_count|page_likers|"__typename":"Comment"|profile_intro_card/.test(m[1])) continue;
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * A /api/graphql/ body: may be one JSON doc, `for (;;);`-prefixed, or several
 * newline-delimited JSON docs (incremental @defer delivery).
 */
export function parseGraphqlText(text: string): Json[] {
  const body = text.replace(/^for \(;;\);/, "").trim();
  if (!body) return [];
  try {
    return [JSON.parse(body)];
  } catch {
    const out: Json[] = [];
    for (const line of body.split(/\n+/)) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
    return out;
  }
}

/** Text-based fallback: header counts from the rendered page text ("3.2K followers"). */
export function pageCountFromText(text: string): Partial<Pick<PageInfo, "follower_count" | "like_count" | "following_count">> {
  const out: Partial<Pick<PageInfo, "follower_count" | "like_count" | "following_count">> = {};
  const f = text.match(/([\d.,]+\s*[KMB]?)\s+followers/i);
  const l = text.match(/([\d.,]+\s*[KMB]?)\s+likes\b/i);
  const g = text.match(/([\d.,]+\s*[KMB]?)\s+following/i);
  if (f) out.follower_count = parseCount(f[1]) ?? undefined;
  if (l) out.like_count = parseCount(l[1]) ?? undefined;
  if (g) out.following_count = parseCount(g[1]) ?? undefined;
  return out;
}

/** Pure parse of the rendered About sub-pages (concatenated text): contact, links, brand statements. */
export function parseAboutText(text: string): Partial<PageInfo> {
  const out: Partial<PageInfo> = {};
  const t = text.replace(/\r/g, "");
  const after = (label: RegExp, stop: RegExp): string | undefined => {
    const m = t.match(label);
    if (!m || m.index === undefined) return undefined;
    const rest = t.slice(m.index + m[0].length);
    const end = rest.search(stop);
    const v = (end === -1 ? rest : rest.slice(0, end)).trim();
    return v || undefined;
  };
  const STOP = /\n(?:Reels|Photos|Videos|Tagged photos|Albums|See all|More|Description|Our Vision|Our Mission|Bio|Phone|Email|Address|Website|Links|Contact info|Category|Details|Privacy and legal info|Creation date|Rating|Page transparency)\n/;
  const bio = after(/\nBio\n/, STOP);
  if (bio) out.bio = sanitize(bio);
  const desc = after(/\nDescription\n/, STOP);
  if (desc) out.description = sanitize(desc);
  const vision = after(/\nOur Vision\n/, STOP);
  if (vision) out.vision = sanitize(vision);
  const mission = after(/\nOur Mission\n/, STOP);
  if (mission) out.mission = sanitize(mission);
  const email = t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (email) out.email = email[0];
  const phone = t.match(/\n(\+?\d[\d\s().-]{7,}\d)\n/);
  if (phone) out.phone = phone[1].trim();
  const site = t.match(/\n((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)\nWebsite\b/i);
  if (site) out.website = site[1];
  const addr = after(/\nAddress\n/, STOP) ?? (t.match(/\n([^\n]*\d[^\n]*(?:Quezon City|Manila|Makati|Pasig|Cebu|Davao|Taguig|Mandaluyong)[^\n]*)\n/)?.[1]);
  if (addr) out.address = addr.split("\n")[0].trim();
  const created = t.match(/(?:Creation date|Page created)[^\n]*\n?\s*([A-Z][a-z]+ \d{1,2}, \d{4})/i);
  if (created) out.creation_date = created[1];
  const rating = t.match(/Rating\s*\n?\s*([\d.]+\s*\(\d[\d,]*\s*Reviews?\))/i);
  if (rating) out.rating = rating[1];
  return out;
}
