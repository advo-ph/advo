/**
 * Structural check: Vertex/Gemini brand-analysis service is decommissioned.
 * Ensures the API entrypoint no longer mounts brand-analysis routes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const apiIndexPath = join(monorepoRoot, "apps", "api", "src", "index.ts");
const brandRoutePath = join(monorepoRoot, "apps", "api", "src", "routes", "brand-analysis.routes.ts");
const brandServicePath = join(
  monorepoRoot,
  "apps",
  "api",
  "src",
  "services",
  "brand-analysis.service.ts",
);

describe("brand-analysis decommission", () => {
  it("API index does not reference brand-analysis", () => {
    const source = readFileSync(apiIndexPath, "utf8");
    expect(source).not.toMatch(/brand-analysis/);
  });

  it("brand-analysis route and service files are gone", () => {
    expect(existsSync(brandRoutePath)).toBe(false);
    expect(existsSync(brandServicePath)).toBe(false);
  });
});
