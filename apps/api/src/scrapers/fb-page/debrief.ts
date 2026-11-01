/** Render the brand debrief as markdown. Every figure comes from `analyze()`; unmeasured => "—". */
import type { Analysis } from "./analyze.js";
import type { AuditCheck } from "./ledger.js";
import type { PageInfo, Post } from "./types.js";

const v = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : String(x));

export function debrief(
  url: string, page: Partial<PageInfo>, a: Analysis, post: Post[],
  au: { ok: boolean; check: AuditCheck[] }, stat: Record<string, unknown>,
): string {
  const L: string[] = [];
  L.push(`# ${v(page.name)} — Facebook page debrief`, "", `Source: ${url}`, `Scraped: ${new Date().toISOString()}`, "");
  L.push(`## Capture status: ${au.ok ? "PASS" : "INCOMPLETE"}`, "", "| check | ok | detail |", "|---|---|---|");
  for (const c of au.check) L.push(`| ${c.name} | ${c.ok ? "yes" : "**NO**"} | ${c.detail} |`);
  L.push("", `Layers: ${Object.entries(stat).map(([k, x]) => `${k}=${v(x)}`).join(", ")}`, "");
  if (!au.ok) L.push("> Figures below describe only what was captured. Do not read them as the whole page until every check passes.", "");

  L.push("## Page", "", "| field | value |", "|---|---|");
  for (const [k, x] of [
    ["category", page.category], ["followers", page.follower_count], ["likes", page.like_count], ["website", page.website],
    ["phone", page.phone], ["email", page.email], ["address", page.address], ["verified", page.is_verified],
  ] as const) L.push(`| ${k} | ${v(x)} |`);

  L.push("", "## Volume", "", "| measure | value |", "|---|---|",
    `| posts captured | ${a.total.post} |`, `| window | ${v(a.window.first?.slice(0, 10))} → ${v(a.window.last?.slice(0, 10))} (${a.window.day} d) |`,
    `| posts / week | ${a.cadence.post_per_week} |`, `| longest silence | ${a.cadence.longest_gap_day} d |`,
    `| reactions / comments / shares | ${a.total.reaction} / ${a.total.comment} / ${a.total.share} |`,
    `| mean / median score per post | ${a.engagement.mean_per_post} / ${a.engagement.median_per_post} |`,
    `| engagement rate vs followers | ${v(a.engagement.rate_vs_follower_pct)}% |`);

  L.push("", "## Format performance", "", "| format | posts | mean score |", "|---|---|---|");
  for (const [k, x] of Object.entries(a.format).sort((p, q) => q[1].mean_score - p[1].mean_score)) L.push(`| ${k} | ${x.post} | ${x.mean_score} |`);

  L.push("", "## Timing (Asia/Manila)", "", `Best weekday: ${v(a.timing.best_weekday)} · best hour: ${v(a.timing.best_hour)}:00`, "");
  L.push("## Caption craft", "", "| measure | value |", "|---|---|",
    `| mean length | ${a.caption.mean_length} chars |`, `| with hashtag | ${a.caption.with_hashtag_pct}% |`,
    `| with link | ${a.caption.with_link_pct}% |`, `| with CTA | ${a.caption.with_cta_pct}% |`,
    `| emoji | ${a.caption.emoji_post_pct}% |`, `| Tagalog/Taglish | ${a.language.tagalog_pct}% |`,
    `| top hashtags | ${a.caption.top_hashtag.map(([t, n]) => `#${t}(${n})`).join(" ") || "—"} |`);

  L.push("", "## Top posts", "");
  a.engagement.top_post.forEach((p, i) => L.push(`${i + 1}. score ${p.score} — ${p.text}${p.permalink ? ` (${p.permalink})` : ""}`));
  L.push("", "## Community", "", `Comments captured: ${a.comment.captured} · page replies: ${a.comment.page_reply} · unique commenters: ${a.comment.unique_commenter}`);
  if (a.comment.top_commenter.length) L.push("", `Top commenters: ${a.comment.top_commenter.map(([n, c]) => `${n}(${c})`).join(", ")}`);
  L.push("", "## Reaction mix", "", Object.entries(a.reaction_mix).map(([k, n]) => `${k}: ${n}`).join(" · ") || "—", "");
  L.push("## Post ledger", "", "| date | kind | react | cmt | share | caption |", "|---|---|---|---|---|---|");
  for (const p of post) L.push(`| ${v(p.created_at?.slice(0, 10))} | ${p.kind} | ${v(p.reaction_count)} | ${v(p.comment_count)} | ${v(p.share_count)} | ${p.text.replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 80)} |`);
  return L.join("\n") + "\n";
}
