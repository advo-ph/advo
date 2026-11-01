/**
 * Persist a Facebook page scrape (scrapers/fb-page) into Postgres — migration 062.
 *
 * Invariants (each asserted in src/test/fb-page-store.test.ts):
 *   1. IDEMPOTENT — importing the same run twice adds no post, no comment, no snapshot.
 *   2. NEVER ERASE — upserts COALESCE(new, old); a run that missed a field cannot null it.
 *   3. COUNTS GROW MONOTONICALLY WITHIN A RUN, are TIME SERIES ACROSS RUNS — the latest value
 *      lives on fb_post, every run appends one fb_post_snapshot per post.
 *   4. ONE TRANSACTION — a failed import leaves nothing half-written.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { fbComment, fbPage, fbPost, fbPostSnapshot, fbScrapeRun } from "../db/schema.js";
import type { Analysis } from "../scrapers/fb-page/analyze.js";
import { sanitize } from "../scrapers/fb-page/extract.js";
import { pageSlug } from "../scrapers/fb-page/collect.js";
import type { AuditCheck } from "../scrapers/fb-page/ledger.js";
import type { PageInfo, Post } from "../scrapers/fb-page/types.js";

export interface PersistInput {
  url: string;
  page: Partial<PageInfo>;
  post: Post[];
  analysis: Analysis;
  audit: { ok: boolean; check: AuditCheck[] };
  stat: Record<string, unknown>;
  scraped_by?: number | null;
  client_id?: number | null;
}

/** Deep-sanitize every string (lone surrogates / control chars make Postgres reject json/text). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clean = <T>(v: T): T => (typeof v === "string" ? (sanitize(v) as any) : Array.isArray(v) ? (v.map(clean) as any) : v && typeof v === "object" ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) as any) : v);

const CHUNK = 200;
const chunk = <T>(a: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function status(i: PersistInput): string {
  const stop = String(i.stat.stop ?? "");
  if (stop === "logged-out") return "logged_out";
  if (stop === "rate-limited") return "rate_limited";
  return i.audit.ok ? "ok" : "partial";
}

export async function persistRun(raw: PersistInput): Promise<{ fb_page_id: number; fb_scrape_run_id: number; post: number; comment: number }> {
  const i = clean(raw);
  const slug = pageSlug(i.url);
  const page_code = i.page.page_id || slug;
  if (!page_code) throw new Error("cannot derive a page_code from the URL or page info");

  return db().transaction(async (tx) => {
    const p = i.page;
    const pageValue = {
      pageCode: page_code, slug: slug || null, name: p.name ?? null, category: p.category ?? null,
      description: p.description ?? null, bio: p.bio ?? null, vision: p.vision ?? null, mission: p.mission ?? null,
      website: p.website ?? null, phone: p.phone ?? null, email: p.email ?? null, address: p.address ?? null,
      hour: p.hour ?? null, rating: p.rating ?? null, creationDate: p.creation_date ?? null,
      followerCount: p.follower_count ?? null, likeCount: p.like_count ?? null, followingCount: p.following_count ?? null,
      isVerified: p.is_verified ?? null, profileImage: p.profile_image ?? null, coverImage: p.cover_image ?? null,
      clientId: i.client_id ?? null,
    };
    const [page] = await tx
      .insert(fbPage)
      .values(pageValue)
      .onConflictDoUpdate({
        target: fbPage.pageCode,
        set: Object.fromEntries(
          Object.entries(fbPage).filter(([k]) => k in pageValue && k !== "pageCode").map(([k, col]) => [k, sql`coalesce(excluded.${sql.raw((col as { name: string }).name)}, ${col as never})`]),
        ) as never,
      })
      .returning({ id: fbPage.fbPageId });
    await tx.update(fbPage).set({ updatedAt: sql`now()` }).where(eq(fbPage.fbPageId, page.id));

    const comment_total = i.post.reduce((s, x) => s + x.comment.length, 0);
    const [run] = await tx
      .insert(fbScrapeRun)
      .values({
        fbPageId: page.id, sourceUrl: i.url, status: status(i), stopReason: (i.stat.stop as string) ?? null,
        isAuditOk: i.audit.ok, postCount: i.post.length, commentCount: comment_total,
        audit: i.audit, stat: i.stat, analysis: i.analysis, scrapedBy: i.scraped_by ?? null,
      })
      .returning({ id: fbScrapeRun.fbScrapeRunId });

    for (const part of chunk(i.post)) {
      const rows = part.map((x) => ({
        fbPageId: page.id, postCode: x.post_id, alias: x.alias, permalink: x.permalink, kind: x.kind, caption: x.text,
        postedAt: x.created_at ? new Date(x.created_at) : null, authorCode: x.author_id, authorName: x.author_name,
        reactionCount: x.reaction_count, reactionBreakdown: x.reaction_breakdown, commentCount: x.comment_count,
        shareCount: x.share_count, viewCount: x.view_count, imageUrl: x.image_url, videoUrl: x.video_url,
        externalUrl: x.external_url, hashtag: x.hashtag, mention: x.mention, isSponsored: x.is_sponsored,
        isPinned: x.is_pinned, source: x.source, lastFbScrapeRunId: run.id,
      }));
      const saved = await tx
        .insert(fbPost)
        .values(rows)
        .onConflictDoUpdate({
          target: [fbPost.fbPageId, fbPost.postCode],
          set: {
            alias: sql`excluded.alias`, permalink: sql`coalesce(excluded.permalink, ${fbPost.permalink})`, kind: sql`excluded.kind`,
            // never replace a caption with a shorter/empty one
            caption: sql`case when length(excluded.caption) >= length(${fbPost.caption}) then excluded.caption else ${fbPost.caption} end`,
            postedAt: sql`coalesce(excluded.posted_at, ${fbPost.postedAt})`,
            authorCode: sql`coalesce(excluded.author_code, ${fbPost.authorCode})`,
            authorName: sql`coalesce(excluded.author_name, ${fbPost.authorName})`,
            reactionCount: sql`coalesce(excluded.reaction_count, ${fbPost.reactionCount})`,
            reactionBreakdown: sql`case when excluded.reaction_breakdown = '{}'::jsonb then ${fbPost.reactionBreakdown} else excluded.reaction_breakdown end`,
            commentCount: sql`coalesce(excluded.comment_count, ${fbPost.commentCount})`,
            shareCount: sql`coalesce(excluded.share_count, ${fbPost.shareCount})`,
            viewCount: sql`coalesce(excluded.view_count, ${fbPost.viewCount})`,
            imageUrl: sql`excluded.image_url`, videoUrl: sql`coalesce(excluded.video_url, ${fbPost.videoUrl})`,
            externalUrl: sql`excluded.external_url`, hashtag: sql`excluded.hashtag`, mention: sql`excluded.mention`,
            isSponsored: sql`excluded.is_sponsored or ${fbPost.isSponsored}`, isPinned: sql`excluded.is_pinned`,
            source: sql`excluded.source`, lastFbScrapeRunId: run.id, updatedAt: sql`now()`,
          },
        })
        .returning({ id: fbPost.fbPostId, code: fbPost.postCode });
      const id_of = new Map(saved.map((r) => [r.code, r.id]));

      await tx
        .insert(fbPostSnapshot)
        .values(part.map((x) => ({
          fbPostId: id_of.get(x.post_id)!, fbScrapeRunId: run.id, reactionCount: x.reaction_count,
          commentCount: x.comment_count, shareCount: x.share_count, viewCount: x.view_count,
        })))
        .onConflictDoNothing();

      const comment_row = part.flatMap((x) =>
        x.comment.map((c) => ({
          fbPostId: id_of.get(x.post_id)!, commentCode: c.comment_id, parentCommentCode: c.parent_comment_id,
          depth: c.depth, authorCode: c.author_id, authorName: c.author_name, isPageAuthor: c.is_page_author,
          body: c.text, commentedAt: c.created_at ? new Date(c.created_at) : null,
          reactionCount: c.reaction_count, replyCount: c.reply_count, permalink: c.permalink,
        })),
      );
      for (const cpart of chunk(comment_row)) {
        await tx
          .insert(fbComment)
          .values(cpart)
          .onConflictDoUpdate({
            target: [fbComment.fbPostId, fbComment.commentCode],
            set: {
              body: sql`excluded.body`, depth: sql`excluded.depth`,
              parentCommentCode: sql`coalesce(excluded.parent_comment_code, ${fbComment.parentCommentCode})`,
              authorName: sql`coalesce(excluded.author_name, ${fbComment.authorName})`,
              reactionCount: sql`coalesce(excluded.reaction_count, ${fbComment.reactionCount})`,
              replyCount: sql`coalesce(excluded.reply_count, ${fbComment.replyCount})`, updatedAt: sql`now()`,
            },
          });
      }
    }
    return { fb_page_id: page.id, fb_scrape_run_id: run.id, post: i.post.length, comment: comment_total };
  });
}
