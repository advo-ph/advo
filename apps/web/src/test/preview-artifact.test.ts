/**
 * Preview artifact intake + the Cloudflare Pages adapter.
 *
 * Two halves of the same gap. `previewArtifactDir()` named a directory that NOTHING in the
 * repo ever wrote, so every deploying adapter found an empty dir, declined, and the seam
 * fell back to manual forever. The hosting adapters were never the bottleneck; the missing
 * artifact was.
 *
 * The tests that matter here are the refusals. Artifact paths arrive from a browser or a
 * CLI on someone else's machine, so `safeArtifactPath` is a security boundary, not a
 * tidy-up: it VALIDATES and refuses rather than sanitizing a hostile name into one that
 * merely looks safe.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { safeArtifactPath } from "../../../api/src/services/preview-host.service";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) =>
  readFileSync(join(monorepoRoot, path), "utf-8").replace(/\r\n/g, "\n");

const service = readSource("apps/api/src/services/preview-host.service.ts");
const route = readSource("apps/api/src/routes/projects.routes.ts");
const env = readSource("apps/api/src/utils/env.ts");
const example = readSource(".env.example");
const bench = readSource("bench/roadmap/preview-hosting/scoring.mjs");

describe("safeArtifactPath — refuses, never repairs", () => {
  it("accepts an ordinary nested build path", () => {
    expect(safeArtifactPath("index.html")).toBe("index.html");
    expect(safeArtifactPath("assets/app-abc123.js")).toBe("assets/app-abc123.js");
  });

  it("normalizes a Windows separator and a leading ./", () => {
    expect(safeArtifactPath("assets\\app.js")).toBe("assets/app.js");
    expect(safeArtifactPath("./index.html")).toBe("index.html");
  });

  it("refuses traversal in every position, not just leading", () => {
    expect(safeArtifactPath("../etc/passwd")).toBeNull();
    expect(safeArtifactPath("assets/../../etc/passwd")).toBeNull();
    expect(safeArtifactPath("a/b/../../../c")).toBeNull();
    // The backslash form matters: a check that only knows "/" lets this straight through.
    expect(safeArtifactPath("..\\..\\windows\\system32")).toBeNull();
  });

  it("refuses absolute, drive-letter and UNC paths", () => {
    expect(safeArtifactPath("/etc/passwd")).toBeNull();
    expect(safeArtifactPath("C:/Windows/system32")).toBeNull();
    expect(safeArtifactPath("C:\\Windows\\system32")).toBeNull();
    expect(safeArtifactPath("//server/share/file")).toBeNull();
  });

  it("refuses empty, dot-only and NUL-bearing names", () => {
    expect(safeArtifactPath("")).toBeNull();
    expect(safeArtifactPath(".")).toBeNull();
    expect(safeArtifactPath("./")).toBeNull();
    expect(safeArtifactPath("index.html\0.js")).toBeNull();
  });

  it("keeps a filename that merely CONTAINS dots", () => {
    // `..` is a segment rule, not a substring rule — a hashed bundle name is fine.
    expect(safeArtifactPath("assets/app..min.js")).toBe("assets/app..min.js");
    expect(safeArtifactPath("_next/static/chunk.a1b2.js")).toBe("_next/static/chunk.a1b2.js");
  });
});

describe("the upload refuses partial work", () => {
  it("rejects the whole upload when any path is unsafe", () => {
    // Skipping the bad file and deploying the rest would present a broken site as a
    // successful deploy.
    expect(route).toMatch(/Refused \$\{refused\.length\} unsafe path/);
  });

  it("requires an index.html at the artifact root", () => {
    expect(service).toMatch(/No index\.html at the artifact root/);
  });

  it("caps file count and total bytes", () => {
    expect(service).toMatch(/PREVIEW_ARTIFACT_MAX_FILE_COUNT/);
    expect(service).toMatch(/PREVIEW_ARTIFACT_MAX_TOTAL_BYTE/);
  });

  it("swaps the artifact in atomically rather than writing in place", () => {
    // A partial upload must never be what an adapter deploys. Same reason deploy.sh
    // stages the web bundle before moving it.
    expect(service).toMatch(/stageDir/);
    expect(service).toMatch(/rename\(stageDir, finalDir\)/);
  });

  it("re-checks the resolved destination even after validation", () => {
    expect(service).toMatch(/startsWith\(resolve\(stageDir\)\)/);
  });
});

describe("cloudflare adapter", () => {
  it("is registered as a third provider without displacing the default", () => {
    expect(service).toMatch(/"manual" \| "herenow" \| "cloudflare"/);
    expect(service).toMatch(/cloudflare: cloudflareProvider/);
    // manual stays the default so a deploy that sets nothing behaves as it does today.
    expect(env).toMatch(/PREVIEW_HOST_PROVIDER: z\s*\n?\s*\.?enum\(\["manual", "herenow", "cloudflare"\]\)\s*\.default\("manual"\)/);
  });

  it("declines rather than deploying an empty site", () => {
    expect(service).toMatch(/if \(artifactFile\.length === 0\) return null;/);
  });

  it("needs all three credentials before it claims to be configured", () => {
    expect(service).toMatch(/CLOUDFLARE_ACCOUNT_ID &&/);
    expect(service).toMatch(/CLOUDFLARE_API_TOKEN &&/);
    expect(service).toMatch(/CLOUDFLARE_PAGES_PROJECT/);
  });

  it("surfaces Cloudflare's structured error instead of swallowing it", () => {
    // Verified live: a bad token returns `9106: Authentication failed`, which is what
    // tells an operator the problem is the token and not the request.
    expect(service).toMatch(/payload\?\.errors\?\.map/);
  });

  it("records that it is UNVERIFIED and names the supported fallback", () => {
    expect(service).toMatch(/UNVERIFIED/);
    expect(service).toMatch(/wrangler pages deploy/);
  });

  it("documents the credentials in .env.example without inventing values", () => {
    expect(example).toMatch(/# CLOUDFLARE_ACCOUNT_ID=\s*$/m);
    expect(example).toMatch(/# CLOUDFLARE_API_TOKEN=\s*$/m);
    expect(example).toMatch(/Cloudflare Pages: Edit/);
  });
});

describe("the credential check stays honest", () => {
  it("keeps provider-credential-live in the bench rather than deleting it", () => {
    // The whole point of that check is to ask whether a real deploy was ever run. Turning
    // it green with a stubbed token is the failure mode it exists to catch.
    expect(bench).toMatch(/provider-credential-live/);
    expect(bench).toMatch(/do not stub a key and do not delete the check/i);
  });
});
