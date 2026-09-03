#!/usr/bin/env node
/**
 * Load the curated corpus bundles under data/corpus/ into an ADVO API.
 *
 *   node scripts/corpus-load.mjs                       # http://127.0.0.1:6407, admin@advo.ph
 *   ADVO_API_URL=https://api.advo.ph ADVO_EMAIL=... ADVO_PASSWORD=... node scripts/corpus-load.mjs
 *   node scripts/corpus-load.mjs --only meeting       # or --only document | repo | template
 *   node scripts/corpus-load.mjs --dry-run            # validate and count, post nothing
 *
 * What it does, per file:
 *   data/corpus/meeting/<pub>.json   → POST /api/corpus/ingest/json (idempotent on the pub id)
 *                                       and POST /api/meeting/import with the share URL so the
 *                                       recording also appears on the Meetings screen, under
 *                                       the mapped project or Inbox.
 *   data/corpus/document/<slug>.json → POST /api/corpus/ingest/json
 *   data/corpus/document/TEMPLATE.json and data/corpus/template/*.json
 *                                    → POST /api/corpus/template (a new version only if the body changed)
 *
 * The bundle shape is the ingestion contract in apps/api/src/services/corpus.service.ts.
 * Files that fail validation are reported and skipped; the run continues, and the exit code
 * is 1 if anything was skipped, so a CI step cannot pass with a half-loaded corpus.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = (process.env.ADVO_API_URL || "http://127.0.0.1:6407").replace(/\/$/, "");
const EMAIL = process.env.ADVO_EMAIL || "admin@advo.ph";
const PASSWORD = process.env.ADVO_PASSWORD || "changeme";
const arg = process.argv.slice(2);
const only = arg.includes("--only") ? arg[arg.indexOf("--only") + 1] : null;
const isDryRun = arg.includes("--dry-run");

const dir = (name) => join(repoRoot, "data/corpus", name);
const listJson = (path) =>
  existsSync(path) ? readdirSync(path).filter((f) => f.endsWith(".json") && f !== "TEMPLATE.json").sort() : [];

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json.data?.accessToken) throw new Error(`login failed: ${json.error ?? res.status}`);
  return json.data.accessToken;
}

async function post(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof json.error === "string" ? json.error : JSON.stringify(json.error ?? json).slice(0, 300);
    throw new Error(`${path} → ${res.status} ${detail}`.trim());
  }
  return json.data;
}

/** A recording with no project still needs a home on the Meetings screen: the Inbox project. */
async function inboxProjectId(token) {
  const res = await fetch(`${API}/api/projects`, { headers: { authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  const row = (json.data ?? []).find((p) => /^inbox$/i.test(p.title ?? ""));
  return row?.projectId ?? row?.project_id ?? null;
}

/** The meeting JSON carries decision/openQuestion/person; fold what the API stores. */
function bundleFromMeeting(m) {
  const fact = [...(m.fact ?? [])];
  for (const d of m.decision ?? []) {
    fact.push({
      claim: d.text,
      category: "decision",
      quote: d.quote ?? null,
      locator: d.timestamp ?? null,
      basis: d.basis ?? "transcript",
      confidence: d.basis === "ai_note" ? 0.4 : 0.7,
    });
  }
  return {
    source: {
      kind: "plaud",
      externalId: m.source.externalId,
      url: m.source.url,
      title: m.source.title,
      occurredAt: m.source.recordedAt,
      durationSecond: m.source.durationSecond ?? null,
      language: m.source.language ?? null,
      summary: m.summary ?? null,
      projectId: m.link?.projectId ?? null,
      leadName: m.link?.leadName ?? null,
      meta: {
        speaker: m.source.speaker ?? [],
        isDiarizationSuspect: Boolean(m.source.isDiarizationSuspect),
        openQuestion: m.openQuestion ?? [],
        person: m.person ?? [],
        namedThing: m.namedThing ?? [],
        clientName: m.link?.clientName ?? null,
      },
    },
    fact: fact.map((f) => ({ ...f, locator: f.locator ?? f.timestamp ?? null })),
    action: (m.action ?? []).map((a) => ({ ...a, locator: a.locator ?? a.timestamp ?? null })),
  };
}

function bundleFromDocument(d) {
  return {
    source: {
      kind: "drive_doc",
      externalId: d.source.externalId,
      url: d.source.url,
      title: d.source.title,
      documentKind: d.source.documentKind ?? null,
      occurredAt: d.source.documentDate ?? null,
      summary: d.summary ?? null,
      projectId: d.link?.projectId ?? null,
      leadName: d.link?.leadName ?? null,
      meta: { owner: d.source.owner ?? null, person: d.person ?? [], clientName: d.link?.clientName ?? null },
    },
    fact: (d.fact ?? []).map((f) => ({ ...f, locator: f.locator ?? f.sectionHeading ?? null, basis: f.basis ?? "document" })),
    term: d.term ?? [],
    action: (d.action ?? []).map((a) => ({ ...a, basis: a.basis ?? "document" })),
  };
}

const report = { loaded: 0, skipped: [], meeting: 0, template: 0 };
const token = isDryRun ? null : await login();
const inboxId = isDryRun ? null : await inboxProjectId(token);

if (!only || only === "meeting") {
  for (const file of listJson(dir("meeting"))) {
    const path = join(dir("meeting"), file);
    try {
      const m = JSON.parse(readFileSync(path, "utf8"));
      const bundle = bundleFromMeeting(m);
      if (!bundle.source.externalId || !bundle.source.title) throw new Error("source.externalId and title are required");
      if (isDryRun) {
        console.log(`[dry] meeting ${file}: ${bundle.fact.length} fact, ${bundle.action.length} action → project ${bundle.source.projectId ?? "—"} lead ${bundle.source.leadName ?? "—"}`);
      } else {
        const r = await post(token, "/api/corpus/ingest/json", bundle);
        let meetingNote = "";
        if (m.source.url) {
          try {
            const targetProjectId = bundle.source.projectId ?? inboxId;
            if (!targetProjectId) throw new Error("no project and no Inbox project to file the meeting under");
            const mr = await post(token, "/api/meeting/import", { shareUrl: m.source.url, projectId: targetProjectId });
            meetingNote = mr?.created ? " · meeting created" : " · meeting exists";
            if (mr) report.meeting += 1;
          } catch (e) {
            meetingNote = ` · meeting import failed: ${e.message.slice(0, 80)}`;
          }
        }
        console.log(`meeting ${file}: source ${r.corpusSourceId}, ${r.factCount} fact, ${r.actionCount} action${r.leadId ? `, lead ${r.leadId}` : ""}${meetingNote}`);
      }
      report.loaded += 1;
    } catch (e) {
      report.skipped.push(`${file}: ${e.message}`);
    }
  }
}

if (!only || only === "document") {
  for (const file of listJson(dir("document"))) {
    const path = join(dir("document"), file);
    try {
      const d = JSON.parse(readFileSync(path, "utf8"));
      const bundle = bundleFromDocument(d);
      if (!bundle.source.externalId || !bundle.source.title) throw new Error("source.externalId and title are required");
      if (isDryRun) {
        console.log(`[dry] document ${file}: ${bundle.fact.length} fact, ${bundle.term.length} term, ${bundle.action.length} action`);
      } else {
        const r = await post(token, "/api/corpus/ingest/json", bundle);
        console.log(`document ${file}: source ${r.corpusSourceId}, ${r.factCount} fact, ${r.termCount} term, ${r.actionCount} action`);
      }
      report.loaded += 1;
    } catch (e) {
      report.skipped.push(`${file}: ${e.message}`);
    }
  }
}

if (!only || only === "repo") {
  // Bundles written by scripts/corpus-from-case-study.mjs are already in the API's shape.
  for (const file of listJson(dir("repo"))) {
    const path = join(dir("repo"), file);
    try {
      const bundle = JSON.parse(readFileSync(path, "utf8"));
      if (!bundle.source?.externalId || !bundle.source?.title) throw new Error("source.externalId and title are required");
      if (isDryRun) {
        console.log(`[dry] repo ${file}: ${(bundle.fact ?? []).length} fact`);
      } else {
        const r = await post(token, "/api/corpus/ingest/json", bundle);
        console.log(`repo ${file}: source ${r.corpusSourceId}, ${r.factCount} fact, ${r.termCount} term`);
      }
      report.loaded += 1;
    } catch (e) {
      report.skipped.push(`${file}: ${e.message}`);
    }
  }
}

if (!only || only === "template") {
  const templateFile = [join(dir("document"), "TEMPLATE.json"), ...listJson(dir("template")).map((f) => join(dir("template"), f))];
  for (const path of templateFile) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const t of list) {
        if (!t.kind || !t.name || !t.body) throw new Error("template needs kind, name, body");
        if (isDryRun) {
          console.log(`[dry] template ${t.kind}/${t.name}: ${t.body.length} chars, ${(t.placeholder ?? []).length} placeholder`);
        } else {
          const r = await post(token, "/api/corpus/template", {
            kind: t.kind,
            name: t.name,
            body: t.body,
            sourceExternalId: t.sourceExternalId ?? null,
            sourceKind: t.sourceKind ?? (t.sourceExternalId ? "drive_doc" : null),
          });
          console.log(`template ${t.kind}/${t.name}: v${r.template.version}${r.isNew ? " (new)" : " (unchanged)"}`);
        }
        report.template += 1;
      }
    } catch (e) {
      report.skipped.push(`${path}: ${e.message}`);
    }
  }
}

console.log(`\nloaded ${report.loaded} bundle, ${report.meeting} meeting import, ${report.template} template; skipped ${report.skipped.length}`);
for (const s of report.skipped) console.log(`  SKIPPED ${s}`);
process.exit(report.skipped.length > 0 ? 1 : 0);
