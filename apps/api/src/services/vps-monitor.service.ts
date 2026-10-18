import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../utils/env.js";

const SAMPLE_INTERVAL_MS = 60_000;
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const HELPER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../vps-snapshot.cjs");

export type VpsHistoryRange = "1h" | "24h" | "7d";

interface VpsHistoryPoint {
  sampledAt: string;
  cpuPercent: number | null;
  memoryPercent: number;
  diskPercent: number;
  receivedBytesPerSecond: number;
  sentBytesPerSecond: number;
}

interface VpsSnapshot {
  sampledAt: string;
  host: {
    hostname: string;
    operatingSystem: string;
    architecture: string;
    cpuCores: number;
    cpuPercent: number | null;
    loadAverage: number[];
    uptimeSeconds: number;
    memory: { usedBytes: number; totalBytes: number; availableBytes: number; usedPercent: number };
    swap: { usedBytes: number; totalBytes: number; usedPercent: number };
    disk: { mount: string; usedBytes: number; totalBytes: number; availableBytes: number; usedPercent: number };
    network: {
      interfaceName: string | null;
      receivedBytesPerSecond: number;
      sentBytesPerSecond: number;
      receivedBytes: number;
      sentBytes: number;
    };
  };
  services: Array<{
    name: string;
    type: "pm2" | "container";
    status: string;
    cpuPercent: number;
    memoryBytes: number;
    memoryLimitBytes?: number;
    memoryPercent: number;
    instanceCount: number;
    onlineInstances: number;
    restartCount: number | null;
    uptimeSeconds: number | null;
    domains: string[];
    image?: string;
    uptime?: string;
    networkReceivedBytes?: number;
    networkSentBytes?: number;
    blockReadBytes?: number;
    blockWriteBytes?: number;
  }>;
  websites: Array<{
    name: string;
    domains: string[];
    type: "proxy" | "static" | "redirect";
    serviceName: string | null;
    serviceType: "pm2" | "container" | null;
    status: string;
    tls: boolean;
    storageBytes: number | null;
    storageScanLimited: boolean;
    redirectedTo: string | null;
  }>;
  capabilities: { pm2: boolean; docker: boolean; nginx: boolean };
}

let latestSnapshot: VpsSnapshot | null = null;
let lastCollectionError: string | null = null;
let historyPoints: VpsHistoryPoint[] = [];
let historyLoaded = false;
let historyPersistenceAvailable = true;
let collectionInFlight: Promise<void> | null = null;
let scheduledCollection: ReturnType<typeof setTimeout> | null = null;
let monitorStarted = false;

function isConfigured(): boolean {
  const configuration = env();
  return configuration.NODE_ENV === "production" || Boolean(configuration.VPS_MONITOR_SSH_TARGET?.trim());
}

function sshTarget(): string | null {
  const target = env().VPS_MONITOR_SSH_TARGET?.trim();
  if (!target) return null;
  // SSH targets are configuration, never request input. Reject flags, shell syntax,
  // paths, and other forms that could become an option or a remote command.
  if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(target)) {
    throw new Error("VPS_MONITOR_SSH_TARGET must use user@host form.");
  }
  return target;
}

function historyPath(): string {
  const key = sshTarget() || "local-vps";
  const suffix = createHash("sha256").update(key).digest("hex").slice(0, 12);
  return resolve(process.cwd(), ".data", `vps-monitor-${suffix}.json`);
}

async function loadHistory(): Promise<void> {
  if (historyLoaded) return;
  historyLoaded = true;
  try {
    const saved = JSON.parse(await readFile(historyPath(), "utf8")) as unknown;
    if (Array.isArray(saved)) {
      historyPoints = saved.filter((point): point is VpsHistoryPoint => {
        if (!point || typeof point !== "object") return false;
        const candidate = point as Partial<VpsHistoryPoint>;
        return typeof candidate.sampledAt === "string"
          && typeof candidate.memoryPercent === "number"
          && typeof candidate.diskPercent === "number";
      });
    }
  } catch {
    // A first run has no history file yet. Invalid or missing data must not block live stats.
  }
  historyPoints = historyPoints.filter((point) => {
    const timestamp = Date.parse(point.sampledAt);
    return Number.isFinite(timestamp) && Date.now() - timestamp < HISTORY_RETENTION_MS;
  });
}

async function persistHistory(): Promise<void> {
  const destination = historyPath();
  const temporary = `${destination}.tmp`;
  try {
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify(historyPoints), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
    historyPersistenceAvailable = true;
  } catch {
    historyPersistenceAvailable = false;
  }
}

async function runCollector(): Promise<VpsSnapshot> {
  const script = await readFile(HELPER_PATH, "utf8");
  const target = sshTarget();
  const command = target ? "ssh" : process.execPath;
  const args = target
    ? ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=yes", target, "node"]
    : ["-"];

  return new Promise<VpsSnapshot>((resolveSnapshot, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let exceededOutputLimit = false;
    const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 2_000_000) {
        exceededOutputLimit = true;
        child.kill("SIGKILL");
      }
    });
    // SSH diagnostics can contain local usernames and key paths. Consume them without
    // putting the raw text in logs or API responses.
    child.stderr.on("data", () => undefined);
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("The VPS statistics collector could not start."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || exceededOutputLimit) {
        reject(new Error(target
          ? "Unable to reach the VPS over non-interactive SSH."
          : "Unable to read statistics from this server."));
        return;
      }
      try {
        resolveSnapshot(JSON.parse(stdout) as VpsSnapshot);
      } catch {
        reject(new Error("The VPS statistics collector returned an invalid response."));
      }
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(script);
  });
}

async function collect(): Promise<void> {
  if (collectionInFlight) return collectionInFlight;
  collectionInFlight = (async () => {
    await loadHistory();
    try {
      const snapshot = await runCollector();
      latestSnapshot = snapshot;
      lastCollectionError = null;
      const host = snapshot.host;
      historyPoints.push({
        sampledAt: snapshot.sampledAt,
        cpuPercent: host.cpuPercent,
        memoryPercent: host.memory.usedPercent,
        diskPercent: host.disk.usedPercent,
        receivedBytesPerSecond: host.network.receivedBytesPerSecond,
        sentBytesPerSecond: host.network.sentBytesPerSecond,
      });
      const cutoff = Date.now() - HISTORY_RETENTION_MS;
      historyPoints = historyPoints.filter((point) => Date.parse(point.sampledAt) >= cutoff);
      await persistHistory();
    } catch (error) {
      lastCollectionError = error instanceof Error ? error.message : "VPS snapshot failed.";
    }
  })().finally(() => {
    collectionInFlight = null;
  });
  return collectionInFlight;
}

function historyFor(range: VpsHistoryRange): VpsHistoryPoint[] {
  const duration = range === "1h" ? 60 * 60 * 1000 : range === "7d" ? HISTORY_RETENTION_MS : 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - duration;
  const visible = historyPoints.filter((point) => Date.parse(point.sampledAt) >= cutoff);
  if (range !== "7d") return visible;

  // Seven days at one minute resolution is too dense for a dashboard chart;
  // reduce to five-minute mean values while retaining the full saved history.
  const buckets = new Map<number, VpsHistoryPoint[]>();
  for (const point of visible) {
    const key = Math.floor(Date.parse(point.sampledAt) / (5 * 60 * 1000));
    const bucket = buckets.get(key) || [];
    bucket.push(point);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([key, points]) => {
    const average = (select: (point: VpsHistoryPoint) => number) =>
      points.reduce((sum, point) => sum + select(point), 0) / points.length;
    const cpuValues = points.flatMap((point) => point.cpuPercent === null ? [] : [point.cpuPercent]);
    return {
      sampledAt: new Date(key * 5 * 60 * 1000).toISOString(),
      cpuPercent: cpuValues.length ? Math.round(cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length * 10) / 10 : null,
      memoryPercent: Math.round(average((point) => point.memoryPercent) * 10) / 10,
      diskPercent: Math.round(average((point) => point.diskPercent) * 10) / 10,
      receivedBytesPerSecond: Math.round(average((point) => point.receivedBytesPerSecond)),
      sentBytesPerSecond: Math.round(average((point) => point.sentBytesPerSecond)),
    };
  });
}

export function startVpsMonitor(): void {
  if (!isConfigured() || monitorStarted) return;
  monitorStarted = true;

  const scheduleNext = () => {
    if (!monitorStarted) return;
    scheduledCollection = setTimeout(async () => {
      await collect();
      if (monitorStarted) scheduleNext();
    }, SAMPLE_INTERVAL_MS);
    scheduledCollection.unref?.();
  };

  void collect().finally(scheduleNext);
}

export function stopVpsMonitor(): void {
  monitorStarted = false;
  if (scheduledCollection) clearTimeout(scheduledCollection);
  scheduledCollection = null;
}

export async function getVpsMonitorStats(range: VpsHistoryRange) {
  if (!isConfigured()) {
    return {
      configured: false as const,
      state: "not_configured" as const,
      message: "VPS monitoring is enabled on the production API. Set VPS_MONITOR_SSH_TARGET=user@host to preview live VPS data from local development.",
      snapshot: null,
      history: [],
      historyPersistenceAvailable: false,
    };
  }

  await loadHistory();
  const latestAge = latestSnapshot ? Date.now() - Date.parse(latestSnapshot.sampledAt) : Infinity;
  if (!latestSnapshot || latestAge >= SAMPLE_INTERVAL_MS) await collect();

  const state = latestSnapshot ? lastCollectionError ? "degraded" : "online" : "unavailable";
  return {
    configured: true as const,
    state,
    message: lastCollectionError,
    snapshot: latestSnapshot,
    history: historyFor(range),
    historyPersistenceAvailable,
  };
}
