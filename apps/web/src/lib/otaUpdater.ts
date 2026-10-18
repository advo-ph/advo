import { App } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

/**
 * Self-hosted OTA manifest published by CI (`.github/workflows/ci.yml`) to
 * `apps/web/dist/app-updates/` and shipped by the existing `deploy-web` rsync
 * step. Frozen contract — see plan §5.
 */
const LATEST_JSON_URL = "https://advo.ph/app-updates/latest.json";

interface LatestManifest {
  version: string;
  url: string;
  checksum: string;
  minNativeVersion: string;
}

/** Compares dotted version strings ("1.0.12" vs "1.0.3") numerically, part by part. */
export function isVersionNewer(candidate: string, baseline: string): boolean {
  const a = candidate.split(".").map((n) => parseInt(n, 10) || 0);
  const b = baseline.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai !== bi) return ai > bi;
  }
  return false;
}

/**
 * Numeric at-least comparison. Segment counts can legitimately differ (iOS
 * `CFBundleShortVersionString` is often "1.0", while `minNativeVersion` in
 * the manifest is "1.0.0") — a naive string-equality fallback would treat
 * those as unequal and incorrectly block every update, so this compares
 * part-by-part the same way `isVersionNewer` does, just without requiring
 * strict inequality.
 */
export function isVersionAtLeast(version: string, minimum: string): boolean {
  return !isVersionNewer(minimum, version);
}

/**
 * Entry point for the native boot sequence (`main.tsx`). Must run only on
 * `isNativeApp()`. `notifyAppReady()` runs first, synchronously relative to
 * any network call, per the plugin's rollback-avoidance contract — skipping
 * it triggers auto-rollback to the last-known-good bundle.
 */
export async function initOtaUpdater(): Promise<void> {
  await CapacitorUpdater.notifyAppReady();

  try {
    const response = await fetch(`${LATEST_JSON_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const latest = (await response.json()) as LatestManifest;

    const currentVersion = import.meta.env.VITE_APP_VERSION ?? "0.0.0";
    if (!isVersionNewer(latest.version, currentVersion)) return;

    const nativeInfo = await App.getInfo();
    if (!isVersionAtLeast(nativeInfo.version, latest.minNativeVersion)) {
      // Bundle assumes a newer native shell than installed — skip silently.
      // Mandatory native-update UX is out of scope (plan §7 step 21).
      console.warn(
        `[ota] skipping ${latest.version}: native shell ${nativeInfo.version} < required ${latest.minNativeVersion}`,
      );
      return;
    }

    const bundle = await CapacitorUpdater.download({
      version: latest.version,
      url: latest.url,
      checksum: latest.checksum,
    });
    await CapacitorUpdater.next({ id: bundle.id });
  } catch (error) {
    // Never throw into the app shell — a failed OTA check must not break boot.
    console.error("[ota] update check failed", error);
  }
}
