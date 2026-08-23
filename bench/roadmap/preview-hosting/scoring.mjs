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
    title: "A live here.now credential is configured",
    passed: Boolean(process.env.HERENOW_API_KEY),
    expected:
      "RED BY DESIGN. No here.now key exists and the operator confirmed on 2026-08-23 they cannot supply one. Ship the seam and leave this red.",
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
