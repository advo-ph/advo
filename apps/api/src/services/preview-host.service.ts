/**
 * Preview hosting seam — who puts the build somewhere and returns a URL.
 *
 * The shipped "Show Client Now" flow (preview.service.ts + /api/preview/:token)
 * mints an expiring token for a preview_url *someone else* deployed. The
 * original ask was to deploy it. This file is the missing half: a named seam
 * with one adapter per provider, so host-agnosticism — the stated virtue of the
 * current design — survives contact with here.now.
 *
 * Two adapter exist:
 *
 *   manual   Today's behaviour, unchanged. The team pastes a preview_url onto
 *            the project and we hand it back. No network, no credential.
 *   herenow  Uploads a per-project build artifact and returns the URL here.now
 *            serves it from.
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
import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../utils/env.js";
import { PREVIEW_TTL_MINUTES } from "./preview.service.js";

export type PreviewHostProviderName = "manual" | "herenow";

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

// ─── selection + fallback ──

const providerByName: Record<PreviewHostProviderName, PreviewHostProvider> = {
  manual: manualProvider,
  herenow: herenowProvider,
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
