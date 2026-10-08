/**
 * Defense in depth for the visitor-analytics geo feature (process/general-plans/active/
 * visitor-analytics_PLAN_09-10-26.md §5.2): the server computes geo from the transport
 * layer (apps/api/src/services/geo.service.ts), and the client must never be asked to
 * supply an IP or a location — this is a static assertion on the body `track.ts` actually
 * sends, not merely on its TypeScript type.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ getAccessToken: () => null }));

describe("track.ts never sends ip or geo fields", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    window.sessionStorage.clear();
    fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("VITE_ANALYTICS", "true");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never includes ip/geo-shaped keys in the posted event batch", async () => {
    const { setConsent } = await import("@/components/ConsentGate");
    const { track, flush } = await import("@/lib/track");
    setConsent("granted");
    track("page_view", { surface: "landing" });
    flush(false);
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const batch = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;

    expect(batch.length).toBeGreaterThan(0);
    for (const event of batch) {
      // The eventSchema on the server has no ip/geo fields either (routes/event.routes.ts
      // — geo is resolved server-side and written directly, never read from the body).
      expect(Object.keys(event)).not.toContain("ip");
      expect(Object.keys(event)).not.toContain("geo");
      expect(Object.keys(event)).not.toContain("geoCountry");
      expect(Object.keys(event)).not.toContain("geoCity");
      expect(Object.keys(event).sort()).toEqual(
        ["detail", "kind", "occurredAt", "path", "sessionId", "visitorId"].sort(),
      );
    }
  });
});
