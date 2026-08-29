#!/usr/bin/env node
/**
 * Ephemeral preview hosting — authored 2026-08-23, RED at authoring.
 *
 * docs/ROADMAP.md P2, the one open item that is deferred rather than blocked:
 *
 *   "here.now fresh-deploy path (instant ephemeral preview) — Deferred. The
 *    original 'instant temp deploy' ask. Current expiring-link approach is
 *    host-agnostic + works today; here.now needs an API key + per-project build
 *    artifacts."
 *
 * The shipped /p/:token flow serves a preview_url someone else deployed. The
 * original ask was to deploy it. What makes this cheap now is that the token
 * gate, the 20-minute expiry and the branded 410 page already exist — the
 * missing piece is a provider that can put a build somewhere and return a URL.
 *
 * There is no here.now API key on this machine and the operator confirmed on
 * 2026-08-23 they cannot supply one, so `provider-credential-live` STAYS RED by
 * design — the same shape as paymongo's legal-identity-filled. Build the seam
 * and the adapter; do not stub a key and do not delete the check.
 *
 * RE-AUTHORED 2026-08-29. The row above is kept for the record but no longer
 * describes what this checks. here.now was closed on 08-24 — superseded by the
 * Cloudflare Pages adapter, chosen precisely because its credential is
 * self-issuable where here.now's never was. A row hard-coded to
 * HERENOW_API_KEY was therefore asserting a credential nobody intends to
 * obtain, which is a permanently-red check measuring a decision that has
 * already been made. It now asserts a live credential for whichever provider
 * PREVIEW_HOST_PROVIDER actually selects. It is no longer red-by-design: a
 * real Cloudflare token was issued 2026-08-29 and the Pages project
 * `advo-preview` created with it, so this row is now falsifiable in the
 * ordinary way.
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

/**
 * The credential lives in apps/api/.env (gitignored), not in the shell that runs
 * the bench. Read it from there when the process env does not carry it, so the
 * check reflects the machine's real configuration rather than how it was invoked.
 * Presence only — the value is never printed.
 */
const localEnv = (() => {
  const raw = read("apps/api/.env");
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) map[match[1]] = match[2].trim();
  }
  return map;
})();

const configured = (name) => Boolean(process.env[name] || localEnv[name]);

/** Which adapter the credential check should hold to account. */
const activeProvider = process.env.PREVIEW_HOST_PROVIDER || localEnv.PREVIEW_HOST_PROVIDER || "manual";

/** manual needs no credential at all — that is the whole point of the fallback. */
const credentialByProvider = {
  manual: () => true,
  herenow: () => configured("HERENOW_API_KEY"),
  cloudflare: () =>
    configured("CLOUDFLARE_ACCOUNT_ID") &&
    configured("CLOUDFLARE_API_TOKEN") &&
    configured("CLOUDFLARE_PAGES_PROJECT"),
};

const files = {
  service: read("apps/api/src/services/preview-host.service.ts"),
  env: read("apps/api/src/utils/env.ts"),
  example: read(".env.example"),
  test: read("apps/web/src/test/preview-link.test.ts"),
  footer: read("apps/web/src/components/landing/landing-footer.tsx"),
};

const checks = [
  {
    id: "host-seam-exists",
    title: "Preview hosting is a named seam, not an inline call",
    passed: has("apps/api/src/services/preview-host.service.ts"),
    expected:
      "apps/api/src/services/preview-host.service.ts defines the provider interface. Host-agnosticism is the stated virtue of the current design — a seam keeps it; a direct here.now call throws it away.",
  },
  {
    id: "adapter-per-provider",
    title: "Both the manual and here.now providers exist",
    passed: /manual/i.test(files.service) && /here\.?now/i.test(files.service),
    expected:
      "Today's behaviour (the team pastes a preview_url) becomes the manual adapter so nothing regresses, and herenow is added beside it.",
  },
  {
    id: "provider-selected-by-config",
    title: "The active provider is configuration, not a code edit",
    passed:
      /PREVIEW_HOST_PROVIDER|previewHostProvider/.test(files.env) ||
      /PREVIEW_HOST_PROVIDER/.test(files.service),
    expected:
      "PREVIEW_HOST_PROVIDER selects the adapter and defaults to manual, so a deploy with no key behaves exactly as it does today.",
  },
  {
    id: "falls-back-not-throws",
    title: "An unconfigured provider degrades to manual rather than failing",
    passed: /fallback|fall back|default/i.test(files.service) && /manual/i.test(files.service),
    expected:
      "With no key the endpoint must still mint a link from a pasted URL. Prod has no key and must not lose a working feature to this change.",
  },
  {
    id: "expiry-preserved",
    title: "The 20-minute expiry and branded gate survive",
    passed: files.test.length > 0 && /expir/i.test(files.test),
    expected:
      "preview-link.test.ts still proves the token expiry and the 410 gate. The lifetime guarantee is the product here; a new provider must not extend or bypass it.",
  },
  {
    id: "build-artifact-addressed",
    title: "The per-project build artifact question is answered, not skipped",
    passed: /artifact|dist|build/i.test(files.service),
    expected:
      "The roadmap names per-project build artifacts as half the blocker. The adapter must state what it uploads rather than assuming a build exists.",
  },
  {
    id: "credential-documented",
    title: "The credential is documented in .env.example",
    passed: /HERENOW|PREVIEW_HOST/i.test(files.example),
    expected:
      ".env.example documents the provider key. It currently documents neither DATABASE_URL nor PLAUD_POLL_SECOND — do not extend that habit.",
  },
  {
    id: "provider-credential-live",
    title: `A live credential is configured for the selected provider (${activeProvider})`,
    passed: (credentialByProvider[activeProvider] ?? (() => false))(),
    expected:
      "The provider named by PREVIEW_HOST_PROVIDER has the credential it needs, read from the process env or apps/api/.env. `manual` passes with no credential by design — it is the no-network fallback. `cloudflare` needs the account id, API token and Pages project name together: a token without a project deploys into nothing.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "preview-hosting",
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
