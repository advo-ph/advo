/**
 * Thin Plaud consumer-web client — ported from praud's verified surface
 * (docs/plaud-api.md). Transport traps: browser UA, Origin/Referer,
 * -302 region bounce, -419 workspace remint.
 *
 * Do not mix this JWT with the official MCP OAuth token.
 */
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SESSION_DEAD = new Set([-419, -420, -3900, -3901]);
const DEFAULT_HOST = "https://api-apse1.plaud.ai";
const DEFAULT_AUTH_FILE = join(homedir(), ".piper", "plaud-auth.json");

/** Bounded listing page. The account is walked newest-first, never in one shot. */
const LISTING_PAGE_SIZE = 200;
/** Hard ceiling on pages walked, so a pathological account cannot spin forever. */
const LISTING_MAX_PAGE = 25;

// ─── Transport ────────────────────────────────────────
//
// One keep-alive connection pool shared by every outbound Plaud request.
//
// Measured 2026-08-17 (docs/HANDOFF.md): the ADVO folder poll ticks every 60s,
// but undici's default keep-alive idle timeout is ~4s. Every tick therefore
// opened a brand-new TLS connection and abandoned the previous one into
// TIME_WAIT — +1 per tick, monotonic, never plateauing. On a box near its
// ephemeral-port ceiling that surfaces as WSAENOBUFS on the NEXT outbound
// connect, which is what rsync/SSH and Ask Plaud actually hit.
//
// Holding the idle timeout above the poll interval keeps one connection warm
// across ticks and the TIME_WAIT count flat (verified: +1/tick → 0/tick).

type Dispatcher = object;

let dispatcherPromise: Promise<Dispatcher | null> | null = null;

function keepAliveMillisecond(): number {
  const second = Number(process.env.PLAUD_POLL_SECOND ?? "60");
  const poll = Number.isFinite(second) && second > 0 ? second : 60;
  // Outlive one poll interval with room to spare, so a tick always finds the
  // previous connection still open rather than dialing a fresh one.
  return Math.max(90_000, poll * 1000 + 30_000);
}

/**
 * undici ships inside Node, so this adds no dependency. If the module is not
 * resolvable we degrade to the global dispatcher rather than fail the request.
 */
export async function plaudDispatcher(): Promise<Dispatcher | null> {
  if (!dispatcherPromise) {
    dispatcherPromise = (async () => {
      try {
        const undici = (await import("undici")) as {
          Agent: new (option: Record<string, number>) => Dispatcher;
        };
        return new undici.Agent({
          keepAliveTimeout: keepAliveMillisecond(),
          keepAliveMaxTimeout: keepAliveMillisecond() * 4,
          connections: 4,
        });
      } catch {
        return null;
      }
    })();
  }
  return dispatcherPromise;
}

/** Every Plaud request goes through here so they all share the one pool. */
export async function plaudFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const dispatcher = await plaudDispatcher();
  return fetch(url, dispatcher ? ({ ...init, dispatcher } as RequestInit) : init);
}

// ─── Token liveness ───────────────────────────────────
//
// hasPlaudAuth() only proves a token STRING exists. A workspace token that the
// API has already rejected (-419) and that cannot be reminted is configured but
// useless — polling it every 60s forever is exactly the outbound churn above.

let tokenDeadReason: string | null = null;

export function markTokenDead(reason: string): void {
  tokenDeadReason = reason;
}

export function clearTokenDead(): void {
  tokenDeadReason = null;
}

/** Configured AND not known-rejected. The poller gates every tick on this. */
export function isTokenUsable(): boolean {
  return hasPlaudAuth() && tokenDeadReason === null;
}

export function plaudAuthState(): {
  isConfigured: boolean;
  isUsable: boolean;
  deadReason: string | null;
} {
  return {
    isConfigured: hasPlaudAuth(),
    isUsable: isTokenUsable(),
    deadReason: tokenDeadReason,
  };
}

export class PlaudApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly msg: string,
    public readonly path: string,
  ) {
    super(`Plaud ${path} failed: status=${status} msg=${msg}`);
    this.name = "PlaudApiError";
  }
}

type Auth = { token: string; host: string; userToken?: string; workspaceId?: string };

type AuthFile = {
  token?: string;
  host?: string;
  user_token?: string;
  workspace_id?: string;
  refresh_token?: string;
};

type PlaudEnvelope<T> = { status: number; msg?: string; data: T };

export type ContentItem = {
  data_id?: string;
  data_type?: string;
  data_content?: string;
  data_link?: string;
  data_title?: string;
  data_tab_name?: string;
  title?: string;
  task_status?: number | string;
};

export type FileDetail = {
  file_id?: string;
  id?: string;
  file_name?: string;
  filename?: string;
  start_time?: number;
  duration_ms?: number;
  duration?: number;
  trans_result?: unknown;
  content_list?: ContentItem[];
  source_list?: ContentItem[];
  note_list?: ContentItem[];
  notes_list?: ContentItem[];
  transaction_polish?: unknown;
  outline_result?: unknown;
};

export type PlaudFile = {
  fileId: string;
  name: string;
  startAt: string | null;
  durationMillisecond: number | null;
  tagId: string[];
};

export type TranscriptSegment = {
  start_ms?: number;
  speaker?: string;
  text: string;
};

export type PlaudPayload = {
  fileId: string | null;
  title: string;
  recordedAt: Date;
  transcript: string;
  summary: string | null;
  shareKey: string | null;
};

function authFilePath(): string {
  return process.env.PLAUD_AUTH_FILE || DEFAULT_AUTH_FILE;
}

function widFromJwt(token: string): string | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
    ) as { wid?: string };
    return payload.wid;
  } catch {
    return undefined;
  }
}

export function hasPlaudAuth(): boolean {
  if (process.env.PLAUD_TOKEN) return true;
  try {
    const raw = JSON.parse(readFileSync(authFilePath(), "utf8")) as AuthFile;
    return Boolean(raw.token);
  } catch {
    return false;
  }
}

function loadAuth(): Auth {
  if (process.env.PLAUD_TOKEN) {
    return {
      token: process.env.PLAUD_TOKEN,
      host: (process.env.PLAUD_API_HOST || DEFAULT_HOST).replace(/\/$/, ""),
    };
  }
  const path = authFilePath();
  const raw = JSON.parse(readFileSync(path, "utf8")) as AuthFile;
  if (!raw.token) throw new Error(`No token in ${path}`);
  return {
    token: raw.token,
    host: (raw.host ?? process.env.PLAUD_API_HOST ?? DEFAULT_HOST).replace(/\/$/, ""),
    userToken: raw.user_token,
    workspaceId: raw.workspace_id ?? widFromJwt(raw.token),
  };
}

function persistWorkspaceToken(token: string, refreshToken: string | undefined, host: string): void {
  if (process.env.PLAUD_TOKEN) return;
  const path = authFilePath();
  const raw = JSON.parse(readFileSync(path, "utf8")) as AuthFile;
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...raw,
        token,
        host,
        workspace_id: raw.workspace_id ?? widFromJwt(token),
        minted_at: new Date().toISOString(),
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  try {
    chmodSync(path, 0o600);
  } catch {
    /* windows */
  }
}

async function remintWorkspace(auth: Auth): Promise<Auth | null> {
  if (!auth.userToken || !auth.workspaceId) return null;
  const path = `/user-app/auth/workspace/token/${encodeURIComponent(auth.workspaceId)}`;
  const res = await plaudFetch(`${auth.host}${path}`, {
    method: "POST",
    headers: { ...authHeader({ token: auth.userToken, host: auth.host }), "Content-Type": "application/json" },
    body: "{}",
  });
  const json = (await res.json()) as PlaudEnvelope<{
    workspace_token?: string;
    token?: string;
    access_token?: string;
    refresh_token?: string;
    workspace_refresh_token?: string;
  }>;
  const token = json.data?.workspace_token ?? json.data?.token ?? json.data?.access_token;
  if ((json.status !== 0 && json.status !== 200) || !token) return null;
  const refreshToken = json.data?.refresh_token ?? json.data?.workspace_refresh_token;
  persistWorkspaceToken(token, refreshToken, auth.host);
  return { ...auth, token };
}

function authHeader(auth: Auth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.token}`,
    "User-Agent": BROWSER_UA,
    Origin: "https://web.plaud.ai",
    Referer: "https://web.plaud.ai/",
    Accept: "application/json",
    "edit-from": "web",
    "app-platform": "web",
    "app-language": "en",
    timezone: "Asia/Manila",
  };
}

async function plaudApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  auth: Auth = loadAuth(),
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = { ...authHeader(auth) };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await plaudFetch(`${auth.host}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json()) as PlaudEnvelope<T>;
  if (json.status === -302) {
    const next = (json.data as { domains?: { api?: string } } | null)?.domains?.api;
    if (next) return plaudApi(path, init, { ...auth, host: next.replace(/\/$/, "") }, retried);
  }
  if (SESSION_DEAD.has(json.status) && !retried) {
    const fresh = await remintWorkspace(auth);
    if (fresh) {
      clearTokenDead();
      return plaudApi(path, init, fresh, true);
    }
    markTokenDead(`workspace token rejected (status ${json.status}) and cannot be reminted`);
  }
  if (json.status !== 0 && json.status !== 200) {
    throw new PlaudApiError(json.status, json.msg ?? "", path);
  }
  clearTokenDead();
  return json.data;
}

/** Some list endpoints put arrays on the envelope (`data_file_list`), not `data`. */
async function plaudEnvelope<T extends { status: number; msg?: string }>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  auth: Auth = loadAuth(),
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = { ...authHeader(auth) };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await plaudFetch(`${auth.host}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json()) as T & { data?: { domains?: { api?: string } } };
  if (json.status === -302) {
    const next = json.data?.domains?.api;
    if (next) return plaudEnvelope(path, init, { ...auth, host: next.replace(/\/$/, "") }, retried);
  }
  if (SESSION_DEAD.has(json.status) && !retried) {
    const fresh = await remintWorkspace(auth);
    if (fresh) {
      clearTokenDead();
      return plaudEnvelope(path, init, fresh, true);
    }
    markTokenDead(`workspace token rejected (status ${json.status}) and cannot be reminted`);
  }
  if (json.status !== 0 && json.status !== 200) {
    throw new PlaudApiError(json.status, json.msg ?? "", path);
  }
  clearTokenDead();
  return json;
}

const NOTE_TYPE = new Set(["auto_sum_note", "sum_multi_note", "consumer_note"]);

function item(detail: FileDetail): ContentItem[] {
  return [
    ...(detail.content_list ?? []),
    ...(detail.source_list ?? []),
    ...(detail.note_list ?? []),
    ...(detail.notes_list ?? []),
  ];
}

function noteContentOf(raw: string): string {
  let text = raw;
  try {
    const parsed = JSON.parse(raw) as { ai_content?: string };
    if (typeof parsed.ai_content === "string") text = parsed.ai_content;
  } catch {
    /* markdown */
  }
  // Plaud notes open with a decorative poster whose presigned URL expires.
  return text.replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function segment(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((seg): TranscriptSegment => {
      const s = (seg ?? {}) as Record<string, unknown>;
      const start = s.start_time ?? s.start;
      return {
        start_ms: typeof start === "number" ? start : undefined,
        speaker:
          typeof s.speaker === "string"
            ? s.speaker
            : typeof s.original_speaker === "string"
              ? s.original_speaker
              : undefined,
        text: typeof s.content === "string" ? s.content : typeof s.text === "string" ? s.text : "",
      };
    })
    .filter((s) => s.text.length > 0);
}

export function formatClock(ms: number | undefined): string {
  const total = Math.floor((ms ?? 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatTranscript(row: TranscriptSegment[]): string {
  return row
    .map((s) => {
      const who = s.speaker ? ` ${s.speaker}` : "";
      return `\`${formatClock(s.start_ms)}\`${who} — ${s.text.trim()}`;
    })
    .join("\n\n");
}

export function extractTranscript(detail: FileDetail): TranscriptSegment[] {
  const polish = item(detail).find((c) => c.data_type === "transaction_polish" && c.data_content);
  const rawItem = polish ?? item(detail).find((c) => c.data_type === "transaction" && c.data_content);
  if (rawItem?.data_content) {
    try {
      const parsed = segment(JSON.parse(rawItem.data_content));
      if (parsed.length) return parsed;
    } catch {
      /* fall through */
    }
  }
  const fromPolish = segment(detail.transaction_polish);
  if (fromPolish.length) return fromPolish;
  return segment(detail.trans_result);
}

export function extractNote(detail: FileDetail): string | null {
  for (const c of item(detail)) {
    if (!c.data_type || !NOTE_TYPE.has(c.data_type) || !c.data_content) continue;
    const content = noteContentOf(c.data_content).trim();
    if (content) return content;
  }
  return null;
}

export function noteId(detail: FileDetail): string[] {
  return item(detail)
    .filter((c) => c.data_type && NOTE_TYPE.has(c.data_type) && typeof c.data_id === "string")
    .map((c) => c.data_id as string);
}

export function parseShareKey(raw: string): string | null {
  const m = String(raw).match(/(?:\/s\/|\/nshare\/|\/share\/)([^/?#]+)/);
  const key = decodeURIComponent(m ? m[1] : String(raw)).trim();
  if (/^(pub_|pri_)[A-Za-z0-9._:-]+$/.test(key) && key.length > 8) return key;
  if (key.includes("::") && key.length > 8) return key;
  return null;
}

export function parseFileId(raw: string): string | null {
  const trimmed = String(raw).trim();
  if (/^[a-f0-9]{24,64}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

async function fetchLinked(url: string): Promise<string> {
  const res = await plaudFetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) throw new Error(`data_link fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf).toString("utf8");
  }
  return buf.toString("utf8");
}

async function hydrateDetail(detail: FileDetail): Promise<FileDetail> {
  const list = item(detail);
  await Promise.all(
    list.map(async (c) => {
      if (c.data_content || typeof c.data_link !== "string" || !c.data_link) return;
      try {
        c.data_content = await fetchLinked(c.data_link);
      } catch {
        /* extractor stays sync on whatever landed */
      }
    }),
  );
  return detail;
}

export async function getFileDetail(fileId: string): Promise<FileDetail> {
  const detail = await plaudApi<FileDetail>(`/file/detail/${fileId}`);
  return hydrateDetail(detail);
}

export async function createShareLink(fileId: string, noteIdList: string[] = []): Promise<string> {
  const data = await plaudApi<{ share_url?: string; share_key?: string }>("/share/public/create", {
    method: "POST",
    body: {
      object_id: fileId,
      object_type: "file",
      content_config: {
        audio: true,
        transcript: true,
        highlights: 0,
        overview: false,
        notes: noteIdList,
      },
    },
  });
  const url = data.share_url ?? "";
  if (!url.includes("::")) {
    throw new PlaudApiError(-1, `share_url missing or truncated: ${url}`, "/share/public/create");
  }
  return url;
}

type ShareAccess = {
  data_file?: FileDetail & {
    filename?: string;
    start_time?: number;
    duration?: number;
    notes_list?: ContentItem[];
    transaction_polish?: unknown;
    trans_result?: unknown;
  };
};

async function getShareAccess(shareKey: string): Promise<ShareAccess> {
  let host = "https://api.plaud.ai";
  for (let hop = 0; hop < 3; hop++) {
    const res = await plaudFetch(`${host}/share/access/${encodeURIComponent(shareKey)}`, {
      headers: {
        "User-Agent": BROWSER_UA,
        Origin: "https://web.plaud.ai",
        Referer: "https://web.plaud.ai/",
        Accept: "application/json",
      },
    });
    const json = (await res.json()) as PlaudEnvelope<ShareAccess> & ShareAccess & {
      data?: ShareAccess;
    };
    if (json.status === -302) {
      const next = (json.data as { domains?: { api?: string } } | undefined)?.domains?.api;
      if (next && next !== host) {
        host = next.replace(/\/$/, "");
        continue;
      }
    }
    if (json.status !== 0 && json.status !== 200) {
      throw new PlaudApiError(json.status, json.msg ?? "", "/share/access");
    }
    return (json.data ?? json) as ShareAccess;
  }
  throw new PlaudApiError(-302, "region bounce did not settle", "/share/access");
}

function recordedAtOf(detail: FileDetail): Date {
  const start = detail.start_time;
  if (typeof start === "number" && start > 0) {
    return new Date(start > 1e12 ? start : start * 1000);
  }
  return new Date();
}

function titleOf(detail: FileDetail, fallback: string): string {
  const name = detail.file_name ?? detail.filename;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

export function payloadFromDetail(detail: FileDetail, shareKey: string | null): PlaudPayload {
  const fileId = String(detail.file_id ?? detail.id ?? "").trim() || null;
  return {
    fileId,
    title: titleOf(detail, "Untitled meeting"),
    recordedAt: recordedAtOf(detail),
    transcript: formatTranscript(extractTranscript(detail)),
    summary: extractNote(detail),
    shareKey,
  };
}

export async function fetchPlaudFile(fileId: string): Promise<PlaudPayload> {
  const detail = await getFileDetail(fileId);
  let shareKey: string | null = null;
  try {
    shareKey = await createShareLink(fileId, noteId(detail));
  } catch {
    shareKey = null;
  }
  return payloadFromDetail({ ...detail, file_id: fileId }, shareKey);
}

export async function fetchPlaudShare(shareUrl: string): Promise<PlaudPayload> {
  const key = parseShareKey(shareUrl);
  if (!key) throw new PlaudApiError(-1, "unparseable share link", "/share/access");
  const access = await getShareAccess(key);
  const file = access.data_file;
  if (!file) throw new PlaudApiError(-1, "share had no data_file", "/share/access");
  const fromShare: FileDetail = {
    ...file,
    notes_list: file.notes_list,
    note_list: file.notes_list,
    transaction_polish: file.transaction_polish,
    trans_result: file.trans_result,
  };
  return payloadFromDetail(fromShare, key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapFileRow(raw: unknown): PlaudFile | null {
  const row = asRecord(raw);
  if (!row) return null;
  const fileId = String(row.id ?? row.file_id ?? row.fileId ?? "").trim();
  if (!fileId) return null;
  const name = String(row.filename ?? row.file_name ?? row.name ?? "Untitled").trim();
  const start = row.start_time ?? row.start_at ?? row.created_at;
  let startAt: string | null = null;
  if (typeof start === "number") {
    startAt = new Date(start > 1e12 ? start : start * 1000).toISOString();
  } else if (typeof start === "string" && start) {
    const d = new Date(start);
    startAt = Number.isNaN(d.getTime()) ? start : d.toISOString();
  }
  const duration = row.duration ?? row.duration_ms;
  const tagRaw = row.filetag_id_list;
  return {
    fileId,
    name,
    startAt,
    durationMillisecond: typeof duration === "number" ? duration : null,
    tagId: Array.isArray(tagRaw) ? tagRaw.map((id) => String(id)) : [],
  };
}

/** ADVO folder tag or the word "advo" in the recording name. */
export function isAdvoRecording(
  file: { name: string; tagId?: string[] },
  advoTagId: string | null,
): boolean {
  if (advoTagId && (file.tagId ?? []).some((id) => id === advoTagId)) return true;
  return /\badvo\b/i.test(file.name);
}

function fileFromData(data: unknown): PlaudFile[] {
  const rec = asRecord(data);
  const raw = Array.isArray(data)
    ? data
    : rec?.data_file_list ??
      rec?.file_list ??
      rec?.file_data ??
      rec?.list ??
      rec?.data ??
      rec?.file ??
      rec?.records;
  if (!Array.isArray(raw)) return [];
  return raw.map(mapFileRow).filter((f): f is PlaudFile => f != null);
}

type FileTag = { tagId: string; name: string };

type FileTagEnvelope = {
  status: number;
  msg?: string;
  data_filetag_list?: { id?: string; tag_id?: string; name?: string; tag_name?: string }[];
};

type FileListEnvelope = {
  status: number;
  msg?: string;
  data_file_list?: Record<string, unknown>[];
};

export async function listPlaudTag(): Promise<FileTag[]> {
  const envl = await plaudEnvelope<FileTagEnvelope>("/filetag/");
  return (envl.data_filetag_list ?? [])
    .map((t) => ({
      tagId: String(t.id ?? t.tag_id ?? ""),
      name: String(t.name ?? t.tag_name ?? ""),
    }))
    .filter((t) => t.tagId && t.name);
}

export function fileHasTag(raw: unknown, tagId: string): boolean {
  const row = asRecord(raw);
  if (!row) return false;
  const list = row.filetag_id_list;
  return Array.isArray(list) && list.some((id) => String(id) === tagId);
}

/** One bounded page of the recording list, newest first. */
async function listPage(skip: number, limit: number): Promise<Record<string, unknown>[]> {
  const envl = await plaudEnvelope<FileListEnvelope>(
    `/file/simple/web?skip=${skip}&limit=${limit}&is_trash=2&sort_by=start_time&is_desc=true`,
  );
  return envl.data_file_list ?? [];
}

/**
 * Walk bounded pages instead of pulling the whole account in one request.
 *
 * `stopAt` short-circuits the walk at the first already-seen file id. The list
 * is sorted start_time desc, so the first seen row means everything below it
 * has been processed already — the poll only ever needs the new head.
 */
async function walkFile(
  stopAt?: (file: PlaudFile) => boolean,
): Promise<{ file: PlaudFile[]; raw: Record<string, unknown>[] }> {
  const file: PlaudFile[] = [];
  const raw: Record<string, unknown>[] = [];

  for (let page = 0; page < LISTING_MAX_PAGE; page += 1) {
    const row = await listPage(page * LISTING_PAGE_SIZE, LISTING_PAGE_SIZE);
    if (row.length === 0) break;

    let isHalted = false;
    for (const one of row) {
      const mapped = mapFileRow(one);
      if (!mapped) continue;
      if (stopAt?.(mapped)) {
        isHalted = true;
        break;
      }
      file.push(mapped);
      raw.push(one);
    }
    if (isHalted || row.length < LISTING_PAGE_SIZE) break;
  }

  return { file, raw };
}

/**
 * List recordings. HAR 2026-08-15: GET /file/simple/web returns
 * `data_file_list` on the envelope. The ADVO "folder" is tag
 * `167d74e99a5f05affcd1e7ad8928edc4` (GET /filetag/).
 */
export async function listPlaudFile(query?: string): Promise<PlaudFile[]> {
  const walked = await walkFile();
  const raw = walked.raw;
  const needle = (query ?? "").trim();
  if (!needle) return walked.file;

  let tagId: string | null = /^[a-f0-9]{24,64}$/i.test(needle) ? needle.toLowerCase() : null;
  if (!tagId) {
    const tag = await listPlaudTag();
    const hit = tag.find((t) => t.name.toLowerCase() === needle.toLowerCase());
    tagId = hit?.tagId ?? null;
  }

  const filtered = tagId
    ? raw.filter((row) => fileHasTag(row, tagId as string))
    : raw.filter((row) => {
        const name = String(asRecord(row)?.filename ?? asRecord(row)?.file_name ?? "");
        return name.toLowerCase().includes(needle.toLowerCase());
      });
  return fileFromData(filtered);
}

/**
 * Every recording in the ADVO tag folder, plus any untitled-elsewhere file
 * named ADVO.
 *
 * `seenFileId` lets the poller stop the page walk at the first recording it has
 * already imported, so a steady-state tick reads one short page instead of the
 * whole account.
 */
export async function listAdvoFile(seenFileId?: ReadonlySet<string>): Promise<PlaudFile[]> {
  const walked = await walkFile(
    seenFileId && seenFileId.size > 0 ? (file) => seenFileId.has(file.fileId) : undefined,
  );
  if (walked.file.length === 0) return [];
  const tag = await listPlaudTag();
  const advoTagId = tag.find((t) => t.name.toLowerCase() === "advo")?.tagId ?? null;
  return walked.file.filter((file) => isAdvoRecording(file, advoTagId));
}
