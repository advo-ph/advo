/**
 * The consent gate is load-bearing (RA 10173): the tracker must send nothing and
 * store nothing until the visitor says yes, and a refusal must clear what it stored.
 * A banner that does not actually stop the beacon documents an intent it does not honour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ getAccessToken: () => null }));

const storedTrackingKey = () =>
  ["advo.visitor.fallback", "advo.visitor.fingerprint"].filter(
    (key) => window.localStorage.getItem(key) !== null,
  );

describe("analytics consent gate", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    window.sessionStorage.clear();
    fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal("fetch", fetchSpy);
    // Most cases exercise consent with the site flag ON; the flag-off case unstubs it.
    vi.stubEnv("VITE_ANALYTICS", "true");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends nothing, even after a grant, while VITE_ANALYTICS is off", async () => {
    vi.stubEnv("VITE_ANALYTICS", "");
    const { isAnalyticsEnabled, setConsent } = await import("@/components/ConsentGate");
    const { track, flush, getIdentity } = await import("@/lib/track");
    expect(isAnalyticsEnabled()).toBe(false);
    setConsent("granted");
    expect(track("page_view", { surface: "landing" })).toBe(false);
    flush(false);
    expect(getIdentity()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storedTrackingKey()).toEqual([]);
  });

  it("refuses to track, and stores no identifier, while consent is unset", async () => {
    const { track, flush, getIdentity } = await import("@/lib/track");
    expect(track("page_view", { surface: "landing" })).toBe(false);
    flush(false);
    expect(getIdentity()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storedTrackingKey()).toEqual([]);
    expect(window.sessionStorage.getItem("advo.session")).toBeNull();
  });

  it("tracks after a grant, with no user id in the body", async () => {
    const { setConsent } = await import("@/components/ConsentGate");
    const { track, flush } = await import("@/lib/track");
    setConsent("granted");
    expect(track("page_view", { surface: "landing" })).toBe(true);
    flush(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body)) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0]).not.toHaveProperty("userId");
    expect(body[0].visitorId).toMatch(/^v_/);
  });

  it("clears the stored identifiers and drops the buffer on refusal", async () => {
    const { setConsent } = await import("@/components/ConsentGate");
    const { track, flush } = await import("@/lib/track");
    setConsent("granted");
    track("page_view", {});
    expect(storedTrackingKey().length).toBeGreaterThan(0);

    setConsent("denied");
    expect(storedTrackingKey()).toEqual([]);
    expect(window.sessionStorage.getItem("advo.session")).toBeNull();
    flush(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(track("click", {})).toBe(false);
  });

  it("withdrawal via reset clears the identifiers too", async () => {
    const { setConsent, resetConsent, readConsent } = await import("@/components/ConsentGate");
    const { track } = await import("@/lib/track");
    setConsent("granted");
    track("page_view", {});
    resetConsent();
    expect(readConsent().status).toBe("unset");
    expect(storedTrackingKey()).toEqual([]);
  });

  it("reserves the panel's space while it is on screen and releases it on a decision", async () => {
    const { createElement } = await import("react");
    const { act, cleanup, fireEvent, render, screen } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { default: ConsentGate, CONSENT_PANEL_CLASS, CONSENT_HEIGHT_VAR } = await import(
      "@/components/ConsentGate"
    );
    const root = document.documentElement;

    render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(ConsentGate)));
    expect(screen.getByRole("region", { name: "Privacy choice" })).toBeTruthy();
    expect(root.classList.contains(CONSENT_PANEL_CLASS)).toBe(true);
    expect(root.style.getPropertyValue(CONSENT_HEIGHT_VAR)).toMatch(/^\d+px$/);

    // Refusing and accepting are the same size and weight: identical inline style.
    const no = screen.getByRole("button", { name: "No, don't track me" });
    const yes = screen.getByRole("button", { name: "Yes, that's fine" });
    expect(no.getAttribute("style")).toBe(yes.getAttribute("style"));

    act(() => {
      fireEvent.click(no);
    });
    expect(screen.queryByRole("region", { name: "Privacy choice" })).toBeNull();
    expect(root.classList.contains(CONSENT_PANEL_CLASS)).toBe(false);
    expect(root.style.getPropertyValue(CONSENT_HEIGHT_VAR)).toBe("");
    cleanup();
  });

  it("reserves no space on a route that never shows the panel", async () => {
    const { createElement } = await import("react");
    const { cleanup, render } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { default: ConsentGate, CONSENT_PANEL_CLASS } = await import("@/components/ConsentGate");

    render(createElement(MemoryRouter, { initialEntries: ["/admin"] }, createElement(ConsentGate)));
    expect(document.documentElement.classList.contains(CONSENT_PANEL_CLASS)).toBe(false);
    cleanup();
  });

  it("staff telemetry is inert unless VITE_STAFF_MONITORING is set", async () => {
    const { isStaffMonitoringEnabled, startStaffTelemetry } = await import("@/lib/staff-telemetry");
    expect(isStaffMonitoringEnabled()).toBe(false);
    const handle = startStaffTelemetry("dashboard");
    handle.enterSection("clients");
    handle.stop();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
