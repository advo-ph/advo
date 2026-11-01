/**
 * Dedupe ledger + convergence tracker + completeness audit.
 *
 * The ledger is the single source of truth during a scrape. Everything the
 * network, SSR and DOM layers see is `ingest()`ed; identical posts collapse via
 * alias resolution (numeric id <-> pfbid <-> permalink <-> content hash), and a
 * sparse record never overwrites a rich one.
 */

import { createHash } from "node:crypto";
import { idFromPermalink, mergeComment, mergeSparse } from "./extract.js";
import type { Comment, Post } from "./types.js";

export function contentKey(p: Pick<Post, "text" | "created_unix" | "author_id">): string {
  const norm = p.text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 400);
  // Day-bucketed so a +-1s timestamp skew between sources still collides.
  const day = p.created_unix ? Math.floor(p.created_unix / 86400) : "x";
  return "h:" + createHash("sha1").update(`${norm}|${day}|${p.author_id ?? ""}`).digest("hex").slice(0, 16);
}

export class PostLedger {
  private byId = new Map<string, Post>();
  /** alias -> canonical post_id */
  private alias = new Map<string, string>();
  private seenComment = new Set<string>();

  get size(): number {
    return this.byId.size;
  }

  private resolve(p: Post): string | null {
    const candidate = [...p.alias, idFromPermalink(p.permalink)].filter((x): x is string => !!x);
    for (const a of candidate) {
      const hit = this.alias.get(a);
      if (hit) return hit;
    }
    if (p.text.trim().length >= 12) {
      const hit = this.alias.get(contentKey(p));
      if (hit) return hit;
    }
    return null;
  }

  /** Returns true when the post is NEW to the ledger (not merely enriched). */
  ingest(p: Post): boolean {
    const existing = this.resolve(p);
    const keys = unique([...p.alias, idFromPermalink(p.permalink), p.text.trim().length >= 12 ? contentKey(p) : null]);
    if (existing) {
      const merged = mergeSparse(this.byId.get(existing)!, p);
      this.byId.set(existing, merged);
      for (const k of keys) this.alias.set(k, existing);
      return false;
    }
    this.byId.set(p.post_id, p);
    for (const k of keys) this.alias.set(k, p.post_id);
    return true;
  }

  /** Attach loose comments to a post; returns how many were new. */
  ingestComment(post_id: string, comment: Comment[]): number {
    const canon = this.alias.get(post_id) ?? post_id;
    const p = this.byId.get(canon);
    if (!p) return 0;
    let added = 0;
    for (const c of comment) {
      const key = `${canon}:${c.comment_id}`;
      if (!this.seenComment.has(key)) {
        this.seenComment.add(key);
        added++;
      }
    }
    p.comment = mergeComment(p.comment, comment.map((c) => ({ ...c, post_id: canon })));
    return added;
  }

  get(id: string): Post | undefined {
    return this.byId.get(this.alias.get(id) ?? id);
  }

  all(): Post[] {
    return [...this.byId.values()].sort((a, b) => (b.created_unix ?? 0) - (a.created_unix ?? 0));
  }

  /** Restore from a checkpoint. */
  load(post: Post[]): void {
    for (const p of post) {
      this.ingest(p);
      for (const c of p.comment) this.seenComment.add(`${p.post_id}:${c.comment_id}`);
    }
  }
}

function unique<T>(a: (T | null | undefined)[]): T[] {
  return [...new Set(a.filter((x): x is T => x !== null && x !== undefined))];
}

/**
 * Stops the scroll loop on CONVERGENCE, not on a fixed count: N consecutive
 * rounds that add nothing new, or the pagination cursor reporting exhaustion,
 * or a hard cap (round / wall-clock / post budget).
 */
export class Convergence {
  private dry = 0;
  rounds = 0;
  private started = Date.now();
  constructor(
    private opt: { patience: number; max_round: number; max_ms: number; max_post: number },
  ) {}

  record(new_post: number, size: number, has_next_page: boolean | null): { stop: boolean; reason: string | null } {
    this.rounds++;
    this.dry = new_post > 0 ? 0 : this.dry + 1;
    if (size >= this.opt.max_post) return { stop: true, reason: "post-budget" };
    if (this.rounds >= this.opt.max_round) return { stop: true, reason: "round-cap" };
    if (Date.now() - this.started > this.opt.max_ms) return { stop: true, reason: "time-cap" };
    if (has_next_page === false && this.dry >= 2) return { stop: true, reason: "cursor-exhausted" };
    if (this.dry >= this.opt.patience) return { stop: true, reason: "converged" };
    return { stop: false, reason: null };
  }
}

export interface AuditCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Acceptance gate. Capture completeness is MEASURED, never assumed. Every
 * check is falsifiable; `ok` is true only when all pass.
 */
export function audit(
  post: Post[],
  ctx: { follower_count: number | null; stop_reason: string | null; login_ok: boolean; rate_limited: boolean; round: number },
): { ok: boolean; check: AuditCheck[] } {
  const check: AuditCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => check.push({ name, ok, detail });

  add("authenticated", ctx.login_ok, ctx.login_ok ? "viewer id present" : "logged out: FB serves a login wall + ~1 post");
  add("no-rate-limit", !ctx.rate_limited, ctx.rate_limited ? "GraphQL code 1675004 seen" : "none");
  add("nonempty", post.length > 0, `${post.length} post`);

  const ids = post.map((p) => p.post_id);
  add("unique-id", new Set(ids).size === ids.length, `${new Set(ids).size}/${ids.length}`);

  const content = post.filter((p) => p.text.trim().length >= 12).map(contentKey);
  add("no-content-duplicate", new Set(content).size === content.length, `${new Set(content).size}/${content.length} distinct`);

  const dated = post.filter((p) => p.created_unix).length;
  add("dated", dated === post.length, `${dated}/${post.length} have a timestamp`);

  const counted = post.filter((p) => p.reaction_count !== null && p.comment_count !== null).length;
  add("engagement-present", post.length > 0 && counted / post.length >= 0.9, `${counted}/${post.length} have reaction+comment counts`);

  // Comment completeness: captured vs FB's own counter. FB's counter includes
  // comments it refuses to render, so this is advisory (<=) not equality.
  const withComment = post.filter((p) => (p.comment_count ?? 0) > 0);
  const covered = withComment.filter((p) => p.comment.length > 0).length;
  add(
    "comment-coverage",
    withComment.length === 0 || covered / withComment.length >= 0.8,
    `${covered}/${withComment.length} commented posts have >=1 comment captured`,
  );
  const over = post.filter((p) => p.comment_count !== null && p.comment.length > p.comment_count + 2);
  add("comment-not-overcount", over.length === 0, over.length ? `${over.length} post exceed FB counter` : "ok");

  const chrono = post.every((p, i) => i === 0 || (post[i - 1].created_unix ?? 0) >= (p.created_unix ?? 0) || p.is_pinned);
  add("chronological", chrono, chrono ? "newest-first" : "ordering broken");

  add("converged", ["converged", "cursor-exhausted", "checkpoint"].includes(ctx.stop_reason ?? ""), `stop=${ctx.stop_reason ?? "—"} after ${ctx.round} round`);

  return { ok: check.every((c) => c.ok), check };
}
