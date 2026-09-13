/**
 * @vitest-environment node
 *
 * Corpus source body (migration 047): the full text of every source is stored, returned
 * by the detail read, left out of the list, searchable, and backfilled from the old
 * `meta.body` stopgap.
 *
 * Three blocks. The source-reading block always runs. The live block drives a running API
 * (skipped when it is down — see live-api.ts). The migration block runs 047 against a
 * THROWAWAY database named by CORPUS_MIGRATION_DATABASE_URL and is skipped without it:
 * it writes rows and re-applies a migration, so it must never point at a real database.
 */
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { API, skipWhenApiDown } from "./live-api.js";
import { readCode, readSource } from "./read-source.js";

const MIGRATION = "apps/api/migrations/047_corpus_source_body.sql";
const SERVICE = "apps/api/src/services/corpus.service.ts";
const ROUTE = "apps/api/src/routes/corpus.routes.ts";

describe("corpus body — wiring in source", () => {
  it("047 is idempotent and records itself in the ledger", () => {
    const sql = readCode(MIGRATION);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS body text");
    expect(sql).toMatch(/WHERE body IS NULL\s+AND jsonb_typeof\(meta->'body'\) = 'string'/);
    expect(sql).toContain("meta = meta - 'body'");
    expect(sql).toContain("VALUES ('047_corpus_source_body.sql', false)");
    expect(sql).toContain("ON CONFLICT (filename) DO NOTHING");
  });

  it("the list read names its columns and never selects the body", () => {
    const code = readCode(SERVICE);
    const list = code.slice(code.indexOf("export async function listSource"), code.indexOf("export async function deleteSource"));
    expect(list).not.toContain("s.*");
    expect(list).not.toMatch(/s\.body\s*,/);
    expect(list).toContain("as body_character_count");
    expect(list).toContain("s.body ilike");
    expect(list).toContain("limit ${limit} offset ${offset}");
    expect(list).toContain("totalCount");
  });

  it("every ingest route stores the text it was given", () => {
    const code = readCode(ROUTE);
    expect(code).toContain("body: z.string().max(BODY_MAX_CHARACTER).nullish()");
    expect(code).toContain("body: payload.transcript.slice(0, BODY_MAX_CHARACTER)");
    expect(code).toContain("body: input.text");
    expect(readSource(SERVICE)).toContain("coalesce(excluded.body");
  });
});

describe.skipIf(skipWhenApiDown)("corpus body — live API", () => {
  const login = async () => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@advo.ph", password: "changeme" }),
    });
    return (await res.json()).data.accessToken as string;
  };
  const call = async (token: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  };
  const marker = `zebracorpusbody${Date.now()}`;

  it("stores a bundle body, returns it on detail, keeps it on a body-less re-ingest, and leaves it out of the list", async () => {
    const token = await login();
    const body = `# Vitest body fixture\n\nThe word ${marker} appears only in this body.\n\n${"filler line\n".repeat(20_000)}`;
    const source = { kind: "text", externalId: `vitest-corpus-body-${marker}`, title: "Vitest body fixture", summary: "no marker here" };

    const first = await call(token, "POST", "/api/corpus/ingest/json", { source: { ...source, body } });
    expect(first.status).toBe(201);
    const id = first.json.data.corpusSourceId as number;

    const detail = await call(token, "GET", `/api/corpus/source/${id}`);
    expect(detail.json.error).toBeNull();
    expect(detail.json.data.body).toBe(body);

    const again = await call(token, "POST", "/api/corpus/ingest/json", { source });
    expect(again.json.data.corpusSourceId).toBe(id);
    expect((await call(token, "GET", `/api/corpus/source/${id}`)).json.data.body).toBe(body);

    const list = await call(token, "GET", `/api/corpus/source?externalId=${source.externalId}`);
    const row = (list.json.data.source as Record<string, unknown>[]).find((r) => Number(r.corpus_source_id) === id);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("body");
    expect(Number(row!.body_character_count)).toBe(body.length);

    const found = await call(token, "GET", `/api/corpus/source?q=${marker.toUpperCase()}`);
    expect((found.json.data.source as Record<string, unknown>[]).map((r) => Number(r.corpus_source_id))).toEqual([id]);
    expect(found.json.data.totalCount).toBe(1);
    const wildcard = await call(token, "GET", `/api/corpus/source?q=${encodeURIComponent("%_%")}&limit=500`);
    expect((wildcard.json.data.source as Record<string, unknown>[]).some((r) => Number(r.corpus_source_id) === id)).toBe(false);

    expect((await call(token, "DELETE", `/api/corpus/source/${id}`)).status).toBe(200);
  });

  it("moves a pre-047 bundle's meta.body into the column instead of recreating the stopgap", async () => {
    const token = await login();
    const res = await call(token, "POST", "/api/corpus/ingest/json", {
      source: { kind: "text", externalId: `vitest-corpus-meta-${marker}`, title: "Vitest meta body", meta: { body: "# Old bundle\n\ntext", keep: 1 } },
    });
    expect(res.status).toBe(201);
    const id = res.json.data.corpusSourceId as number;
    const detail = await call(token, "GET", `/api/corpus/source/${id}`);
    expect(detail.json.data.body).toBe("# Old bundle\n\ntext");
    expect(detail.json.data.meta).toEqual({ keep: 1 });
    await call(token, "DELETE", `/api/corpus/source/${id}`);
  });

  it("stores pasted text as the body instead of discarding it", async () => {
    const token = await login();
    const text = `Minutes. The ${marker}text fee is ₱1,234.00 per month. Gelo will send the invoice by Friday.`;
    const res = await call(token, "POST", "/api/corpus/ingest/text", { title: "Vitest pasted text", text, externalId: `vitest-corpus-text-${marker}` });
    expect(res.status).toBe(201);
    const id = res.json.data.corpusSourceId as number;
    expect((await call(token, "GET", `/api/corpus/source/${id}`)).json.data.body).toBe(text);
    await call(token, "DELETE", `/api/corpus/source/${id}`);
  });

  it("pages through every source with a total count, and search and filters page too", async () => {
    const token = await login();
    const created: number[] = [];
    // More than one default page, so the old "first 50 only" failure cannot pass.
    for (let i = 0; i < 55; i += 1) {
      const res = await call(token, "POST", "/api/corpus/ingest/json", {
        source: { kind: "web", externalId: `vitest-corpus-page-${marker}-${i}`, title: `Vitest page ${marker} ${i}`, occurredAt: `2020-01-${String((i % 28) + 1).padStart(2, "0")}` },
      });
      created.push(res.json.data.corpusSourceId as number);
    }
    try {
      const first = await call(token, "GET", `/api/corpus/source?q=${marker}&limit=20`);
      expect(first.json.error).toBeNull();
      expect(first.json.data.totalCount).toBe(55);
      expect(first.json.data.limit).toBe(20);
      expect(first.json.data.source).toHaveLength(20);

      const seen: number[] = [];
      for (let offset = 0; offset < 55; offset += 20) {
        const page = await call(token, "GET", `/api/corpus/source?q=${marker}&limit=20&offset=${offset}`);
        seen.push(...(page.json.data.source as Record<string, unknown>[]).map((r) => Number(r.corpus_source_id)));
      }
      expect(new Set(seen).size).toBe(55);
      expect([...seen].sort((a, b) => a - b)).toEqual([...created].sort((a, b) => a - b));

      const defaultPage = await call(token, "GET", `/api/corpus/source?q=${marker}`);
      expect(defaultPage.json.data.source).toHaveLength(50);
      const kind = await call(token, "GET", `/api/corpus/source?q=${marker}&kind=plaud`);
      expect(kind.json.data.totalCount).toBe(0);
      const all = await call(token, "GET", "/api/corpus/source?limit=1");
      expect(all.json.data.totalCount).toBeGreaterThanOrEqual(55);

      expect((await call(token, "GET", "/api/corpus/source?limit=501")).status).toBe(400);
      expect((await call(token, "GET", "/api/corpus/source?offset=-1")).status).toBe(400);
    } finally {
      for (const id of created) await call(token, "DELETE", `/api/corpus/source/${id}`);
    }
  });

  it("rejects a body over the cap", async () => {
    const token = await login();
    const res = await call(token, "POST", "/api/corpus/ingest/json", {
      source: { kind: "text", externalId: `vitest-corpus-cap-${marker}`, title: "too long", body: "x".repeat(2_000_001) },
    });
    expect(res.status).toBe(400);
  });
});

const migrationUrl = process.env.CORPUS_MIGRATION_DATABASE_URL;

describe.skipIf(!migrationUrl)("corpus body — 047 backfill against a throwaway database", () => {
  it("moves meta.body into body, keeps the rest of meta, and is harmless to re-run", async () => {
    const sql = postgres(migrationUrl!, { max: 1, onnotice: () => {} });
    try {
      const file = readSource(MIGRATION);
      await sql`delete from corpus_source where external_id like 'vitest-047-%'`;
      await sql`
        insert into corpus_source (kind, external_id, title, meta, body) values
          ('text', 'vitest-047-meta', 'meta body', ${sql.json({ body: "# From meta", keep: 1 })}, null),
          ('text', 'vitest-047-none', 'no body', ${sql.json({ keep: 2 })}, null),
          ('text', 'vitest-047-both', 'both', ${sql.json({ body: "meta copy" })}, 'column copy')
      `;
      await sql.unsafe(file);
      await sql.unsafe(file);
      const row = await sql<{ external_id: string; body: string | null; meta: Record<string, unknown> }[]>`
        select external_id, body, meta from corpus_source where external_id like 'vitest-047-%' order by external_id
      `;
      const by = Object.fromEntries(row.map((r) => [r.external_id, r]));
      expect(by["vitest-047-meta"].body).toBe("# From meta");
      expect(by["vitest-047-meta"].meta).toEqual({ keep: 1 });
      expect(by["vitest-047-none"].body).toBeNull();
      expect(by["vitest-047-none"].meta).toEqual({ keep: 2 });
      expect(by["vitest-047-both"].body).toBe("column copy");
      expect(by["vitest-047-both"].meta).toEqual({ body: "meta copy" });
      const [ledger] = await sql<{ count: string }[]>`select count(*) from schema_migration where filename = '047_corpus_source_body.sql'`;
      expect(Number(ledger.count)).toBe(1);
      await sql`delete from corpus_source where external_id like 'vitest-047-%'`;
    } finally {
      await sql.end();
    }
  });
});
