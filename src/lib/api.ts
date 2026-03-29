/**
 * ADVO API Client
 *
 * Typed fetch wrapper with JWT auth, automatic token refresh,
 * and standardized { data, error } envelope.
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

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

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  const json = await res.json();

  if (!res.ok) {
    return { data: null as T, error: json.error || `HTTP ${res.status}` };
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
): Promise<{ url: string; filename: string } | null> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);

  const res = await post<{ url: string; filename: string; bucket: string }>(
    "/api/files/upload",
    formData
  );

  if (res.error || !res.data) return null;
  return { url: res.data.url, filename: res.data.filename };
}
