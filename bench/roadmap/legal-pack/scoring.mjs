#!/usr/bin/env node
/**
 * Legal brief packet — authored 2026-08-23, RED at authoring.
 *
 * "Engage Philippine corporate/cyber lawyer" is the oldest ⏳ on the roadmap and
 * the only P0 item still open. Its own status line: all NINE CONTRACTS.md
 * policies need validation before use, "and the reconciled terms already went to
 * a client ahead of review, so this is now a live exposure rather than a
 * precaution."
 *
 * Hiring a lawyer is not a lane. Preparing what you hand one is — and that is
 * the part that has never been done. Today the questions sit as a punch list
 * inside a 30KB policy document; nobody can send that to counsel and get a
 * bounded quote back.
 *
 * The deliverable is a single self-contained packet a Philippine corporate/cyber
 * lawyer can price and answer without reading this repo.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const pack = read("docs/LEGAL-BRIEF.md");
const contracts = read("docs/CONTRACTS.md");

/** The nine policies CONTRACTS.md defines, by the heading anchor each uses. */
const policyCount = (contracts.match(/^#+\s*Policy\s+\d+/gim) ?? []).length;
const packPolicyCount = (pack.match(/^#+\s*(Policy|Question)\s+\d+/gim) ?? []).length;

const checks = [
  {
    id: "packet-exists",
    title: "The packet exists as one document",
    passed: pack.length > 0,
    expected:
      "docs/LEGAL-BRIEF.md — one file, self-contained, sendable as-is. Not a pointer into CONTRACTS.md.",
  },
  {
    id: "every-policy-covered",
    title: "All nine policies are in the packet",
    passed: policyCount > 0 && packPolicyCount >= policyCount,
    expected: `CONTRACTS.md defines ${policyCount || "nine"} policies; the packet must carry a section for each. A packet that covers seven produces advice with two holes.`,
  },
  {
    id: "exposure-stated-first",
    title: "The live exposure is stated up front, not buried",
    passed:
      /already (went|been sent) to a client|ahead of review|live exposure/i.test(
        pack.slice(0, 3000),
      ),
    expected:
      "Counsel needs to know in the first screenful that reconciled terms already reached a client before review. That changes the advice from drafting to remediation.",
  },
  {
    id: "questions-are-answerable",
    title: "Each question is closed-form, not an invitation to muse",
    passed:
      /\?/.test(pack) &&
      (pack.match(/\?/g) ?? []).length >= 9 &&
      /(enforceable|permitted|required under|complies with|valid)/i.test(pack),
    expected:
      "Questions are phrased so a lawyer can answer yes/no/with-modification against Philippine law, rather than 'please review our contracts'.",
  },
  {
    id: "cites-the-statute",
    title: "The statutes already identified are named",
    passed: /RA\s*10173/i.test(pack) && /(RA\s*8792|E-Commerce|Civil Code|RA\s*11967)/i.test(pack),
    expected:
      "RA 10173 (Data Privacy Act) is already an open question on the punch list and must appear. Name the other instruments the policies touch so counsel can scope.",
  },
  {
    id: "data-privacy-questions-included",
    title: "The unanswered RA 10173 questions are carried over verbatim",
    passed: /10173/.test(pack) && /(scraped|lead|consent|legitimate interest)/i.test(pack),
    expected:
      "The campaign lane blocked on these and they were never answered — scraped-lead outreach, consent basis, and the legitimate-interest argument. They are the questions gating revenue.",
  },
  {
    id: "commercial-context-included",
    title: "The packet says what ADVO actually sells",
    passed:
      /(retainer|milestone|infrastructure fee|sign-?off)/i.test(pack) &&
      /(₱|PHP|peso)/i.test(pack),
    expected:
      "Deal shapes and real figures (tiered project fee, 50/50 milestone split, ₱3,000/month infrastructure fee) — a lawyer cannot judge a payment clause without knowing the money it governs.",
  },
  {
    id: "no-invented-fact",
    title: "The packet invents no legal entity detail",
    passed:
      pack.length > 0 &&
      !/\b\d{4}-\d{8}\b/.test(pack) &&
      (!/registration number/i.test(pack) || /TODO|to be supplied|not yet/i.test(pack)),
    expected:
      "ADVO's registration number and registered address are not in this repo. Mark them TODO — the same rule the compliance lane runs under. Never fabricate a company identifier in a document going to counsel.",
  },
  {
    id: "asks-for-a-bounded-engagement",
    title: "The packet asks for something specific",
    passed: /(scope|quote|fixed fee|engagement|turnaround|estimate)/i.test(pack),
    expected:
      "It closes by naming the engagement being requested and what a reply should contain, so the response is a quote rather than a conversation.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "legal-pack",
  date: "2026-08-23",
  passed,
  counts: {
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    total: checks.length,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(passed ? 0 : 1);
