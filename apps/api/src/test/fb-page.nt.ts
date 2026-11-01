import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractFromBlob, parseAboutText, parseCount, parseGraphqlText, idFromPermalink, pageCountFromText } from "../scrapers/fb-page/extract.js";
import { PostLedger, Convergence, audit, contentKey } from "../scrapers/fb-page/ledger.js";
import { analyze, score } from "../scrapers/fb-page/analyze.js";
import { makeBudget, coolDownMs } from "../scrapers/fb-page/pace.js";

const here = dirname(fileURLToPath(import.meta.url));
// A real captured SSR blob. It holds third-party names, and this repo is public, so the fixture is
// git-ignored: those tests run where it exists and skip elsewhere.
const fixture_path = join(here, "fixture/fb-page-exquis-ssr.json");
const has_fixture = existsSync(fixture_path);
const blob = has_fixture ? JSON.parse(readFileSync(fixture_path, "utf8")) : {};
const fixture_test = (name: string, fn: () => void) => test(name, { skip: !has_fixture }, fn);

fixture_test("extracts the real SSR story with exact counts", () => {
  const r = extractFromBlob(blob, "ssr");
  assert.equal(r.post.length, 1);
  const p = r.post[0];
  assert.equal(p.post_id, "1624022113072155");
  assert.equal(p.reaction_count, 6);
  assert.equal(p.comment_count, 1);
  assert.equal(p.share_count, 4);
  assert.equal(p.reaction_breakdown.Like, 5);
  assert.equal(p.kind, "album");
  assert.ok(p.hashtag.includes("exquisengineering"));
  assert.ok(p.external_url.some((u) => u.includes("exquisph.com")));
  assert.ok(p.permalink?.includes("pfbid"));
  assert.ok(p.alias.some((a) => a.startsWith("pfbid")));
  assert.ok(p.created_at?.startsWith("2026-"));
});

fixture_test("does not treat action_link sub-objects with post_id as posts", () => {
  assert.equal(extractFromBlob(blob, "ssr").post.length, 1);
});

test("never throws on junk", () => {
  for (const j of [null, 1, "x", [], {}, [[[]]], { post_id: "1" }]) assert.doesNotThrow(() => extractFromBlob(j, "ssr"));
});

test("parseCount", () => {
  assert.equal(parseCount("3.2K"), 3200);
  assert.equal(parseCount("1,204"), 1204);
  assert.equal(parseCount("1.5M"), 1500000);
  assert.equal(parseCount("abc"), null);
});

test("graphql text: prefix, ndjson, rate-limit surfaced", () => {
  assert.equal(parseGraphqlText('for (;;);{"a":1}').length, 1);
  assert.equal(parseGraphqlText('{"a":1}\n{"b":2}').length, 2);
  const r = extractFromBlob(JSON.parse('{"errors":[{"message":"Rate limit exceeded","code":1675004}]}'), "graphql");
  assert.equal(r.error[0].code, 1675004);
});

test("permalink id parsing", () => {
  assert.equal(idFromPermalink("https://www.facebook.com/X/posts/pfbid0abc123"), "pfbid0abc123");
  assert.equal(idFromPermalink("https://www.facebook.com/X/posts/123456789"), "123456789");
  assert.equal(idFromPermalink("https://www.facebook.com/photo.php?fbid=1624019956405704&set=a.1"), "1624019956405704");
  assert.equal(idFromPermalink(null), null);
});

test("header counts from text", () => {
  const c = pageCountFromText("Exquis\n3.2K followers • 12 following");
  assert.equal(c.follower_count, 3200);
  assert.equal(c.following_count, 12);
});

fixture_test("ledger collapses the same post seen under numeric id, pfbid and as a DOM stub", () => {
  const p = extractFromBlob(blob, "ssr").post[0];
  const l = new PostLedger();
  assert.equal(l.ingest(p), true);
  const viaPfbid = { ...p, post_id: p.alias.find((a) => a.startsWith("pfbid"))!, alias: [p.alias.find((a) => a.startsWith("pfbid"))!], source: ["dom"], reaction_count: null };
  assert.equal(l.ingest(viaPfbid), false);
  const stub = { ...p, post_id: "zzz", alias: ["zzz"], permalink: null, text: p.text, reaction_count: 9 };
  assert.equal(l.ingest(stub), false); // content-hash collision
  assert.equal(l.size, 1);
  assert.equal(l.all()[0].reaction_count, 9); // richer/larger count wins, nothing lost
  assert.equal(l.all()[0].share_count, 4);
});

fixture_test("ledger comment dedupe is idempotent", () => {
  const p = extractFromBlob(blob, "ssr").post[0];
  const l = new PostLedger();
  l.ingest(p);
  const c = { comment_id: "c1", post_id: p.post_id, parent_comment_id: null, depth: 0, author_id: "1", author_name: "A", is_page_author: false, text: "hi", created_at: null, reaction_count: 0, reply_count: 0, permalink: null };
  assert.equal(l.ingestComment(p.post_id, [c]), 1);
  assert.equal(l.ingestComment(p.post_id, [c]), 0);
  assert.equal(l.get(p.post_id)!.comment.length, 1);
});

test("contentKey tolerates +-1s skew and whitespace", () => {
  const a = { text: "Hello  World long enough", created_unix: 1_700_000_000, author_id: "1" };
  assert.equal(contentKey(a), contentKey({ ...a, text: "hello world long enough", created_unix: 1_700_000_001 }));
});

test("convergence stops on dry rounds, cursor exhaustion and caps", () => {
  const c = new Convergence({ patience: 3, max_round: 50, max_ms: 1e9, max_post: 100 });
  assert.equal(c.record(5, 5, true).stop, false);
  assert.equal(c.record(0, 5, true).stop, false);
  assert.equal(c.record(0, 5, true).stop, false);
  assert.equal(c.record(0, 5, true).reason, "converged");
  const d = new Convergence({ patience: 9, max_round: 50, max_ms: 1e9, max_post: 100 });
  d.record(0, 1, false);
  assert.equal(d.record(0, 1, false).reason, "cursor-exhausted");
  assert.equal(new Convergence({ patience: 9, max_round: 50, max_ms: 1e9, max_post: 3 }).record(3, 3, true).reason, "post-budget");
});

fixture_test("audit refuses a logged-out capture", () => {
  const post = extractFromBlob(blob, "ssr").post;
  const a = audit(post, { follower_count: null, stop_reason: "logged-out", login_ok: false, rate_limited: true, round: 0 });
  assert.equal(a.ok, false);
  assert.ok(a.check.find((c) => c.name === "authenticated" && !c.ok));
  assert.ok(a.check.find((c) => c.name === "no-rate-limit" && !c.ok));
});

fixture_test("audit passes a clean converged capture", () => {
  const post = extractFromBlob(blob, "ssr").post;
  post[0].comment = [{ comment_id: "c", post_id: post[0].post_id, parent_comment_id: null, depth: 0, author_id: null, author_name: "x", is_page_author: false, text: "t", created_at: null, reaction_count: null, reply_count: null, permalink: null }];
  assert.equal(audit(post, { follower_count: 3280, stop_reason: "converged", login_ok: true, rate_limited: false, round: 9 }).ok, true);
});

fixture_test("analysis is deterministic and sane", () => {
  const post = extractFromBlob(blob, "ssr").post;
  const a = analyze(post, { follower_count: 3280 });
  assert.equal(a.total.post, 1);
  assert.equal(score(post[0]), 6 + 3 + 20);
  assert.equal(a.engagement.rate_vs_follower_pct, Math.round((10000 * 11) / 3280) / 100);
  assert.ok(a.caption.with_hashtag_pct === 100);
});

test("budget blocks past the hourly ceiling then releases", () => {
  let t = 0;
  const b = makeBudget(2, () => t);
  b.take(); b.take();
  assert.ok(b.wait_ms() > 0);
  t = 3_600_001;
  assert.equal(b.wait_ms(), 0);
  assert.equal(coolDownMs(3), 240_000);
});

test("About parser reads real contact / links / brand-statement text", () => {
  const text = "\nBio\nEnd-to-end engineering.\nPhone\n+63 900 000 0000\nMobile\nEmail\nsales@example.com\nEmail\nLinks\nexample.com\nWebsite\nDescription\nA trusted partner.\nOur Vision\nTo revolutionize.\nOur Mission\nDeliver expert solutions\n";
  const a = parseAboutText(text);
  assert.equal(a.phone, "+63 900 000 0000");
  assert.equal(a.email, "sales@example.com");
  assert.equal(a.website, "example.com");
  assert.equal(a.bio, "End-to-end engineering.");
  assert.equal(a.description, "A trusted partner.");
  assert.equal(a.vision, "To revolutionize.");
  assert.equal(a.mission, "Deliver expert solutions");
});

test("feedback counts are read from adaptive_ufi_action_renderers (paginated shape)", () => {
  const node = { __typename: "Story", post_id: "9", creation_time: 1700000000, comet_sections: { feedback: { story: { feedback_context: { r: { comet_ufi_summary_and_actions_renderer: { feedback: { adaptive_ufi_action_renderers: [
    { feedback: { reaction_count: { count: 4 }, top_reactions: { edges: [{ node: { localized_name: "Love" }, reaction_count: 4 }] } } },
    { feedback: { comment_rendering_instance: { comments: { total_count: 0 } } } },
    { feedback: { share_count: { count: 7 } } },
  ] } } } } } } } };
  const p = extractFromBlob({ data: node }, "graphql").post[0];
  assert.equal(p.reaction_count, 4);
  assert.equal(p.comment_count, 0);
  assert.equal(p.share_count, 7);
  assert.equal(p.reaction_breakdown.Love, 4);
});

test("comments carry the id of the Feedback thread they came from (reel-viewer neighbour guard)", () => {
  const c = (id: string, text: string) => ({ __typename: "Comment", legacy_fbid: id, body: { text }, author: { id: "1", name: "A" } });
  const blob = { data: [
    { __typename: "Feedback", id: "fb-own", comments: { edges: [{ node: c("11", "mine") }] } },
    { __typename: "Feedback", id: "fb-next-reel", comments: { edges: [{ node: c("22", "neighbour") }] } },
  ] };
  const r = extractFromBlob(blob, "graphql", "post-1");
  const by = Object.fromEntries(r.comment.map((x) => [x.comment_id, x.feedback_id]));
  assert.equal(by["11"], "fb-own");
  assert.equal(by["22"], "fb-next-reel");
});

test("replies are captured whatever key Facebook nests them under (replies_connection)", () => {
  const c = (id: string, text: string, extra: object = {}) => ({ __typename: "Comment", legacy_fbid: id, body: { text }, author: { id: "1", name: "A" }, ...extra });
  const blob = { data: { __typename: "Feedback", id: "fb-own", comments: { edges: [{ node: c("11", "parent", { feedback: { replies_connection: { edges: [{ node: c("12", "child", { depth: 1 }) }] } } }) }] } } };
  const r = extractFromBlob(blob, "permalink", "post-1");
  const child = r.comment.find((x) => x.comment_id === "12");
  assert.ok(child, "reply captured");
  assert.equal(child!.depth, 1);
  assert.equal(child!.parent_comment_id, "11");
});
