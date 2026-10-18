/**
 * Mocked end-to-end control flow for `initOtaUpdater()` — the native boot
 * path that checks `https://advo.ph/app-updates/latest.json`, downloads a
 * newer bundle, and schedules it via `CapacitorUpdater.next()`.
 *
 * This exists because the equivalent manual Simulator test (plan §10 step 8)
 * cannot observe the WebView's own `console.*` output through the OS log by
 * default, making a silent early-return (e.g. the exact `isVersionAtLeast`
 * segment-count bug this file's sibling test guards) easy to miss by eye.
 * Mocking the native plugin boundary gives a deterministic, durable check of
 * the same control flow instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifyAppReady = vi.fn().mockResolvedValue({});
const download = vi.fn().mockResolvedValue({ id: "new-bundle-id" });
const next = vi.fn().mockResolvedValue({});
const getInfo = vi.fn();

vi.mock("@capgo/capacitor-updater", () => ({
  CapacitorUpdater: {
    notifyAppReady: (...args: unknown[]) => notifyAppReady(...args),
    download: (...args: unknown[]) => download(...args),
    next: (...args: unknown[]) => next(...args),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: (...args: unknown[]) => getInfo(...args),
  },
}));

const manifest = {
  version: "999.0.0",
  url: "https://advo.ph/app-updates/bundle-999.0.0.zip",
  checksum: "deadbeef",
  minNativeVersion: "1.0.0",
};

beforeEach(() => {
  vi.stubEnv("VITE_APP_VERSION", "1.0.0");
  notifyAppReady.mockClear();
  download.mockClear();
  next.mockClear();
  getInfo.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("initOtaUpdater", () => {
  it("downloads and schedules a newer bundle when the native shell meets minNativeVersion", async () => {
    getInfo.mockResolvedValue({ version: "1.0" }); // CFBundleShortVersionString, no patch segment
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }),
    );

    const { initOtaUpdater } = await import("@/lib/otaUpdater");
    await initOtaUpdater();

    expect(notifyAppReady).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith({
      version: manifest.version,
      url: manifest.url,
      checksum: manifest.checksum,
    });
    expect(next).toHaveBeenCalledWith({ id: "new-bundle-id" });
  });

  it("skips the download when the native shell is older than minNativeVersion", async () => {
    getInfo.mockResolvedValue({ version: "0.9" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }),
    );

    const { initOtaUpdater } = await import("@/lib/otaUpdater");
    await initOtaUpdater();

    expect(notifyAppReady).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("skips the download when the manifest version is not newer than the current bundle", async () => {
    getInfo.mockResolvedValue({ version: "1.0" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...manifest, version: "1.0.0" }),
      }),
    );

    const { initOtaUpdater } = await import("@/lib/otaUpdater");
    await initOtaUpdater();

    expect(notifyAppReady).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });

  it("never throws into the app shell when the manifest fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { initOtaUpdater } = await import("@/lib/otaUpdater");
    await expect(initOtaUpdater()).resolves.toBeUndefined();
    expect(notifyAppReady).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });

  it("notifyAppReady runs before the manifest is ever fetched", async () => {
    const order: string[] = [];
    notifyAppReady.mockImplementation(async () => {
      order.push("notifyAppReady");
    });
    getInfo.mockResolvedValue({ version: "1.0" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        order.push("fetch");
        return { ok: true, json: async () => manifest };
      }),
    );

    const { initOtaUpdater } = await import("@/lib/otaUpdater");
    await initOtaUpdater();

    expect(order).toEqual(["notifyAppReady", "fetch"]);
  });
});
