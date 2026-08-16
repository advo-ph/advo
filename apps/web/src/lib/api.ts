/**
 * ADVO API Client
 *
 * Typed fetch wrapper with JWT auth, automatic token refresh,
 * and standardized { data, error } envelope.
 */

const API_URL = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:6407");

// ─── Token Management ─────────────────────────────────

let accessToken: string | null = null;
let refreshToken: string | null = localStorage.getItem("advo_refresh_token");

export function getAccessToken() {
  return accessToken;
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem("advo_refresh_token", refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("advo_refresh_token");
}

export function hasRefreshToken() {
  return !!refreshToken;
}

// ─── Core Fetch ───────────────────────────────────────

interface ApiResponse<T> {
  data: T;
  error: string | null;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const json: ApiResponse<{ accessToken: string; refreshToken: string }> =
      await res.json();

    if (json.error || !json.data) {
      clearTokens();
      return false;
    }

    setTokens(json.data.accessToken, json.data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
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
    const refreshed = await refreshAccessToken();
    if (refreshed) {
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
