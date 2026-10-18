/**
 * Version-comparison logic for the self-hosted OTA updater (iOS app).
 *
 * `isVersionAtLeast` exists specifically because iOS's own
 * `CFBundleShortVersionString` ("1.0") and the manifest's `minNativeVersion`
 * ("1.0.0") have different segment counts. A naive string-equality fallback
 * (`version === minimum || isVersionNewer(...)`) treats those as unequal and
 * incorrectly blocks every OTA update — this was caught during EXECUTE and
 * is locked in here so it can't regress silently.
 */
import { describe, expect, it } from "vitest";
import { isVersionAtLeast, isVersionNewer } from "@/lib/otaUpdater";

describe("isVersionNewer", () => {
  it("detects a newer patch version", () => {
    expect(isVersionNewer("1.0.12", "1.0.3")).toBe(true);
    expect(isVersionNewer("1.0.3", "1.0.12")).toBe(false);
  });

  it("treats equal versions as not newer", () => {
    expect(isVersionNewer("1.0.0", "1.0.0")).toBe(false);
  });

  it("treats differing segment counts as equal when numerically equal", () => {
    expect(isVersionNewer("1.0", "1.0.0")).toBe(false);
    expect(isVersionNewer("1.0.0", "1.0")).toBe(false);
  });

  it("detects a newer major version regardless of segment count", () => {
    expect(isVersionNewer("2.0", "1.9.9")).toBe(true);
  });
});

describe("isVersionAtLeast", () => {
  it("accepts a native shell version with fewer segments than the manifest minimum", () => {
    // The exact bug this guards: iOS reports "1.0", manifests say "1.0.0".
    expect(isVersionAtLeast("1.0", "1.0.0")).toBe(true);
  });

  it("accepts an exact match", () => {
    expect(isVersionAtLeast("1.0.0", "1.0.0")).toBe(true);
  });

  it("accepts a native shell newer than the minimum", () => {
    expect(isVersionAtLeast("1.2.0", "1.0.0")).toBe(true);
  });

  it("rejects a native shell older than the minimum", () => {
    expect(isVersionAtLeast("1.0", "2.0.0")).toBe(false);
    expect(isVersionAtLeast("0.9.0", "1.0.0")).toBe(false);
  });
});
