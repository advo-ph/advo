/**
 * ADVO API Client
 *
 * Typed fetch wrapper with JWT auth, automatic token refresh,
 * and standardized { data, error } envelope.
 *
 * THE RULE THIS FILE IS BUILT AROUND: a stored credential is only ever deleted when the
 * server has actually rejected it.
 *
 * It used to be deleted on any refresh failure, which meant an API restart, a 502 from the
 * proxy, a rate limit, a wifi handoff, or a laptop that was simply offline all read as
 * "your session is over" and wiped the token permanently. The user's report was that they
 * kept getting logged out; the cause was almost never a real logout.
 *
 * So refresh outcomes are three-valued, not boolean. "rejected" means a 401 or 403 with a
 * real response behind it and is the only outcome that clears anything. "unavailable" means
 * we could not reach a verdict — offline, 5xx, 429, an unparseable body — and always keeps
 * the credential so the next attempt can succeed.
 */

const API_URL = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:6407");

// ─── Token Management ─────────────────────────────────

const ACCESS_KEY = "advo_access_token";
const REFRESH_KEY = "advo_refresh_token";

/**
 * Storage is wrapped because Safari private mode throws on localStorage access, and an
 * exception in the token layer would take down the whole app rather than degrade it.
 */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Storage unavailable. In-memory tokens still work for this tab. */
  }
}

/**
 * The access token is persisted, not just held in memory.
 *
 * It used to be reset to null on every page load, so the first request of every cold load
 * was sent with no Authorization header and 401'd by design, then refreshed, then retried:
 * three round trips to restore a session that was never actually in doubt. A warm token
 * makes that one.
 */
let accessToken: string | null = readStored(ACCESS_KEY);
let refreshToken: string | null = readStored(REFRESH_KEY);

export function getAccessToken() {
  return accessToken;
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  writeStored(ACCESS_KEY, access);
  writeStored(REFRESH_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  writeStored(ACCESS_KEY, null);
  writeStored(REFRESH_KEY, null);
}

export function hasRefreshToken() {
  return !!refreshToken;
}

/**
 * Whether the access token we hold is worth sending.
 *
 * Reading `exp` locally is what lets a stale-but-present token skip the guaranteed 401 and
 * go straight to a refresh. The 30-second margin covers clock skew and the flight time of
 * the request itself. A token we cannot parse is treated as unusable rather than trusted.
 */
export function isAccessTokenFresh(): boolean {
  if (!accessToken) return false;
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) return false;
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof claims.exp !== "number") return false;
    return claims.exp * 1000 - 30_000 > Date.now();
  } catch {
    return false;
  }
}

// ─── Auth Rejection Signal ────────────────────────────

type AuthRejectedListener = () => void;
const authRejectedListeners = new Set<AuthRejectedListener>();

/**
 * Fires only when the server genuinely rejected the stored credential. Never on a network
 * failure. useAuth subscribes so a real rejection ends the session in the UI, while an
 * outage leaves the signed-in state exactly where it was.
 */
export function onAuthRejected(listener: AuthRejectedListener): () => void {
  authRejectedListeners.add(listener);
  return () => {
    authRejectedListeners.delete(listener);
  };
}

function emitAuthRejected() {
  for (const listener of authRejectedListeners) listener();
}

// ─── Cross-Tab Sync ───────────────────────────────────

type TokensChangedListener = () => void;
const tokensChangedListeners = new Set<TokensChangedListener>();

/**
 * Fires when ANOTHER tab changed the stored tokens. Deliberately not fired by this tab's own
 * refresh: a listener that re-validates the session would otherwise turn every routine token
 * rotation into an extra round trip and a re-render, for a session it already knows about.
 */
export function onTokensChanged(listener: TokensChangedListener): () => void {
  tokensChangedListeners.add(listener);
  return () => {
    tokensChangedListeners.delete(listener);
  };
}

/**
 * Two tabs used to destroy each other's sessions: each rotated the shared refresh token,
 * and whichever one refreshed second presented a token the first had already spent. The
 * server now forgives that, and this listener closes the loop from the other side by
 * adopting whatever the other tab wrote instead of continuing to hold a stale value.
 *
 * `storage` fires in every tab except the one that wrote, which is exactly the audience.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== localStorage) return;
    if (event.key !== REFRESH_KEY && event.key !== ACCESS_KEY && event.key !== null) return;

    const nextRefresh = readStored(REFRESH_KEY);
    const nextAccess = readStored(ACCESS_KEY);
    if (nextRefresh === refreshToken && nextAccess === accessToken) return;

    refreshToken = nextRefresh;
    accessToken = nextAccess;

    // Another tab signing out should not strand this one on a dead token.
    if (!nextRefresh) emitAuthRejected();
    for (const listener of tokensChangedListeners) listener();
  });
}

// ─── Core Fetch ───────────────────────────────────────

interface ApiResponse<T> {
  data: T;
  error: string | null;
}

type RefreshOutcome = "ok" | "rejected" | "unavailable";

/**
 * In-flight dedupe.
 *
 * useAdminData fires five queries through Promise.all. When the access token has expired
 * all five come back 401 at once, and without this every one of them posted the same
 * refresh token as a separate rotation. The server now survives that, but there is still no
 * reason to do it: one refresh, five awaiters, one resulting token.
 */
let inFlightRefresh: Promise<RefreshOutcome> | null = null;

async function refreshAccessToken(): Promise<RefreshOutcome> {
  if (!refreshToken) return "rejected";
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async (): Promise<RefreshOutcome> => {
    // Read at call time, not at closure time: another tab may have written a newer token
    // between this refresh being queued and it running.
    const presented = refreshToken;
    if (!presented) return "rejected";

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: presented }),
      });
    } catch {
      // Offline, DNS failure, wifi handoff, CORS, aborted navigation. None of these are
      // the server saying no, so the credential stays exactly where it is.
      return "unavailable";
    }

    if (res.status === 401 || res.status === 403) {
      clearTokens();
      emitAuthRejected();
      return "rejected";
    }

    // 5xx, 429, 502 from a proxy mid-deploy, anything else. Keep the token, try later.
    if (!res.ok) return "unavailable";

    let json: ApiResponse<{ accessToken: string; refreshToken: string }>;
    try {
      json = await res.json();
    } catch {
      return "unavailable";
    }

    if (json.error || !json.data?.accessToken || !json.data?.refreshToken) {
      return "unavailable";
    }

    setTokens(json.data.accessToken, json.data.refreshToken);
    return "ok";
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

/** Exposed so a cold load can skip the 401 it already knows is coming. */
export async function ensureFreshAccessToken(): Promise<RefreshOutcome> {
  if (isAccessTokenFresh()) return "ok";
  if (!refreshToken) return "rejected";
  return refreshAccessToken();
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Don't set Content-Type for FormData (browser sets boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    return {
      data: null as T,
      error: err instanceof Error ? err.message : "Network request failed",
    };
  }

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const outcome = await refreshAccessToken();
    if (outcome === "ok") {
      headers["Authorization"] = `Bearer ${accessToken}`;
      try {
        res = await fetch(`${API_URL}${path}`, { ...options, headers });
      } catch (err) {
        return {
          data: null as T,
          error: err instanceof Error ? err.message : "Network request failed",
        };
      }
    }
  }

  let json: ApiResponse<T> | { message?: string; error?: string | { message?: string } } = {
    data: null as T,
    error: null,
  };
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      return {
        data: null as T,
        error: res.ok ? "Invalid API response" : text,
      };
    }
  }

  if (!res.ok) {
    const raw = json as { error?: string | { message?: string } | null; message?: string };
    const errMsg =
      typeof raw.error === "string"
        ? raw.error
        : raw.error?.message || raw.message || `HTTP ${res.status}`;
    return { data: null as T, error: errMsg };
  }

  return json as ApiResponse<T>;
}

// ─── Convenience Methods ──────────────────────────────

export function get<T>(path: string) {
  return api<T>(path, { method: "GET" });
}

export function post<T>(path: string, body?: unknown) {
  return api<T>(path, {
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

export function patch<T>(path: string, body?: unknown) {
  return api<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function del<T>(path: string) {
  return api<T>(path, { method: "DELETE" });
}

// ─── File Upload ──────────────────────────────────────

export async function upload(
  file: File,
  bucket: string = "assets"
): Promise<{ url: string; filename: string; error: null } | { url: null; filename: null; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);

  const res = await post<{ url: string; filename: string; bucket: string }>(
    "/api/files/upload",
    formData
  );

  if (res.error || !res.data) {
    return { url: null, filename: null, error: res.error || "Upload failed" };
  }
  return { url: res.data.url, filename: res.data.filename, error: null };
}
