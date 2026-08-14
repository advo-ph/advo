/**
 * Import clinic leads from a JSON fixture (deduped by email).
 *
 *   npx tsx scripts/import-clinic-lead.ts
 *   npx tsx scripts/import-clinic-lead.ts path/to/messenger-dump.json
 *
 * Default source is data/clinic-lead/sample.json — a handful of real-shaped
 * metro-Manila clinic rows for local/dev. The ~5K Messenger archive is a path
 * argument when that dump is present. This script never invents rows.
 *
 * Requires DATABASE_URL (apps/api/.env is loaded automatically).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

loadDotenv({ path: join(repoRoot, "apps/api/.env") });
loadDotenv({ path: join(repoRoot, ".env") });

const DEFAULT_FIXTURE = join(repoRoot, "data/clinic-lead/sample.json");

type ClinicLeadInput = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  project_type?: unknown;
  projectType?: unknown;
  budget?: unknown;
  description?: unknown;
  notes?: unknown;
  website?: unknown;
  digital_score?: unknown;
  digitalScore?: unknown;
  clinic_name?: unknown;
};

function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown): string | null {
  const text = asText(value);
  if (!text || !text.includes("@")) return null;
  return text.toLowerCase();
}

function pickArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  for (const key of ["lead", "clinic", "item", "leads", "clinics"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function mapRow(raw: unknown): {
  name: string;
  email: string;
  company: string | null;
  projectType: string | null;
  budget: string | null;
  description: string | null;
  notes: string | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as ClinicLeadInput;
  const email = normalizeEmail(row.email);
  if (!email) return null;

  const company = asText(row.company) ?? asText(row.clinic_name);
  const name = asText(row.name) ?? company;
  if (!name) return null;

  const notePart: string[] = [];
  const notes = asText(row.notes);
  if (notes) notePart.push(notes);

  const website = asText(row.website);
  if (website === null && !/\bno website\b/i.test(notes ?? "")) {
    // Only tag "no website" when the dump explicitly has an empty website field.
    if ("website" in row) notePart.push("no website");
  }

  const digitalScore = row.digital_score ?? row.digitalScore;
  if (typeof digitalScore === "number" && Number.isFinite(digitalScore) && digitalScore < 40) {
    if (!/outdated/i.test(notePart.join(" "))) notePart.push("outdated");
  }

  return {
    name,
    email,
    company,
    projectType: asText(row.project_type) ?? asText(row.projectType) ?? "clinic-website",
    budget: asText(row.budget),
    description: asText(row.description),
    notes: notePart.length > 0 ? notePart.join("; ") : null,
  };
}

async function main() {
  const arg = process.argv[2];
  const sourcePath = arg
    ? isAbsolute(arg)
      ? arg
      : resolve(process.cwd(), arg)
    : DEFAULT_FIXTURE;

  if (!existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    console.error(
      arg
        ? "Pass a real Messenger dump path when the 5K archive is present. Do not invent rows."
        : "Missing default fixture data/clinic-lead/sample.json",
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required (set it or put it in apps/api/.env)");
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(sourcePath, "utf8")) as unknown;
  const rawRow = pickArray(parsed);
  if (rawRow.length === 0) {
    console.error(`No lead rows in ${sourcePath}`);
    process.exit(1);
  }

  const mapped: ReturnType<typeof mapRow>[] = [];
  const seenInFile = new Set<string>();
  let skippedNoEmail = 0;
  let skippedDupInFile = 0;

  for (const raw of rawRow) {
    const row = mapRow(raw);
    if (!row) {
      skippedNoEmail += 1;
      continue;
    }
    if (seenInFile.has(row.email)) {
      skippedDupInFile += 1;
      continue;
    }
    seenInFile.add(row.email);
    mapped.push(row);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const existing = await sql<{ email: string }[]>`
      SELECT lower(email) AS email FROM lead
    `;
    const existingEmail = new Set(existing.map((row) => row.email));

    let inserted = 0;
    let skippedExisting = 0;

    for (const row of mapped) {
      if (!row) continue;
      if (existingEmail.has(row.email)) {
        skippedExisting += 1;
        continue;
      }
      await sql`
        INSERT INTO lead (name, email, company, project_type, budget, description, notes)
        VALUES (
          ${row.name},
          ${row.email},
          ${row.company},
          ${row.projectType},
          ${row.budget},
          ${row.description},
          ${row.notes}
        )
      `;
      existingEmail.add(row.email);
      inserted += 1;
    }

    console.log(
      JSON.stringify(
        {
          source: sourcePath,
          read: rawRow.length,
          inserted,
          skipped_dup_in_file: skippedDupInFile,
          skipped_existing: skippedExisting,
          skipped_no_email: skippedNoEmail,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
