/**
 * DB-backed: needs a Postgres with migration 062 applied (DATABASE_URL). Skips otherwise.
 * Uses a throwaway page_code and deletes it (CASCADE) afterwards.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { closeDb, db, initDb } from "../db/connection.js";
import { loadEnv } from "../utils/env.js";
import { persistRun } from "../services/fb-page-store.service.js";
import { analyze } from "../scrapers/fb-page/analyze.js";
import { audit } from "../scrapers/fb-page/ledger.js";
import { extractFromBlob } from "../scrapers/fb-page/extract.js";

const here = dirname(fileURLToPath(import.meta.url));
const SLUG = "fbtest" + Date.now();
let ready = false;

before(async () => {
  // loadEnv() exits the process on a missing env, so skip cleanly where there is no DB config at all.
  if (!process.env.DATABASE_URL && !existsSync(join(process.cwd(), ".env"))) return;
  try {
    loadEnv();
    initDb();
    await db().execute(sql`select 1 from fb_post_snapshot limit 1`);
    ready = true;
  } catch (e) { console.error("store test not ready:", (e as Error).message); }
});
after(async () => {
  if (ready) await db().execute(sql`delete from fb_page where page_code = ${SLUG}`);
  await closeDb().catch(() => {});
});

function input() {
  const post = extractFromBlob(JSON.parse(readFileSync(join(here, "fixture/fb-page-exquis-ssr.json"), "utf8")), "ssr").post;
  post[0].comment = [{ comment_id: "c1", post_id: post[0].post_id, parent_comment_id: null, depth: 0, author_id: "9", author_name: "A", is_page_author: false, text: "hello", created_at: "2026-10-30T00:00:00.000Z", reaction_count: null, reply_count: null, permalink: null }];
  const a = audit(post, { follower_count: 3200, stop_reason: "converged", login_ok: true, rate_limited: false, round: 3 });
  return { url: `https://www.facebook.com/${SLUG}`, page: { name: "Test Page", follower_count: 3200, phone: "+63 900" }, post, analysis: analyze(post, {}), audit: a, stat: { stop: "converged" } };
}


test("import is idempotent on posts/comments, appends one run + snapshot per run", { skip: !process.env.DATABASE_URL }, async (t) => {
  if (!ready) return t.skip("no DB / migration 062");
  const one = await persistRun(input());
  const two = await persistRun(input());
  assert.equal(one.fb_page_id, two.fb_page_id);
  const q = async (s: string) => Number((await db().execute(sql.raw(s)))[0].n);
  assert.equal(await q(`select count(*)::int n from fb_post where fb_page_id=${one.fb_page_id}`), 1);
  assert.equal(await q(`select count(*)::int n from fb_comment c join fb_post p using(fb_post_id) where p.fb_page_id=${one.fb_page_id}`), 1);
  assert.equal(await q(`select count(*)::int n from fb_scrape_run where fb_page_id=${one.fb_page_id}`), 2);
  assert.equal(await q(`select count(*)::int n from fb_post_snapshot s join fb_post p using(fb_post_id) where p.fb_page_id=${one.fb_page_id}`), 2);
});

test("a later run that missed a field never erases it", { skip: !process.env.DATABASE_URL }, async (t) => {
  if (!ready) return t.skip("no DB / migration 062");
  const bad = input();
  bad.page = { name: "Test Page" } as never; // no phone, no followers this time
  bad.post[0].reaction_count = null;
  bad.post[0].text = "";
  const r = await persistRun(bad);
  const row = (await db().execute(sql.raw(`select p.phone, p.follower_count, f.reaction_count, length(f.caption) cap from fb_page p join fb_post f using(fb_page_id) where p.fb_page_id=${r.fb_page_id}`)))[0];
  assert.equal(row.phone, "+63 900");
  assert.equal(row.follower_count, 3200);
  assert.equal(row.reaction_count, 6);
  assert.ok(Number(row.cap) > 12);
});

test("snapshot keeps the null a run really saw (time series is honest)", { skip: !process.env.DATABASE_URL }, async (t) => {
  if (!ready) return t.skip("no DB / migration 062");
  const row = (await db().execute(sql`select s.reaction_count from fb_post_snapshot s join fb_post p using(fb_post_id) join fb_page g using(fb_page_id) where g.page_code=${SLUG} order by s.fb_post_snapshot_id desc limit 1`))[0];
  assert.equal(row.reaction_count, null);
});
