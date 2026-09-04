/**
 * The stored login has to survive everything that is not the server saying no.
 *
 * The reported symptom was "it keeps logging me out". The cause was that four separate
 * places treated any refresh failure as a rejection and deleted the refresh token: a non-2xx
 * of any kind including 5xx, an unexpected body, a thrown fetch, and a failed /api/auth/me on
 * mount. So an API restart, a deploy, a rate limit or a walk out of wifi range signed the
 * user out permanently, and the credential was gone so reconnecting did not help.
 *
 * These tests pin the distinction the fix depends on: only 401 and 403 clear anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REFRESH_KEY = "advo_refresh_token";
const ACCESS_KEY = "advo_access_token";

/** A JWT the client can parse, with an exp it can compare against. */
function makeAccessToken(expiresInSeconds: number) {
  const body = { userId: 1, email: "a@b.c", role: "admin", exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(body)}.sig`;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** api.ts snapshots localStorage at import, so every case needs a fresh module. */
async function loadApi() {
  vi.resetModules();
  return import("@/lib/api");
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe("refresh failures that are not rejections", () => {
  it("keeps the token when fetch throws, which is what offline looks like", async () => {
    localStorage.setItem(REFRESH_KEY, "stored-refresh");
    localStorage.setItem(ACCESS_KEY, makeAccessToken(-60));
    const api = await loadApi();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const res = await api.get("/api/auth/me");

    expect(res.error).toBeTruthy();
    expect(localStorage.getItem(REFRESH_KEY)).toBe("stored-refresh");
    expect(api.hasRefreshToken()).toBe(true);
  });

  it.each([500, 502, 503, 504, 429])(
    "keeps the token when refresh returns %i",
    async (status) => {
      localStorage.setItem(REFRESH_KEY, "stored-refresh");
      const api = await loadApi();

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/refresh")) return jsonResponse(status, { error: "nope" });
        return jsonResponse(401, { error: "Unauthorized" });
      });

      await api.get("/api/auth/me");

      expect(localStorage.getItem(REFRESH_KEY)).toBe("stored-refresh");
    }
  );

  it("keeps the token when refresh returns 200 with an unusable body", async () => {
    localStorage.setItem(REFRESH_KEY, "stored-refresh");
    const api = await loadApi();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) return jsonResponse(200, { data: { unexpected: true }, error: null });
      return jsonResponse(401, { error: "Unauthorized" });
    });

    await api.get("/api/auth/me");

    expect(localStorage.getItem(REFRESH_KEY)).toBe("stored-refresh");
  });

  it("still clears on a real rejection, so a revoked token does not linger", async () => {
    localStorage.setItem(REFRESH_KEY, "stored-refresh");
    localStorage.setItem(ACCESS_KEY, makeAccessToken(-60));
    const api = await loadApi();

    const rejected = vi.fn();
    api.onAuthRejected(rejected);

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse(401, { error: "Invalid or expired refresh token" })
    );

    await api.get("/api/auth/me");

    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("recovers on the next attempt, because the credential was never thrown away", async () => {
    localStorage.setItem(REFRESH_KEY, "stored-refresh");
    const api = await loadApi();

    const offline = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await api.get("/api/auth/me");
    expect(localStorage.getItem(REFRESH_KEY)).toBe("stored-refresh");

    // Back online. /me still refuses an unauthenticated call, so the recovery has to go
    // through a real refresh rather than being handed a 200 by the mock.
    const goodAccess = makeAccessToken(900);
    offline.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        return jsonResponse(200, {
          data: { accessToken: goodAccess, refreshToken: "rotated-refresh" },
          error: null,
        });
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth !== `Bearer ${goodAccess}`) return jsonResponse(401, { error: "Unauthorized" });
      return jsonResponse(200, { data: { userId: 1, email: "a@b.c", role: "admin" }, error: null });
    });

    const res = await api.get<{ userId: number }>("/api/auth/me");

    expect(res.error).toBeNull();
    expect(res.data.userId).toBe(1);
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rotated-refresh");
  });
});

describe("concurrent 401s", () => {
  it("refreshes once for five simultaneous requests and keeps every caller signed in", async () => {
    localStorage.setItem(REFRESH_KEY, "stored-refresh");
    localStorage.setItem(ACCESS_KEY, makeAccessToken(-60));
    const api = await loadApi();

    let refreshCalls = 0;
    const seenRefreshTokens: string[] = [];
    /** The only access token the fake API accepts. Compared exactly, not by prefix. */
    const goodAccess = makeAccessToken(900);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        refreshCalls += 1;
        seenRefreshTokens.push(JSON.parse(String(init?.body)).refreshToken);
        // Slow enough that a naive implementation would have five in flight at once.
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(200, {
          data: { accessToken: goodAccess, refreshToken: "rotated-once" },
          error: null,
        });
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth !== `Bearer ${goodAccess}`) return jsonResponse(401, { error: "Unauthorized" });
      return jsonResponse(200, { data: { ok: true }, error: null });
    });

    const results = await Promise.all([
      api.get<{ ok: boolean }>("/api/admin/projects"),
      api.get<{ ok: boolean }>("/api/admin/clients"),
      api.get<{ ok: boolean }>("/api/admin/leads"),
      api.get<{ ok: boolean }>("/api/admin/activity"),
      api.get<{ ok: boolean }>("/api/admin/deadlines"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(seenRefreshTokens).toEqual(["stored-refresh"]);
    for (const r of results) expect(r.error).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rotated-once");
  });
});

describe("cold load round trips", () => {
  it("sends one request when the persisted access token is still fresh", async () => {
    localStorage.setItem(REFRESH_KEY, "stored-refresh");
    localStorage.setItem(ACCESS_KEY, makeAccessToken(900));
    const api = await loadApi();

    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { data: { userId: 1, email: "a@b.c", role: "admin" }, error: null });
    });

    await api.ensureFreshAccessToken();
    await api.get("/api/auth/me");

    expect(calls).toEqual(["/api/auth/me"]);
  });

  it("skips the 401 it knows is coming when the persisted access token has aged out", async () => {
    localStorage.setItem(REFRESH_KEY, "stored-refresh");
    localStorage.setItem(ACCESS_KEY, makeAccessToken(-60));
    const api = await loadApi();

    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(String(input));
      if (String(input).includes("/api/auth/refresh")) {
        return jsonResponse(200, {
          data: { accessToken: makeAccessToken(900), refreshToken: "rotated" },
          error: null,
        });
      }
      return jsonResponse(200, { data: { userId: 1, email: "a@b.c", role: "admin" }, error: null });
    });

    await api.ensureFreshAccessToken();
    await api.get("/api/auth/me");

    // Two, not three: no wasted request with a token already known to be expired.
    expect(calls).toEqual(["/api/auth/refresh", "/api/auth/me"]);
  });
});
