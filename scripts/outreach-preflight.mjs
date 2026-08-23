#!/usr/bin/env node
/**
 * Outreach DNS preflight — the clearance the campaign sender has never had.
 *
 *   npm run outreach:preflight
 *
 * The sender is complete and has sent nothing. What is missing is not a mechanism,
 * it is permission from the receiving world: an outreach subdomain with its own SPF,
 * DKIM and DMARC, resolving publicly, BEFORE the first campaign goes out.
 *
 * This script asks the real question. It performs live TXT lookups — it is not a
 * config-presence check, because a host and a password prove nothing about whether
 * Gmail will accept the mail. It exits non-zero on any missing or malformed record,
 * so it can gate a send rather than merely inform one, and it writes what it found
 * to docs/outreach-preflight.json so "is the domain cleared?" still has an answer
 * after the terminal closes. email.service.ts reads that artifact and refuses to
 * send without it.
 *
 * It also refuses an outreach domain equal to the transactional one. advo.ph carries
 * client magic-links; a blocked outreach domain must not be able to take login mail
 * down with it.
 *
 * Env (apps/api/.env is loaded automatically):
 *   OUTREACH_FROM           required — the outreach domain is this address's domain
 *   OUTREACH_DKIM_SELECTOR  required — the selector the ESP issued; there is no safe
 *                                      default, a guess checks the wrong name
 *   MAIL_FROM               optional — transactional address (default noreply@advo.ph)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resolver } from "node:dns/promises";
import { config as loadDotenv } from "dotenv";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

loadDotenv({ path: join(repoRoot, "apps/api/.env") });
loadDotenv({ path: join(repoRoot, ".env") });

const ARTIFACT_PATH = join(repoRoot, "docs/outreach-preflight.json");
const DEFAULT_TRANSACTIONAL_FROM = "noreply@advo.ph";

const resolver = new Resolver({ timeout: 5000, tries: 2 });

/** TXT chunks arrive split at 255 bytes; a record is the chunks joined, not the first one. */
async function lookupTxt(name) {
  try {
    const answer = await resolver.resolveTxt(name);
    return { record: answer.map((chunk) => chunk.join("")), error: null };
  } catch (err) {
    return { record: [], error: err.code ?? err.message };
  }
}

/** The domain part of a From header, which may be bare or "Name <addr>". */
function domainOf(fromHeader) {
  const address = /<([^>]+)>/.exec(fromHeader)?.[1] ?? fromHeader;
  const domain = address.trim().split("@")[1];
  return domain ? domain.trim().toLowerCase() : null;
}

const outreachFrom = process.env.OUTREACH_FROM ?? "";
const selector = (process.env.OUTREACH_DKIM_SELECTOR ?? "").trim();
const domain = domainOf(outreachFrom);
const transactionalDomain = domainOf(process.env.MAIL_FROM ?? DEFAULT_TRANSACTIONAL_FROM);

const check = [];
const add = (id, title, passed, detail, record) =>
  check.push({ id, title, passed, detail, record: record ?? [] });

// ─── 0. Configuration is present and coherent ────────

add(
  "outreach-domain-resolved",
  "An outreach domain is configured",
  Boolean(domain),
  domain
    ? `Outreach domain is ${domain}, read from OUTREACH_FROM.`
    : "OUTREACH_FROM is unset or carries no @domain. Nothing can be checked without it.",
);

add(
  "dkim-selector-configured",
  "A DKIM selector is configured",
  Boolean(selector),
  selector
    ? `Selector is "${selector}".`
    : "OUTREACH_DKIM_SELECTOR is unset. DKIM is selector-scoped and there is no safe default — " +
      "set the selector the ESP issued (Resend uses resend, Google Workspace google).",
);

// ─── 1. Outreach must not borrow the transactional domain ────

add(
  "separate-from-transactional",
  "The outreach domain is distinct from the transactional one",
  Boolean(domain) && Boolean(transactionalDomain) && domain !== transactionalDomain,
  domain && domain === transactionalDomain
    ? `Outreach and transactional mail would both send from ${domain}. Refused: that domain ` +
      "carries client magic-links, and a reputation hit on cold outreach would take login mail " +
      `down with it. Use a dedicated subdomain, e.g. outreach.${transactionalDomain}.`
    : `Outreach sends from ${domain ?? "(unset)"}, transactional from ${transactionalDomain ?? "(unset)"}.`,
);

// ─── 2. SPF ──────────────────────────────────────────

if (domain) {
  const spf = await lookupTxt(domain);
  const spfRecord = spf.record.filter((r) => r.toLowerCase().startsWith("v=spf1"));

  add(
    "checks-spf",
    "SPF resolves for the outreach domain",
    spfRecord.length === 1,
    spfRecord.length === 1
      ? `One v=spf1 record on ${domain}.`
      : spfRecord.length === 0
        ? `No v=spf1 TXT record on ${domain}${spf.error ? ` (lookup: ${spf.error})` : ""}. ` +
          "Publish one naming the outreach ESP before any send."
        : `${spfRecord.length} v=spf1 records on ${domain}. More than one is a PermError — ` +
          "receivers treat the domain as having no SPF at all. Merge them into one.",
    spfRecord,
  );

  // ─── 3. DKIM ─────────────────────────────────────────

  if (selector) {
    const dkimName = `${selector}._domainkey.${domain}`;
    const dkim = await lookupTxt(dkimName);
    const dkimRecord = dkim.record.filter((r) => /(^|;)\s*(v=DKIM1|k=|p=)/i.test(r));
    const hasKey = dkimRecord.some((r) => /(^|;)\s*p=[A-Za-z0-9+/=]+/.test(r));

    add(
      "checks-dkim",
      "DKIM resolves for the configured selector",
      dkimRecord.length > 0 && hasKey,
      dkimRecord.length === 0
        ? `Nothing at ${dkimName}${dkim.error ? ` (lookup: ${dkim.error})` : ""}. ` +
          "Publish the ESP's DKIM record (TXT or CNAME) at that exact name."
        : hasKey
          ? `Public key present at ${dkimName}.`
          : `A record exists at ${dkimName} but carries no p= key. A revoked or empty key signs ` +
            "nothing — republish it from the ESP.",
      dkimRecord,
    );
  }

  // ─── 4. DMARC ────────────────────────────────────────

  const dmarcName = `_dmarc.${domain}`;
  const dmarc = await lookupTxt(dmarcName);
  const dmarcRecord = dmarc.record.filter((r) => /^v=DMARC1/i.test(r));
  const policy = /(^|;)\s*p=(none|quarantine|reject)/i
    .exec(dmarcRecord[0] ?? "")?.[2]
    ?.toLowerCase();

  // A subdomain with no record of its own inherits the org policy. That is real coverage, but
  // it is not this domain's own policy — report it so the failure is actionable.
  let inherited = null;
  if (dmarcRecord.length === 0 && transactionalDomain && domain.endsWith(`.${transactionalDomain}`)) {
    const org = await lookupTxt(`_dmarc.${transactionalDomain}`);
    inherited = org.record.find((r) => /^v=DMARC1/i.test(r)) ?? null;
  }

  add(
    "checks-dmarc",
    "DMARC resolves and its policy is readable",
    dmarcRecord.length > 0 && Boolean(policy),
    policy
      ? `Policy is p=${policy} on ${dmarcName}.` +
        (policy === "none"
          ? " NOTE: p=none publishes a record and enforces nothing — it collects reports only. " +
            "Move to quarantine once the reports are clean."
          : "")
      : dmarcRecord.length === 0
        ? `No v=DMARC1 TXT record at ${dmarcName}.` +
          (inherited
            ? ` The org policy at _dmarc.${transactionalDomain} ("${inherited}") would apply by ` +
              "inheritance, but outreach needs its own record so its policy can be tightened " +
              "independently of the domain carrying login mail."
            : dmarc.error
              ? ` (lookup: ${dmarc.error})`
              : "")
        : `A v=DMARC1 record exists at ${dmarcName} but declares no p= policy, which receivers ` +
          "treat as invalid. Add p=none, p=quarantine, or p=reject.",
    dmarcRecord,
  );
}

// ─── Verdict ─────────────────────────────────────────

const passed = check.every((c) => c.passed);
const isEnforcing = /p=\s*(quarantine|reject)/i.test(
  check.find((c) => c.id === "checks-dmarc")?.record.join(" ") ?? "",
);

const result = {
  preflight: "outreach-preflight",
  checkedAt: new Date().toISOString(),
  domain,
  transactionalDomain,
  selector: selector || null,
  passed,
  isEnforcing,
  count: {
    passed: check.filter((c) => c.passed).length,
    failed: check.filter((c) => !c.passed).length,
    total: check.length,
  },
  check,
};

if (!existsSync(dirname(ARTIFACT_PATH))) mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
writeFileSync(ARTIFACT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");

for (const c of check) {
  console.log(`${c.passed ? "PASS" : "FAIL"}  ${c.title}`);
  console.log(`      ${c.detail}`);
}
console.log(
  `\n${result.count.passed}/${result.count.total} — outreach domain ${domain ?? "(unset)"} is ` +
    `${passed ? "CLEARED to send." : "NOT cleared. Sending stays refused."}`,
);
console.log(`Recorded to docs/outreach-preflight.json (checked ${result.checkedAt}).`);

// Non-zero on any missing or malformed record, so this gates a send rather than informing one.
if (!passed) process.exit(1);
process.exit(0);
