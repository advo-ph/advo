/**
 * Preview hosting seam — who puts the build somewhere and returns a URL.
 *
 * The shipped "Show Client Now" flow (preview.service.ts + /api/preview/:token)
 * mints an expiring token for a preview_url *someone else* deployed. The
 * original ask was to deploy it. This file is the missing half: a named seam
 * with one adapter per provider, so host-agnosticism — the stated virtue of the
 * current design — survives contact with here.now.
 *
 * Three adapter exist:
 *
 *   manual   Today's behaviour, unchanged. The team pastes a preview_url onto
 *            the project and we hand it back. No network, no credential.
 *   herenow  Uploads a per-project build artifact and returns the URL here.now
 *            serves it from.
 *   cloudflare  Uploads the same artifact to a Cloudflare Pages project and returns
 *            the per-deployment .pages.dev URL. The one deploying adapter whose
 *            credential ADVO can actually issue for itself.
 *
 * PREVIEW_HOST_PROVIDER selects between them and DEFAULTS to manual, so a
 * deploy that sets nothing behaves exactly as it does today. An adapter that is
 * named but not configured does not throw — it falls back to manual, because
 * production has no here.now key and must not lose a working feature to this
 * change.
 *
 * Credential status: there is no here.now API key on this machine and the
 * operator confirmed on 2026-08-23 they cannot supply one. The request shape
 * below is therefore written to here.now's documented deploy contract but has
 * never been exercised against a live account. Treat `herenowDeploy` as
 * unverified until someone runs it with a real key.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { HTTPException } from "hono/http-exception";
import { env } from "../utils/env.js";
import { PREVIEW_TTL_MINUTES } from "./preview.service.js";

export type PreviewHostProviderName = "manual" | "herenow" | "cloudflare";

export interface PreviewHostInput {
  projectId: number;
  /** The preview_url already stored on the project. The manual adapter's whole input. */
  pastedUrl?: string | null;
  /**
   * Directory holding the project's already-built static artifact. The roadmap
   * names per-project build artifacts as half the blocker, so this is required
   * rather than inferred: no adapter here runs a build, and none assumes one
   * has been run. Caller supplies the dist directory or the deploy is refused.
   */
  artifactDir?: string | null;
}

export interface PreviewHostResult {
  previewUrl: string;
  /** Which adapter actually produced the URL — after any fallback. */
  provider: PreviewHostProviderName;
  /** True when a provider was requested but manual answered instead. */
  fellBack: boolean;
  /** Operator-readable account of what happened, surfaced in the API response. */
  detail: string;
}

export interface PreviewHostProvider {
  name: PreviewHostProviderName;
  /** Whether this adapter has everything it needs to attempt a deploy. */
  isConfigured: () => boolean;
  /** Returns null when this adapter cannot answer; the caller degrades. */
  host: (input: PreviewHostInput) => Promise<PreviewHostResult | null>;
}

/** Recursively lists the artifact's file, relative to its root. Empty when absent. */
export function collectArtifactFile(artifactDir: string): string[] {
  const walk = (dir: string, prefix: string): string[] => {
    let entry: import("node:fs").Dirent[];
    try {
      entry = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entry.flatMap((e) => {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      return e.isDirectory() ? walk(join(dir, e.name), rel) : [rel];
    });
  };

  try {
    if (!statSync(artifactDir).isDirectory()) return [];
  } catch {
    return [];
  }
  return walk(artifactDir, "");
}

/**
 * Where a project's built artifact is expected to sit. A stated convention, not
 * a guess: the team drops the project's own build output here, and an adapter
 * that finds nothing declines rather than deploying an empty site.
 */
export function previewArtifactDir(projectId: number): string {
  return join(env().UPLOAD_DIR, "preview-artifact", `project-${projectId}`);
}

// ─── manual — the shipped behaviour, kept as an adapter ──

const manualProvider: PreviewHostProvider = {
  name: "manual",
  // Always available: it needs no credential, only a URL the team already pasted.
  isConfigured: () => true,
  host: async ({ pastedUrl }) => {
    const url = pastedUrl?.trim();
    if (!url) return null;
    return {
      previewUrl: url,
      provider: "manual",
      fellBack: false,
      detail: "Served the preview URL stored on the project.",
    };
  },
};

// ─── herenow — fresh ephemeral deploy ──

const HERENOW_DEFAULT_API = "https://api.here.now";

/**
 * Asked of the host so an orphaned build cannot outlive its link. The binding
 * guarantee is still the token expiry in preview.service.ts; this only keeps
 * the two in step.
 */
export const PREVIEW_HOST_TTL_MINUTE = PREVIEW_TTL_MINUTES;

const herenowProvider: PreviewHostProvider = {
  name: "herenow",
  isConfigured: () => Boolean(env().HERENOW_API_KEY),
  host: async ({ projectId, artifactDir }) => {
    const apiKey = env().HERENOW_API_KEY;
    if (!apiKey) return null;

    // The per-project build artifact question, answered rather than skipped:
    // this adapter uploads an ALREADY-BUILT static directory — a Vite `dist`, a
    // static export, whatever that project's own build emits. It does not run a
    // build and it does not assume one has been run. No artifact directory, or
    // an empty one, means no deploy: the caller degrades to manual rather than
    // publishing an empty site over a working pasted URL.
    if (!artifactDir) return null;
    const artifactFile = collectArtifactFile(artifactDir);
    if (artifactFile.length === 0) return null;

    const form = new FormData();
    form.set("projectId", String(projectId));
    form.set("ttlMinute", String(PREVIEW_HOST_TTL_MINUTE));
    for (const rel of artifactFile) {
      const buffer = await readFile(join(artifactDir, rel));
      form.append("file", new Blob([new Uint8Array(buffer)]), rel);
    }

    const base = (env().HERENOW_API_URL ?? HERENOW_DEFAULT_API).replace(/\/$/, "");
    const response = await fetch(`${base}/v1/deploy`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      console.error(
        `[preview-host] here.now deploy failed for project ${projectId}: ${response.status}`,
      );
      return null;
    }

    const payload = (await response.json()) as { url?: string };
    if (!payload.url) return null;

    return {
      previewUrl: payload.url,
      provider: "herenow",
      fellBack: false,
      detail: `Deployed ${artifactFile.length} artifact file to here.now.`,
    };
  },
};


// ─── cloudflare — Pages direct upload ──
//
// Why this adapter exists alongside herenow: the credential is obtainable. A Cloudflare
// API token is something ADVO can issue for itself today, where the here.now key was
// confirmed unavailable on 2026-08-23. That makes this the one deploying adapter with a
// realistic path to being exercised, so the seam stops being theoretical.
//
// The request targets Pages' documented Create Deployment endpoint:
//
//   POST /client/v4/accounts/{account_id}/pages/projects/{project}/deployments
//
// with the build sent as multipart form data. Each deployment returns its own immutable
// preview URL (https://<hash>.<project>.pages.dev), which is exactly the ephemeral-preview
// shape this seam wants — a new URL per deploy, no mutation of a previous one.
//
// ⚠️ UNVERIFIED, AND SAY SO. There is no Cloudflare token on this machine, so this has
// never run against a live account. The endpoint and the response shape are taken from
// Cloudflare's API documentation, not from a successful call. Two things follow:
//
//   1. `provider-credential-live` in bench/roadmap/preview-hosting STAYS RED. Do not stub
//      a token to turn it green — the check is asking whether this was ever really run.
//   2. Cloudflare's own supported direct-upload path is Wrangler, which negotiates a file
//      manifest (upload-token -> check-missing -> bulk upload -> deployment) rather than
//      posting every file inline. If the call below is rejected, that manifest flow is the
//      reason, and the fallback is the CLI:
//
//        CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… \
//          npx wrangler pages deploy <artifactDir> --project-name=<project>
//
// The error body is logged verbatim rather than swallowed, because Cloudflare returns a
// structured {errors:[{code,message}]} and that message is what tells the operator whether
// the problem is the token scope, the project name, or the request shape.

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

interface CloudflareDeployResponse {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: { url?: string; id?: string };
}

const cloudflareProvider: PreviewHostProvider = {
  name: "cloudflare",
  isConfigured: () =>
    Boolean(
      env().CLOUDFLARE_ACCOUNT_ID &&
        env().CLOUDFLARE_API_TOKEN &&
        env().CLOUDFLARE_PAGES_PROJECT,
    ),
  host: async ({ projectId, artifactDir }) => {
    const accountId = env().CLOUDFLARE_ACCOUNT_ID;
    const apiToken = env().CLOUDFLARE_API_TOKEN;
    const pagesProject = env().CLOUDFLARE_PAGES_PROJECT;
    if (!accountId || !apiToken || !pagesProject) return null;

    // Same contract as herenow: this adapter DEPLOYS an already-built directory. It does
    // not run a build. Nothing to deploy means decline, so the caller degrades to manual
    // rather than publishing an empty site over a working pasted URL.
    if (!artifactDir) return null;
    const artifactFile = collectArtifactFile(artifactDir);
    if (artifactFile.length === 0) return null;

    const form = new FormData();
    for (const rel of artifactFile) {
      const buffer = await readFile(join(artifactDir, rel));
      // The entry name carries the path relative to the build root — the same convention
      // POST /api/projects/:id/preview-artifact accepts on the way in.
      form.append("file", new Blob([new Uint8Array(buffer)]), rel);
    }

    const response = await fetch(
      `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${pagesProject}/deployments`,
      { method: "POST", headers: { authorization: `Bearer ${apiToken}` }, body: form },
    );

    const payload = (await response.json().catch(() => null)) as CloudflareDeployResponse | null;

    if (!response.ok || payload?.success === false) {
      const detail =
        payload?.errors?.map((e) => `${e.code ?? "?"}: ${e.message ?? "?"}`).join("; ") ??
        `HTTP ${response.status}`;
      console.error(
        `[preview-host] cloudflare deploy failed for project ${projectId} — ${detail}. ` +
          "If this is a request-shape rejection, use `npx wrangler pages deploy` (see the adapter header).",
      );
      return null;
    }

    const url = payload?.result?.url;
    if (!url) {
      console.error(
        `[preview-host] cloudflare returned no deployment URL for project ${projectId}.`,
      );
      return null;
    }

    return {
      previewUrl: url,
      provider: "cloudflare",
      fellBack: false,
      detail: `Deployed ${artifactFile.length} artifact file to Cloudflare Pages project ${pagesProject}.`,
    };
  },
};

// ─── selection + fallback ──

const providerByName: Record<PreviewHostProviderName, PreviewHostProvider> = {
  manual: manualProvider,
  herenow: herenowProvider,
  cloudflare: cloudflareProvider,
};

/** The configured provider name. Defaults to manual on an unset or unknown value. */
export function activeProviderName(): PreviewHostProviderName {
  const configured = env().PREVIEW_HOST_PROVIDER;
  return configured in providerByName ? (configured as PreviewHostProviderName) : "manual";
}

/**
 * Resolves a preview URL through the configured provider, degrading to manual
 * whenever that provider is unconfigured, declines, or throws. Returns null
 * only when manual itself has nothing — no preview_url stored on the project,
 * which is the same 400 the endpoint has always returned.
 */
export async function hostPreview(input: PreviewHostInput): Promise<PreviewHostResult | null> {
  const name = activeProviderName();

  if (name === "manual") return manualProvider.host(input);

  const provider = providerByName[name];
  if (!provider.isConfigured()) {
    console.warn(
      `[preview-host] PREVIEW_HOST_PROVIDER=${name} is not configured; falling back to manual.`,
    );
  } else {
    const hosted = await provider.host(input).catch((error: unknown) => {
      console.error(`[preview-host] ${name} threw; falling back to manual.`, error);
      return null;
    });
    if (hosted) return hosted;
  }

  const fallback = await manualProvider.host(input);
  if (!fallback) return null;
  return { ...fallback, fellBack: true, detail: `${fallback.detail} (${name} unavailable)` };
}

// ─── artifact intake ─────────────────────────────────
//
// The half that was missing. `previewArtifactDir` named where a build should sit and
// nothing in the repo ever put one there, so every deploying adapter declined and the
// seam sat inert. This is how a built `dist` arrives.
//
// NO ZIP, DELIBERATELY. Extracting an archive server-side means a new dependency and a
// zip-slip surface to get wrong; instead the client sends the files it already has, each
// multipart entry named with its path relative to the build root. That is the exact shape
// the herenow adapter already uses to send them back out, so intake and egress agree.
//
// EVERY PATH IS UNTRUSTED. The entry name comes from a browser or a CLI on someone else's
// machine, so it is validated rather than sanitized — a name that is not obviously safe is
// REFUSED, never repaired into something that looks safe.

/** Hard ceilings, so one upload cannot fill the disk or the inode table. */
export const PREVIEW_ARTIFACT_MAX_FILE_COUNT = 2000;
export const PREVIEW_ARTIFACT_MAX_TOTAL_BYTE = 200 * 1024 * 1024;

/**
 * Validate one relative path from an upload.
 *
 * Returns the normalized POSIX-relative path, or null when the entry must be refused.
 * Refusal cases, each of which is a real escape attempt or a thing we cannot store:
 * absolute paths, Windows drive letters, UNC paths, any `..` segment, and NUL bytes.
 */
export function safeArtifactPath(rawName: string): string | null {
  if (!rawName) return null;
  if (rawName.includes("\0")) return null;

  // A Windows client sends backslashes; normalize the separator BEFORE inspecting
  // segments, or `..\\evil` walks straight past a check that only knows about `/`.
  const normalized = rawName.replace(/\\/g, "/").replace(/^\.\//, "");

  if (normalized.startsWith("/")) return null; // absolute
  if (/^[a-zA-Z]:/.test(normalized)) return null; // C:\...
  if (normalized.startsWith("//")) return null; // UNC

  const segment = normalized.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segment.length === 0) return null;
  // `..` anywhere, not just leading — `a/../../b` escapes just as well.
  if (segment.some((s) => s === "..")) return null;

  return segment.join("/");
}

export interface PreviewArtifactEntry {
  /** Path relative to the build root, e.g. "assets/index-abc.js". */
  path: string;
  byte: Uint8Array;
}

export interface PreviewArtifactWriteResult {
  fileCount: number;
  totalByte: number;
  /** True when a previous artifact was replaced rather than this being the first. */
  isReplaced: boolean;
}

/**
 * Write a project's artifact, replacing any previous one ATOMICALLY.
 *
 * Files land in a staging directory and the swap happens only once every byte is written,
 * so a failed or partial upload never leaves a half-built site where an adapter would
 * happily deploy it. Same reason deploy.sh stages the web bundle before moving it.
 */
export async function writePreviewArtifact(
  projectId: number,
  entry: PreviewArtifactEntry[],
): Promise<PreviewArtifactWriteResult> {
  if (entry.length === 0) {
    throw new HTTPException(400, {
      message: "No files in the upload. An empty artifact would deploy an empty site.",
    });
  }
  if (entry.length > PREVIEW_ARTIFACT_MAX_FILE_COUNT) {
    throw new HTTPException(413, {
      message: `Artifact has ${entry.length} files; the limit is ${PREVIEW_ARTIFACT_MAX_FILE_COUNT}.`,
    });
  }

  const totalByte = entry.reduce((sum, e) => sum + e.byte.byteLength, 0);
  if (totalByte > PREVIEW_ARTIFACT_MAX_TOTAL_BYTE) {
    throw new HTTPException(413, {
      message: `Artifact is ${Math.round(totalByte / 1024 / 1024)}MB; the limit is ${Math.round(
        PREVIEW_ARTIFACT_MAX_TOTAL_BYTE / 1024 / 1024,
      )}MB.`,
    });
  }

  // A build with no entry point is almost always a wrong-directory mistake (the repo root
  // instead of dist/). Caught here because the alternative is a client shown a 404.
  const hasEntryPoint = entry.some((e) => e.path === "index.html");
  if (!hasEntryPoint) {
    throw new HTTPException(400, {
      message:
        "No index.html at the artifact root. Upload the contents of the build output directory (dist/), not the directory itself.",
    });
  }

  const finalDir = previewArtifactDir(projectId);
  const stageDir = `${finalDir}.new`;
  const oldDir = `${finalDir}.old`;

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  for (const e of entry) {
    const destination = join(stageDir, e.path);
    // Belt and braces: even with safeArtifactPath, assert the resolved destination is
    // still inside the staging dir. Cheap, and the one check that survives a future
    // refactor of the validator.
    const relative = resolve(destination).slice(resolve(stageDir).length);
    if (!resolve(destination).startsWith(resolve(stageDir)) || relative.includes("..")) {
      await rm(stageDir, { recursive: true, force: true });
      throw new HTTPException(400, { message: `Refused path: ${e.path}` });
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, e.byte);
  }

  const isReplaced = existsSync(finalDir);
  await rm(oldDir, { recursive: true, force: true });
  if (isReplaced) await rename(finalDir, oldDir);
  await rename(stageDir, finalDir);
  await rm(oldDir, { recursive: true, force: true });

  return { fileCount: entry.length, totalByte, isReplaced };
}
