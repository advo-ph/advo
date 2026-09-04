import { readFile, writeFile, mkdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("screenshot");

const MSHOTS_BASE = "https://s0.wp.com/mshots/v1";
const MIN_REAL_BYTES = 15_000;

function dir(): string {
  return path.join(env().UPLOAD_DIR, "screenshots");
}

function filePath(projectId: number): string {
  return path.join(dir(), `project-${projectId}.png`);
}

export function screenshotPublicUrl(projectId: number): string {
  return `/uploads/screenshots/project-${projectId}.png`;
}

export async function hasCachedScreenshot(projectId: number): Promise<boolean> {
  try {
    await stat(filePath(projectId));
    return true;
  } catch {
    return false;
  }
}

export async function generateScreenshot(
  projectId: number,
  url: string,
): Promise<boolean> {
  if (await hasCachedScreenshot(projectId)) return true;

  try {
    const mshots = `${MSHOTS_BASE}/${encodeURIComponent(url)}?w=1200&h=900`;
    const res = await fetch(mshots);
    if (!res.ok) return false;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_REAL_BYTES) return false;

    await mkdir(dir(), { recursive: true });
    await writeFile(filePath(projectId), buf);
    log.info({ projectId, bytes: buf.length }, "screenshot cached");
    return true;
  } catch (err) {
    log.error({ projectId, err }, "mshots fetch failed");
    return false;
  }
}

export async function clearScreenshotCache(projectId: number): Promise<void> {
  try {
    await unlink(filePath(projectId));
    log.info({ projectId }, "screenshot cache cleared");
  } catch {
    // file did not exist
  }
}
