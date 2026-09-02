/**
 * External connectors — Figma, Google Drive, Google Calendar.
 *
 * READ-THROUGH ONLY, and that is the whole design. None of these adapters writes to the
 * remote service, and none of them copies remote data into a table here. There is no
 * migration behind this file.
 *
 * That restraint is deliberate and worth stating, because the obvious next step —
 * "sync Figma frames into project_asset", "mirror the Drive folder" — is how integrations
 * become the most expensive thing in a codebase. A mirror needs a sync schedule, a
 * conflict policy, a deletion policy, and a story for what happens when the remote token
 * is revoked. A read-through needs a token and a fetch. When the token is missing, a
 * read-through degrades to "not configured"; a stale mirror degrades to showing a client
 * a design that was deleted last week, and nobody notices.
 *
 * If a durable record is genuinely needed later, this repo already has `project_asset`
 * and `library_item` to put it in, and the decision to copy should be made once, on
 * purpose, rather than inherited from an integration written on a Tuesday.
 *
 * ─── The three, and what each answers ─────────────────────────────────────────
 *
 *   figma     "What does the design look like right now?" A project in design has
 *             nothing to show a client — preview.service.ts covers deployed builds, and
 *             a Figma file is what exists before there is a build.
 *   drive     "Where are the client's documents?" files.routes.ts handles uploads to
 *             ADVO's own disk; Drive is where a PH SMB client actually keeps things, and
 *             asking them to re-upload is asking them to do work twice.
 *   calendar  "When is this person actually unavailable?" availability_block is typed in
 *             by hand, and "pre-fi to finals szn" cost roughly two weeks of throughput
 *             that nobody had entered in advance.
 *
 * ─── Honest degradation, and one specific trap ────────────────────────────────
 *
 * Every adapter returns a `ConnectorResult` carrying `isConfigured`. An unconfigured
 * connector returns an empty list with a reason — never a throw, and never fabricated
 * sample data. The UI renders the reason.
 *
 * The trap this file exists to avoid, learned from `VITE_GITHUB_TOKEN` (audit item S4):
 * these tokens are read SERVER-SIDE ONLY. A Figma PAT or a Google service-account key in
 * a `VITE_` variable is compiled into the browser bundle and readable by anyone who
 * opens devtools. S4 was exactly that bug, with GitHub and Cloudflare tokens, and it
 * shipped to production. Nothing here is prefixed `VITE_`, and the bench asserts it.
 *
 * ─── Credential status ────────────────────────────────────────────────────────
 *
 * None of FIGMA_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON exists on this machine or in prod as
 * of 2026-09-02. Every request shape below is written to the provider's documented API
 * and has NOT been exercised against a live account — the same honesty
 * preview-host.service.ts carries about here.now. The pure parts (URL parsing, the
 * degradation contract, response normalization) ARE covered by connector.test.ts.
 */
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("connector");

export const CONNECTOR_NAME = ["figma", "drive", "calendar"] as const;
export type ConnectorName = (typeof CONNECTOR_NAME)[number];

/**
 * The one shape every connector returns.
 *
 * `item` is ALWAYS an array — empty when unconfigured, empty when the remote has nothing.
 * A caller never has to distinguish null from [] from undefined, which is the difference
 * between a UI that renders an empty state and one that renders `undefined`.
 */
export interface ConnectorResult<T> {
  connector: ConnectorName;
  isConfigured: boolean;
  item: T[];
  /** Operator-readable. Rendered directly when isConfigured is false. */
  detail: string;
}

function notConfigured<T>(connector: ConnectorName, missing: string): ConnectorResult<T> {
  return {
    connector,
    isConfigured: false,
    item: [],
    detail: `${connector} is not configured — set ${missing}. Nothing was fetched.`,
  };
}

// ─── Figma ───────────────────────────────────────────

export interface FigmaFrame {
  nodeId: string;
  name: string;
  /** A Figma-hosted render URL. Expires — see the note on renderExpiry below. */
  imageUrl: string | null;
  /** Deep link that opens the frame in Figma for whoever has access. */
  figmaUrl: string;
}

/**
 * Pull a file key out of any Figma URL shape.
 *
 * Figma has used `/file/`, `/design/` and `/proto/` over the years and all three are
 * still in circulation in old links. A parser that knows only `/file/` silently returns
 * null for a URL someone pasted last week, and the UI reports "not configured" for what
 * is actually a parsing failure — two different problems wearing the same message.
 */
export function parseFigmaFileKey(url: string): string | null {
  const match = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/.exec(url);
  return match ? match[1] : null;
}

/**
 * Figma's render URLs expire (roughly 30 days, undocumented and not guaranteed).
 *
 * Recorded here because it is the reason nothing stores them: a cached Figma image URL
 * becomes a broken image in a client's Hub weeks later, with no error anywhere to explain
 * it. Read-through means the URL is always minted fresh.
 */
export const FIGMA_RENDER_URL_IS_EPHEMERAL = true;

export async function listFigmaFrame(fileUrl: string): Promise<ConnectorResult<FigmaFrame>> {
  const token = env().FIGMA_TOKEN;
  if (!token) return notConfigured("figma", "FIGMA_TOKEN");

  const fileKey = parseFigmaFileKey(fileUrl);
  if (!fileKey) {
    return {
      connector: "figma",
      isConfigured: true,
      item: [],
      detail: `"${fileUrl}" is not a Figma file URL. Expected figma.com/file|design|proto/<key>/…`,
    };
  }

  const res = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=2`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    return {
      connector: "figma",
      isConfigured: true,
      item: [],
      detail: `Figma ${res.status}: ${(await res.text()).slice(0, 300)}`,
    };
  }

  const json = (await res.json()) as {
    document?: { children?: Array<{ children?: Array<{ id?: string; name?: string; type?: string }> }> };
  };

  // Top-level FRAMEs on each page. Deliberately not every node: a real design file has
  // thousands, and a client does not want to scroll a component library.
  const node: Array<{ id: string; name: string }> = [];
  for (const page of json.document?.children ?? []) {
    for (const child of page.children ?? []) {
      if (child.type === "FRAME" && child.id && child.name) {
        node.push({ id: child.id, name: child.name });
      }
    }
  }

  if (node.length === 0) {
    return {
      connector: "figma",
      isConfigured: true,
      item: [],
      detail: "No top-level frames in that Figma file.",
    };
  }

  // One batched render call, not one per frame. Figma rate-limits per token, and a file
  // with 40 frames would otherwise be 40 requests for one page load.
  const imageRes = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${node.map((n) => encodeURIComponent(n.id)).join(",")}&format=png&scale=1`,
    { headers: { "X-Figma-Token": token } },
  );
  const imageJson = imageRes.ok
    ? ((await imageRes.json()) as { images?: Record<string, string | null> })
    : { images: {} };

  return {
    connector: "figma",
    isConfigured: true,
    item: node.map((one) => ({
      nodeId: one.id,
      name: one.name,
      imageUrl: imageJson.images?.[one.id] ?? null,
      figmaUrl: `https://www.figma.com/design/${fileKey}/?node-id=${encodeURIComponent(one.id)}`,
    })),
    detail: `${node.length} frame(s) from Figma.`,
  };
}

// ─── Google (Drive + Calendar) ───────────────────────

/**
 * Google auth here is a SERVICE ACCOUNT, not OAuth.
 *
 * OAuth would mean a per-user consent flow, refresh-token storage, and a re-consent path
 * when a token is revoked — three stateful things for a read-only listing. A service
 * account is one JSON key, and the client shares the specific folder or calendar with
 * that account's email address, which is a thing a non-technical person can actually do
 * and, importantly, can UNDO without involving ADVO.
 *
 * The narrower grant is also the safer one: the service account sees exactly what was
 * shared with it, whereas an OAuth grant sees everything the person can see.
 */
export interface GoogleCredential {
  clientEmail: string;
  privateKey: string;
}

/**
 * Parse GOOGLE_SERVICE_ACCOUNT_JSON.
 *
 * Returns null rather than throwing on anything malformed: a bad key must degrade the
 * connector to "not configured", not crash the request that happened to touch it.
 *
 * The `\n` replacement is not optional. A service-account private key is multi-line, and
 * every method of getting one into an env var — .env files, PM2 ecosystem configs, CI
 * secret stores — escapes the newlines. Without this the key parses as JSON and then
 * fails to sign, with an error that says nothing useful.
 */
export function parseGoogleCredential(raw: string | undefined): GoogleCredential | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!json.client_email || !json.private_key) return null;
    return {
      clientEmail: json.client_email,
      privateKey: json.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

export interface DriveFile {
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  modifiedAt: string | null;
  /** Bytes. Null for Google-native docs, which genuinely have no size. */
  sizeByte: number | null;
}

/**
 * Pull a folder id out of a Drive URL.
 *
 * A client will paste the URL from their browser bar, not a bare id, and that URL has a
 * `?usp=sharing` tail on it every time.
 */
export function parseDriveFolderId(url: string): string | null {
  const folder = /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/.exec(url);
  if (folder) return folder[1];
  const open = /drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/.exec(url);
  if (open) return open[1];
  // Already a bare id.
  if (/^[A-Za-z0-9_-]{10,}$/.test(url.trim())) return url.trim();
  return null;
}

export interface CalendarEventItem {
  eventId: string;
  summary: string;
  startAt: string | null;
  endAt: string | null;
  /** True for an all-day event, which Google reports as a date with no time. */
  isAllDay: boolean;
}

/**
 * Normalize a Google Calendar event.
 *
 * All-day events arrive as `{ date: "2026-09-02" }` and timed ones as
 * `{ dateTime: "2026-09-02T09:00:00+08:00" }`. Treating a `date` as a `dateTime` puts an
 * all-day block at midnight UTC — which in Manila is 8am the SAME day, so a member's
 * whole-day unavailability silently becomes a morning meeting. That is precisely the
 * class of error the school-blackout calendar exists to prevent.
 */
export function normalizeCalendarEvent(raw: unknown): CalendarEventItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const one = raw as {
    id?: string;
    summary?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
  };
  if (!one.id) return null;

  const isAllDay = !!one.start?.date && !one.start?.dateTime;

  return {
    eventId: one.id,
    summary: one.summary ?? "(no title)",
    startAt: one.start?.dateTime ?? one.start?.date ?? null,
    endAt: one.end?.dateTime ?? one.end?.date ?? null,
    isAllDay,
  };
}

/**
 * Mint a Google access token from the service-account key.
 *
 * Signs a JWT assertion and exchanges it at the token endpoint. Uses node's built-in
 * crypto rather than googleapis — the dependency is large, and this is one signature and
 * one POST.
 */
async function googleAccessToken(scope: string): Promise<string | null> {
  const credential = parseGoogleCredential(env().GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!credential) return null;

  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const base64Url = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const unsigned = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url({
    iss: credential.clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(credential.privateKey, "base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    log.warn({ status: res.status }, "google token exchange failed");
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export async function listDriveFile(folderUrl: string): Promise<ConnectorResult<DriveFile>> {
  if (!env().GOOGLE_SERVICE_ACCOUNT_JSON) {
    return notConfigured("drive", "GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const folderId = parseDriveFolderId(folderUrl);
  if (!folderId) {
    return {
      connector: "drive",
      isConfigured: true,
      item: [],
      detail: `"${folderUrl}" is not a Drive folder URL or id.`,
    };
  }

  const token = await googleAccessToken("https://www.googleapis.com/auth/drive.readonly");
  if (!token) {
    return {
      connector: "drive",
      isConfigured: false,
      item: [],
      detail: "GOOGLE_SERVICE_ACCOUNT_JSON is set but did not yield an access token — check the key and that the Drive API is enabled.",
    };
  }

  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,webViewLink,modifiedTime,size)&pageSize=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    return {
      connector: "drive",
      isConfigured: true,
      item: [],
      // A 404 here almost always means the folder was never shared with the service
      // account, which is the single most common setup mistake — so it gets named.
      detail:
        res.status === 404
          ? `Drive returned 404. The folder is probably not shared with the service account. Share it with the client_email in GOOGLE_SERVICE_ACCOUNT_JSON.`
          : `Drive ${res.status}: ${body.slice(0, 300)}`,
    };
  }

  const json = (await res.json()) as {
    files?: Array<{
      id?: string;
      name?: string;
      mimeType?: string;
      webViewLink?: string;
      modifiedTime?: string;
      size?: string;
    }>;
  };

  const item: DriveFile[] = (json.files ?? [])
    .filter((one): one is { id: string; name: string; mimeType: string } & typeof one =>
      !!one.id && !!one.name && !!one.mimeType,
    )
    .map((one) => ({
      fileId: one.id,
      name: one.name,
      mimeType: one.mimeType,
      webViewLink: one.webViewLink ?? null,
      modifiedAt: one.modifiedTime ?? null,
      // Google-native docs report no size at all — null, not 0. Zero would render as an
      // empty file in a UI that shows sizes.
      sizeByte: one.size ? Number(one.size) : null,
    }));

  return {
    connector: "drive",
    isConfigured: true,
    item,
    detail: `${item.length} file(s) in that Drive folder.`,
  };
}

export async function listCalendarEvent(
  calendarId: string,
  fromAt: Date,
  toAt: Date,
): Promise<ConnectorResult<CalendarEventItem>> {
  if (!env().GOOGLE_SERVICE_ACCOUNT_JSON) {
    return notConfigured("calendar", "GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const token = await googleAccessToken("https://www.googleapis.com/auth/calendar.readonly");
  if (!token) {
    return {
      connector: "calendar",
      isConfigured: false,
      item: [],
      detail: "GOOGLE_SERVICE_ACCOUNT_JSON is set but did not yield an access token — check the key and that the Calendar API is enabled.",
    };
  }

  const parameter = new URLSearchParams({
    timeMin: fromAt.toISOString(),
    timeMax: toAt.toISOString(),
    // Recurring events expanded into instances. Without this a weekly class arrives as
    // ONE event with a recurrence rule, and the blackout calendar shows a single block.
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${parameter}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    return {
      connector: "calendar",
      isConfigured: true,
      item: [],
      detail:
        res.status === 404
          ? `Calendar returned 404. It is probably not shared with the service account. Share it with the client_email in GOOGLE_SERVICE_ACCOUNT_JSON.`
          : `Calendar ${res.status}: ${body.slice(0, 300)}`,
    };
  }

  const json = (await res.json()) as { items?: unknown[] };
  const item = (json.items ?? [])
    .map(normalizeCalendarEvent)
    .filter((one): one is CalendarEventItem => one !== null);

  return {
    connector: "calendar",
    isConfigured: true,
    item,
    detail: `${item.length} event(s) in that window.`,
  };
}

/** Which connectors have credentials. Rendered as a status strip in admin. */
export function connectorStatus(): Array<{ connector: ConnectorName; isConfigured: boolean }> {
  const e = env();
  const hasGoogle = !!parseGoogleCredential(e.GOOGLE_SERVICE_ACCOUNT_JSON);
  return [
    { connector: "figma", isConfigured: !!e.FIGMA_TOKEN },
    { connector: "drive", isConfigured: hasGoogle },
    { connector: "calendar", isConfigured: hasGoogle },
  ];
}
