/**
 * Plaud Open API — the official OAuth surface behind @plaud-ai/mcp
 * (platform.plaud.ai/developer/api). Verified 2026-10-18 against the live account:
 *
 *   GET  /open/third-party/files/?page=&page_size=   (page_size >= 10, newest first)
 *   GET  /open/third-party/files/<of_id>             (source_list transcript + note_list summary)
 *   POST /oauth/third-party/access-token/refresh     (form body refresh_token, no client secret)
 *
 * Access tokens live 24h, refresh tokens 7 days, and every refresh returns a fresh
 * refresh token, so a poller that ticks at least weekly never needs a human login.
 * The old refresh token keeps working after a refresh, so this box and the Plaud MCP
 * on a laptop can share one grant without knocking each other out.
 *
 * The token file is the MCP's own format ({access_token, refresh_token, token_type,
 * expires_at}), so `~/.plaud/tokens-mcp.json` from any machine logged into the MCP
 * can be copied to PLAUD_OPEN_TOKEN_FILE as-is.
 *
 * Kept apart from plaud.service.ts on purpose: that file speaks the consumer web API
 * with a browser JWT, and the two tokens are not interchangeable (-3900 either way).
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { hydrateDetail, plaudFetch, type FileDetail, type PlaudFile } from "./plaud.service.js";

const DEFAULT_API_BASE = "https://platform.plaud.ai/developer/api";
const DEFAULT_TOKEN_FILE = join(homedir(), ".plaud", "tokens-mcp.json");
/** Refresh this long before the access token's own expiry. */
const REFRESH_MARGIN_MILLISECOND = 5 * 60 * 1000;
/** The API refuses page_size < 10. */
const PAGE_SIZE = 50;
const MAX_PAGE = 40;

type TokenFile = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
};

type OpenFileRow = {
  id?: string;
  name?: string;
  created_at?: string;
  start_at?: string;
  duration?: number;
};

type OpenFileDetail = OpenFileRow & {
  source_list?: FileDetail["source_list"];
  note_list?: FileDetail["note_list"];
};

export class PlaudOpenError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlaudOpenError";
  }
}

function apiBase(): string {
  return (process.env.PLAUD_OPEN_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
}

export function openTokenFilePath(): string {
  return process.env.PLAUD_OPEN_TOKEN_FILE || DEFAULT_TOKEN_FILE;
}

function readTokenFile(): TokenFile | null {
  const path = openTokenFilePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TokenFile;
  } catch {
    return null;
  }
}

function writeTokenFile(token: TokenFile): void {
  const path = openTokenFilePath();
  writeFileSync(path, JSON.stringify(token, null, 2));
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows */
  }
}

/** JWT `exp` in epoch ms, or null when the token is not a readable JWT. */
export function jwtExpiryMillisecond(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** A refresh token that has not expired yet — the only thing a poll needs to run. */
export function hasOpenAuth(now = Date.now()): boolean {
  const token = readTokenFile();
  if (!token?.refresh_token) return false;
  const exp = jwtExpiryMillisecond(token.refresh_token);
  return exp === null || exp > now;
}

export function openAuthState(): {
  isConfigured: boolean;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
} {
  const token = readTokenFile();
  const access = jwtExpiryMillisecond(token?.access_token);
  const refresh = jwtExpiryMillisecond(token?.refresh_token);
  return {
    isConfigured: hasOpenAuth(),
    accessExpiresAt: access ? new Date(access).toISOString() : null,
    refreshExpiresAt: refresh ? new Date(refresh).toISOString() : null,
  };
}

async function refreshToken(current: TokenFile): Promise<TokenFile> {
  if (!current.refresh_token) throw new PlaudOpenError(401, "Plaud Open API: no refresh token");
  const res = await plaudFetch(`${apiBase()}/oauth/third-party/access-token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ refresh_token: current.refresh_token }).toString(),
  });
  if (!res.ok) {
    throw new PlaudOpenError(res.status, `Plaud Open API refresh failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new PlaudOpenError(502, "Plaud Open API refresh returned no token");
  const next: TokenFile = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? current.refresh_token,
    token_type: data.token_type ?? "bearer",
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
  writeTokenFile(next);
  return next;
}

/** The current access token, refreshed first when it is about to expire. */
async function accessToken(force = false): Promise<string> {
  const token = readTokenFile();
  if (!token) throw new PlaudOpenError(401, `Plaud Open API: no token file at ${openTokenFilePath()}`);
  const exp = jwtExpiryMillisecond(token.access_token) ?? token.expires_at ?? 0;
  if (!force && token.access_token && exp - REFRESH_MARGIN_MILLISECOND > Date.now()) {
    return token.access_token;
  }
  const fresh = await refreshToken(token);
  return fresh.access_token as string;
}

/**
 * The API rate-limits detail reads (429 after ~160 back-to-back on 2026-10-18).
 * Wait out Retry-After, or 2s, 4s, 8s, before giving up on the request.
 */
const RATE_LIMIT_RETRY = 3;

const pause = (millisecond: number) => new Promise((resolve) => setTimeout(resolve, millisecond));

async function openRequest<T>(path: string, retried = false, attempt = 0): Promise<T> {
  const token = await accessToken(retried);
  const res = await plaudFetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401 && !retried) return openRequest<T>(path, true, attempt);
  if (res.status === 429 && attempt < RATE_LIMIT_RETRY) {
    const after = Number(res.headers.get("retry-after"));
    await pause(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** attempt);
    return openRequest<T>(path, retried, attempt + 1);
  }
  if (!res.ok) throw new PlaudOpenError(res.status, `Plaud Open API ${path.split("?")[0]} → ${res.status}`);
  return (await res.json()) as T;
}

/** `of_<hex>` → `<hex>`, the same id the consumer API and meeting.plaud_file_id use. */
export function hexFileId(openId: string): string {
  return openId.replace(/^of_/, "").toLowerCase();
}

/** Open API times are UTC without a zone suffix. */
export function openTimeToIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function fileFromOpenRow(row: OpenFileRow): PlaudFile | null {
  if (!row.id) return null;
  return {
    fileId: hexFileId(row.id),
    name: String(row.name ?? "Untitled").trim(),
    startAt: openTimeToIso(row.start_at ?? row.created_at),
    durationMillisecond: typeof row.duration === "number" ? row.duration : null,
    tagId: [],
  };
}

/**
 * Walk the account newest-first. `stopAt` ends the walk at the first file already
 * imported, so a steady-state tick reads one page.
 */
export async function listOpenFile(stopAt?: (file: PlaudFile) => boolean): Promise<PlaudFile[]> {
  const file: PlaudFile[] = [];
  for (let page = 1; page <= MAX_PAGE; page += 1) {
    const envl = await openRequest<{ data?: OpenFileRow[] }>(
      `/open/third-party/files/?page=${page}&page_size=${PAGE_SIZE}`,
    );
    const row = envl.data ?? [];
    for (const one of row) {
      const mapped = fileFromOpenRow(one);
      if (!mapped) continue;
      if (stopAt?.(mapped)) return file;
      file.push(mapped);
    }
    if (row.length < PAGE_SIZE) break;
  }
  return file;
}

/** One recording, shaped as the consumer FileDetail so payloadFromDetail reads it unchanged. */
export async function getOpenFileDetail(fileId: string): Promise<FileDetail> {
  const openId = fileId.startsWith("of_") ? fileId : `of_${fileId}`;
  const raw = await openRequest<OpenFileDetail>(`/open/third-party/files/${encodeURIComponent(openId)}`);
  const start = openTimeToIso(raw.start_at ?? raw.created_at);
  return hydrateDetail({
    file_id: hexFileId(openId),
    file_name: raw.name,
    start_time: start ? Date.parse(start) : undefined,
    duration: raw.duration,
    source_list: raw.source_list ?? [],
    note_list: raw.note_list ?? [],
  });
}
