/**
 * Brand-marketing analysis over a captured post set. Pure + deterministic:
 * every figure is computed from the data, nothing is estimated by a model.
 */

import type { PageInfo, Post } from "./types.js";

export interface Analysis {
  window: { first: string | null; last: string | null; day: number };
  total: { post: number; reaction: number; comment: number; share: number; view: number };
  cadence: { post_per_week: number; longest_gap_day: number; by_month: Record<string, number> };
  engagement: {
    mean_per_post: number;
    median_per_post: number;
    rate_vs_follower_pct: number | null;
    top_post: { post_id: string; permalink: string | null; score: number; text: string }[];
    bottom_post: { post_id: string; score: number; text: string }[];
  };
  format: Record<string, { post: number; mean_score: number }>;
  timing: { best_weekday: string | null; best_hour: number | null; by_weekday: Record<string, number>; by_hour: Record<number, number> };
  caption: { mean_length: number; with_hashtag_pct: number; with_link_pct: number; with_cta_pct: number; emoji_post_pct: number; top_hashtag: [string, number][] };
  language: { tagalog_pct: number };
  reaction_mix: Record<string, number>;
  comment: { captured: number; page_reply: number; unique_commenter: number; top_commenter: [string, number][] };
  sponsored: number;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CTA = /\b(contact|message us|dm us|inquire|inquiry|call|book|visit|learn more|sign up|register|get a quote|request|order now|shop|download|email us|reach out|whatsapp|m\.me)\b/i;
const TAGALOG = /\b(ang|ng|mga|sa|na|ay|po|namin|natin|para|kayo|ito|yung|hindi|salamat|kami)\b/gi;
const EMOJI = /\p{Extended_Pictographic}/u;

/** Weighted engagement: a comment signals more intent than a like; a share more than a comment. */
export function score(p: Post): number {
  return (p.reaction_count ?? 0) + 3 * (p.comment_count ?? 0) + 5 * (p.share_count ?? 0);
}

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function analyze(post: Post[], page: Partial<PageInfo>): Analysis {
  const dated = post.filter((p) => p.created_unix).sort((a, b) => a.created_unix! - b.created_unix!);
  const first = dated[0]?.created_unix ?? null;
  const last = dated[dated.length - 1]?.created_unix ?? null;
  const day = first && last ? Math.max(1, Math.round((last - first) / 86400)) : 0;

  const sc = post.map(score);
  const gap: number[] = [];
  for (let i = 1; i < dated.length; i++) gap.push((dated[i].created_unix! - dated[i - 1].created_unix!) / 86400);
  const by_month: Record<string, number> = {};
  for (const p of dated) by_month[p.created_at!.slice(0, 7)] = (by_month[p.created_at!.slice(0, 7)] ?? 0) + 1;

  const ranked = [...post].sort((a, b) => score(b) - score(a));
  /** Cut on whole code points: a UTF-16 slice can split a surrogate pair, which Postgres jsonb rejects. */
  const snip = (t: string) => Array.from(t.replace(/\s+/g, " ")).slice(0, 140).join("");

  const format: Analysis["format"] = {};
  for (const k of new Set(post.map((p) => p.kind))) {
    const g = post.filter((p) => p.kind === k);
    format[k] = { post: g.length, mean_score: r1(mean(g.map(score))) };
  }

  const wd: Record<string, number[]> = {};
  const hr: Record<number, number[]> = {};
  for (const p of dated) {
    // Philippine time (UTC+8) — the audience clock for a PH brand.
    const d = new Date((p.created_unix! + 8 * 3600) * 1000);
    (wd[DAY[d.getUTCDay()]] ??= []).push(score(p));
    (hr[d.getUTCHours()] ??= []).push(score(p));
  }
  const by_weekday = Object.fromEntries(Object.entries(wd).map(([k, v]) => [k, r1(mean(v))]));
  const by_hour = Object.fromEntries(Object.entries(hr).map(([k, v]) => [Number(k), r1(mean(v))])) as Record<number, number>;
  const bestOf = <T extends string | number>(o: Record<T, number>) =>
    (Object.entries(o) as [T, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const tagCount = new Map<string, number>();
  for (const p of post) for (const h of p.hashtag) tagCount.set(h, (tagCount.get(h) ?? 0) + 1);

  const mix: Record<string, number> = {};
  for (const p of post) for (const [k, v] of Object.entries(p.reaction_breakdown)) mix[k] = (mix[k] ?? 0) + v;

  const comment = post.flatMap((p) => p.comment);
  const who = new Map<string, number>();
  for (const c of comment) if (c.author_name && !c.is_page_author) who.set(c.author_name, (who.get(c.author_name) ?? 0) + 1);

  const withText = post.filter((p) => p.text.trim());
  const tagalog = withText.filter((p) => (p.text.match(TAGALOG) ?? []).length >= 3).length;

  const follower = page.follower_count ?? page.like_count ?? null;
  return {
    window: { first: first ? new Date(first * 1000).toISOString() : null, last: last ? new Date(last * 1000).toISOString() : null, day },
    total: {
      post: post.length,
      reaction: post.reduce((s, p) => s + (p.reaction_count ?? 0), 0),
      comment: post.reduce((s, p) => s + (p.comment_count ?? 0), 0),
      share: post.reduce((s, p) => s + (p.share_count ?? 0), 0),
      view: post.reduce((s, p) => s + (p.view_count ?? 0), 0),
    },
    cadence: { post_per_week: day ? r1((post.length / day) * 7) : 0, longest_gap_day: r1(Math.max(0, ...gap)), by_month },
    engagement: {
      mean_per_post: r1(mean(sc)),
      median_per_post: r1(median(sc)),
      rate_vs_follower_pct: follower ? Math.round((10000 * mean(post.map((p) => (p.reaction_count ?? 0) + (p.comment_count ?? 0) + (p.share_count ?? 0)))) / follower) / 100 : null,
      top_post: ranked.slice(0, 5).map((p) => ({ post_id: p.post_id, permalink: p.permalink, score: score(p), text: snip(p.text) })),
      bottom_post: ranked.slice(-3).reverse().map((p) => ({ post_id: p.post_id, score: score(p), text: snip(p.text) })),
    },
    format,
    timing: { best_weekday: (bestOf(by_weekday) as string | null), best_hour: (bestOf(by_hour) as number | null), by_weekday, by_hour },
    caption: {
      mean_length: Math.round(mean(post.map((p) => p.text.length))),
      with_hashtag_pct: pct(post.filter((p) => p.hashtag.length).length, post.length),
      with_link_pct: pct(post.filter((p) => p.external_url.length).length, post.length),
      with_cta_pct: pct(post.filter((p) => CTA.test(p.text)).length, post.length),
      emoji_post_pct: pct(post.filter((p) => EMOJI.test(p.text)).length, post.length),
      top_hashtag: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    },
    language: { tagalog_pct: pct(tagalog, withText.length) },
    reaction_mix: mix,
    comment: {
      captured: comment.length,
      page_reply: comment.filter((c) => c.is_page_author).length,
      unique_commenter: who.size,
      top_commenter: [...who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    },
    sponsored: post.filter((p) => p.is_sponsored).length,
  };
}
