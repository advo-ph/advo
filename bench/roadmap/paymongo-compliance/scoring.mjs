#!/usr/bin/env node
/**
 * PayMongo merchant-review compliance — authored 2026-08-23, RED at authoring.
 *
 * Source of truth: the PayMongo requirement list Prince sent 2026-08-21
 * (Messenger DM, attachment Prince-A-Wagan-Z.jpg). PayMongo reviews the live
 * site before approving a merchant, so each disclosure has to be a reachable
 * public route, not a paragraph buried in the footer.
 *
 * The identity facts (registration number, business address, support contact)
 * are NOT in this repo and cannot be invented — they come from ADVO's DTI/SEC
 * paperwork. The lane ships the surfaces; `data/legal-identity.json` stays
 * placeholder-red until Prince supplies the real values.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const has = (relativePath) => existsSync(join(repoRoot, relativePath));

const files = {
  app: read("apps/web/src/App.tsx"),
  footer: read("apps/web/src/components/landing/landing-footer.tsx"),
  identityRaw: read("data/legal-identity.json"),
};

/** The six disclosures PayMongo names, mapped to the route each one lands on. */
const disclosure = [
  { route: "/terms", page: "Terms.tsx", label: "Terms and Conditions" },
  { route: "/privacy", page: "Privacy.tsx", label: "Privacy Policy" },
  { route: "/refund", page: "Refund.tsx", label: "Return and Refund Policy" },
  { route: "/dispute", page: "Dispute.tsx", label: "Dispute Resolution Policy" },
];

const PLACEHOLDER = /^(|TODO|TBD|CHANGEME|xxx+|—|-)$/i;

let identity = null;
try {
  identity = files.identityRaw ? JSON.parse(files.identityRaw) : null;
} catch {
  identity = null;
}

const identityField = [
  "registration_number",
  "registration_body",
  "business_address",
  "support_email",
  "support_phone",
];

const checks = [
  {
    id: "legal-page-exists",
    title: "Every PayMongo disclosure has its own page component",
    passed: disclosure.every((d) => has(`apps/web/src/pages/legal/${d.page}`)),
    expected:
      "apps/web/src/pages/legal/ holds one component per disclosure: Terms, Privacy, Refund, Dispute.",
  },
  {
    id: "legal-route-registered",
    title: "Every disclosure is reachable as a public route",
    passed: disclosure.every((d) =>
      new RegExp(`path="${d.route}"`).test(files.app),
    ),
    expected:
      "App.tsx registers /terms, /privacy, /refund and /dispute OUTSIDE the ProtectedRoute block — a reviewer is signed out.",
  },
  {
    id: "legal-footer-link",
    title: "The footer links every disclosure",
    passed: disclosure.every((d) => files.footer.includes(d.route)),
    expected:
      "landing-footer.tsx links all four legal routes, so a reviewer finds them from any page.",
  },
  {
    id: "legal-identity-file",
    title: "Merchant identity lives in one data file",
    passed: identity !== null && identityField.every((f) => f in identity),
    expected:
      "data/legal-identity.json parses and carries registration_number, registration_body, business_address, support_email, support_phone.",
  },
  {
    id: "legal-identity-filled",
    title: "Merchant identity carries real values, not placeholders",
    passed:
      identity !== null &&
      // Registration, body, address and a customer-service contact must be real.
      // A business PHONE is optional: the contact requirement is met by email OR
      // phone, so support_phone may stay TBD when support_email is present.
      ["registration_number", "registration_body", "business_address", "support_email"].every(
        (f) => typeof identity[f] === "string" && !PLACEHOLDER.test(identity[f].trim()),
      ) &&
      (!PLACEHOLDER.test(String(identity.support_email ?? "").trim()) ||
        !PLACEHOLDER.test(String(identity.support_phone ?? "").trim())),
    expected:
      "Registration number (DTI Business Name No. 7875506), registration body (DTI), business address (BIR-registered), and a customer-service contact (email) are filled from ADVO's paperwork. A business phone is optional when email is present.",
  },
  {
    id: "legal-identity-rendered",
    title: "Pages render the identity rather than hardcoding it",
    passed:
      disclosure.every((d) => {
        const source = read(`apps/web/src/pages/legal/${d.page}`);
        return source.includes("legal-identity") || source.includes("legalIdentity");
      }) && !/\d{2}-\d{7}/.test(files.footer),
    expected:
      "Each legal page imports the shared identity module; no registration number is typed into a component.",
  },
  {
    id: "legal-support-contact",
    title: "Customer service contact and business address are disclosed",
    passed:
      identity !== null &&
      typeof identity.business_address === "string" &&
      identity.business_address.length > 12 &&
      /@/.test(String(identity.support_email ?? "")),
    expected:
      "PayMongo requires a customer-service contact AND a business address; both are present and plausible.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "paymongo-compliance",
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
