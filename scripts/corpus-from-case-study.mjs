#!/usr/bin/env node
/**
 * Turn the case studies read out of the client repositories (apps/web/src/data/case-study.ts)
 * into corpus bundles under data/corpus/repo/, one per repository.
 *
 * Every feature in a case study already carries the file in the client repo that proves it;
 * that path becomes the fact's locator, so "does FourlinQ's site have a configurator?" can be
 * answered with `src/pages/DesignTool.tsx` rather than with adjectives. Stack and integration
 * lines become facts too, so the corpus knows what ADVO shipped, not only what it promised.
 *
 *   node scripts/corpus-from-case-study.mjs        # writes data/corpus/repo/<slug>.json
 *   npm run corpus:load -- --only repo             # loads them
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(repoRoot, "apps/web/src/data/case-study.ts"), "utf8");

// The file is a typed object literal with no imports and no code paths; strip the types and
// evaluate the literal rather than maintain a second parser.
const start = source.indexOf("export const caseStudy");
const end = source.indexOf("export const getCaseStudy");
const literal = source
  .slice(start, end)
  .replace(/^export const caseStudy[^=]*=\s*/, "")
  .replace(/;\s*$/, "");
const caseStudy = new Function(`return (${literal});`)();

/** Which repository, and under which owner, each slug's source lives. */
const repoBySlug = {
  fourlinq: { name: "fourlinq", projectId: 3 },
  "tmc-registry": { name: "themedicalregistry", projectId: 7 },
  "felici-artisan-gelato": { name: "felici-gelato2", projectId: 6 },
  "coffee-rush-eastridge": { name: "coffeerush", projectId: 9 },
};

mkdirSync(join(repoRoot, "data/corpus/repo"), { recursive: true });
let count = 0;
for (const [slug, study] of Object.entries(caseStudy)) {
  const repo = repoBySlug[slug];
  if (!repo) continue;
  const externalId = `advo-ph/${repo.name}`;
  const fact = [
    {
      claim: `${study.client} is a ${study.sector} build: ${study.outcome}`,
      category: "product",
      quote: study.outcome,
      locator: "README",
      basis: "document",
      confidence: 0.85,
    },
    ...study.feature.map((f) => ({
      claim: `${study.client}: ${f.name} — ${f.detail}`,
      category: "product",
      quote: f.detail,
      locator: f.proof,
      basis: "document",
      confidence: 0.9,
    })),
    ...study.stack.map((line) => ({
      claim: `${study.client} runs on ${line}.`,
      category: "product",
      quote: line,
      locator: "package.json",
      basis: "document",
      confidence: 0.85,
    })),
    ...study.integration.map((line) => ({
      claim: `${study.client} integrates: ${line}.`,
      category: "product",
      quote: line,
      locator: "integration",
      basis: "document",
      confidence: 0.8,
    })),
  ];
  const bundle = {
    source: {
      kind: "local_file",
      externalId,
      url: `https://github.com/${externalId}`,
      title: `${study.client} — what ADVO shipped, read from ${externalId}`,
      documentKind: "repository",
      occurredAt: null,
      summary: study.outcome,
      projectId: repo.projectId,
      leadName: null,
      meta: { slug, liveUrl: study.liveUrl, sector: study.sector, featureCount: study.feature.length, provenance: "case-study.ts, each feature cites a file in the client repo" },
    },
    fact,
    term: [{ name: "feature_count", value: study.feature.length, unit: null, quote: null }],
    action: [],
  };
  writeFileSync(join(repoRoot, "data/corpus/repo", `${slug}.json`), JSON.stringify(bundle, null, 2) + "\n");
  count += 1;
  console.log(`repo ${slug}: ${fact.length} facts → data/corpus/repo/${slug}.json`);
}
console.log(`${count} bundle written`);
