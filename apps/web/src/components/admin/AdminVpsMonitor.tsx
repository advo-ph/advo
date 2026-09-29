import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cpu,
  Globe,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { get } from "@/lib/api";

type VpsRange = "1h" | "24h" | "7d";
type ServiceType = "pm2" | "container";

interface HistoryPoint {
  sampledAt: string;
  cpuPercent: number | null;
  memoryPercent: number;
  diskPercent: number;
  receivedBytesPerSecond: number;
  sentBytesPerSecond: number;
}

interface VpsService {
  name: string;
  type: ServiceType;
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
}

interface VpsWebsite {
  name: string;
  domains: string[];
  type: "proxy" | "static" | "redirect";
  serviceName: string | null;
  serviceType: ServiceType | null;
  status: string;
  tls: boolean;
  storageBytes: number | null;
  storageScanLimited: boolean;
  redirectedTo: string | null;
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
  services: VpsService[];
  websites: VpsWebsite[];
  capabilities: { pm2: boolean; docker: boolean; nginx: boolean };
}

interface VpsMonitorResponse {
  configured: boolean;
  state: "not_configured" | "online" | "degraded" | "unavailable";
  message: string | null;
  snapshot: VpsSnapshot | null;
  history: HistoryPoint[];
  historyPersistenceAvailable: boolean;
}

const ranges: Array<{ id: VpsRange; label: string }> = [
  { id: "1h", label: "1 hour" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
];

function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${Math.max(0, Math.round(value))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatRate(value: number): string {
  return `${formatBytes(value)}/s`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function meterColor(value: number): string {
  if (value >= 90) return "bg-destructive";
  if (value >= 75) return "bg-amber-500";
  return "bg-primary";
}

function statusLabel(status: string): string {
  if (status === "online") return "Running";
  if (status === "degraded") return "Degraded";
  if (status === "offline") return "Stopped";
  if (status === "configured") return "Configured";
  return "Unmapped";
}

function MetricMeter({ value, label }: { value: number; label: string }) {
  const shown = Number.isFinite(value) ? Math.max(0, value) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">{shown.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full transition-[width] ${meterColor(shown)}`} style={{ width: `${clampPercent(shown)}%` }} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  percent,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  percent?: number;
  icon: typeof Cpu;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
      {percent != null && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full ${meterColor(percent)}`} style={{ width: `${clampPercent(percent)}%` }} />
        </div>
      )}
    </section>
  );
}

function ResourceHistory({
  points,
  range,
}: {
  points: HistoryPoint[];
  range: VpsRange;
}) {
  if (!points.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
        Resource history will appear as the monitor collects its first samples.
      </div>
    );
  }

  const chartData = points.map((point) => ({
    ...point,
    label: new Date(point.sampledAt).toLocaleString(undefined, range === "7d"
      ? { month: "short", day: "numeric", hour: "numeric" }
      : { hour: "numeric", minute: "2-digit" }),
  }));

  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={32} />
          <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            formatter={(value: number, name: string) => [`${Number(value).toFixed(1)}%`, name]}
          />
          <Line name="CPU" type="monotone" dataKey="cpuPercent" stroke="#60a5fa" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, strokeWidth: 2 } : false} connectNulls />
          <Line name="Memory" type="monotone" dataKey="memoryPercent" stroke="#c084fc" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, strokeWidth: 2 } : false} />
          <Line name="Storage" type="monotone" dataKey="diskPercent" stroke="#34d399" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, strokeWidth: 2 } : false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const AdminVpsMonitor = () => {
  const [range, setRange] = useState<VpsRange>("24h");
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["vps-monitor", range],
    queryFn: async () => {
      const response = await get<VpsMonitorResponse>(`/api/vps-monitor?range=${range}`);
      if (response.error || !response.data) throw new Error(response.error || "VPS metrics are unavailable.");
      return response.data;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const snapshot = data?.snapshot ?? null;
  const host = snapshot?.host;
  const rootDisk = host?.disk;
  const freshTime = snapshot?.sampledAt
    ? formatDistanceToNow(new Date(snapshot.sampledAt), { addSuffix: true })
    : null;
  const services = [...(snapshot?.services || [])].sort((a, b) => {
    const statusOrder = (a.status === "online" ? 0 : 1) - (b.status === "online" ? 0 : 1);
    return statusOrder || b.memoryBytes - a.memoryBytes;
  });
  const websites = snapshot?.websites || [];

  if (isLoading && !data) {
    return (
      <div className="space-y-5">
        <div className="h-11 w-60 animate-pulse rounded bg-secondary/60" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-card" />)}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-card" />
      </div>
    );
  }

  if (data && !data.configured) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">VPS usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">Contabo server and deployed website resources</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="font-medium">Live monitoring is available on the production server</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{data.message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">VPS usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">Contabo server and deployed website resources</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Retry
          </Button>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-card p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <h2 className="font-medium">Could not read VPS statistics</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{data?.message || error?.message || "The API could not collect a server snapshot. Try again in a moment."}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const state = data?.state ?? "online";
  const hostName = host?.hostname || "Contabo VPS";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">VPS usage</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${state === "online" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
              {state === "online" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
              {state === "online" ? "Live" : "Last known data"}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{hostName}</span>
            <span aria-hidden="true">·</span>
            <span>{host?.operatingSystem} · {host?.cpuCores} vCPU</span>
            {freshTime && <><span aria-hidden="true">·</span><span>Updated {freshTime}</span></>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-2">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {data?.state === "degraded" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{data.message || "The latest check failed. Showing the most recent saved snapshot."}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CPU"
          value={host?.cpuPercent == null ? "Sampling" : `${host.cpuPercent.toFixed(1)}%`}
          detail={`${host?.cpuCores ?? 0} vCPU · load ${host?.loadAverage?.[0]?.toFixed(2) ?? "—"} / ${host?.loadAverage?.[1]?.toFixed(2) ?? "—"} / ${host?.loadAverage?.[2]?.toFixed(2) ?? "—"}`}
          percent={host?.cpuPercent ?? 0}
          icon={Cpu}
        />
        <StatCard
          label="Memory"
          value={`${formatBytes(host?.memory.usedBytes)} / ${formatBytes(host?.memory.totalBytes)}`}
          detail={`${formatBytes(host?.memory.availableBytes)} available · ${host?.memory.usedPercent?.toFixed(1) ?? "0.0"}% used`}
          percent={host?.memory.usedPercent ?? 0}
          icon={MemoryStick}
        />
        <StatCard
          label="Root storage"
          value={`${formatBytes(rootDisk?.usedBytes)} / ${formatBytes(rootDisk?.totalBytes)}`}
          detail={`${formatBytes(rootDisk?.availableBytes)} free · ${rootDisk?.usedPercent?.toFixed(1) ?? "0.0"}% used`}
          percent={rootDisk?.usedPercent ?? 0}
          icon={HardDrive}
        />
        <StatCard
          label="Network"
          value={`${formatRate(host?.network.receivedBytesPerSecond ?? 0)} ↓`}
          detail={`${formatRate(host?.network.sentBytesPerSecond ?? 0)} sent · ${host?.network.interfaceName || "interface unavailable"}`}
          icon={Activity}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Resource history</h2>
            <p className="mt-1 text-xs text-muted-foreground">CPU, memory, and disk usage over time</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1" aria-label="History range">
            {ranges.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={range === item.id}
                onClick={() => setRange(item.id)}
                className={`min-h-8 rounded-md px-2.5 text-xs transition-colors ${range === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <ResourceHistory points={data?.history || []} range={range} />
        {!data?.historyPersistenceAvailable && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Live metrics are available, but the API host could not save history for later visits.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Projects and services</h2>
            <p className="mt-1 text-xs text-muted-foreground">Live process and container usage · {services.length} workloads</p>
          </div>
          <p className="text-xs text-muted-foreground">Host uptime {formatDuration(host?.uptimeSeconds)}</p>
        </div>
        {services.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No PM2 processes or Docker containers were found.</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {services.map((service) => (
              <article key={`${service.type}-${service.name}`} className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      {service.type === "container" ? <Server className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{service.name}</h3>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {service.type === "container" ? service.image || "Docker container" : `PM2 · ${service.instanceCount} ${service.instanceCount === 1 ? "instance" : "instances"}`}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium ${service.status === "online" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : service.status === "degraded" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-border bg-secondary text-muted-foreground"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${service.status === "online" ? "bg-emerald-500" : service.status === "degraded" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                    {statusLabel(service.status)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <MetricMeter value={service.cpuPercent} label="CPU" />
                  <MetricMeter
                    value={service.memoryPercent}
                    label={`RAM · ${formatBytes(service.memoryBytes)}${service.memoryLimitBytes ? ` / ${formatBytes(service.memoryLimitBytes)}` : ""}`}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  {service.type === "pm2" && <span>{service.onlineInstances}/{service.instanceCount} online</span>}
                  {service.type === "pm2" && service.restartCount != null && <span>{service.restartCount} restarts</span>}
                  {service.type === "pm2" && service.uptimeSeconds != null && <span>Up {formatDuration(service.uptimeSeconds)}</span>}
                  {service.type === "container" && service.uptime && <span>{service.uptime}</span>}
                  {service.type === "container" && service.networkReceivedBytes != null && <span>Net {formatBytes(service.networkReceivedBytes)} in / {formatBytes(service.networkSentBytes)} out</span>}
                  {service.type === "container" && (service.blockReadBytes != null || service.blockWriteBytes != null) && <span>Disk I/O {formatBytes(service.blockReadBytes)} read / {formatBytes(service.blockWriteBytes)} written</span>}
                </div>
                {service.domains.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {service.domains.map((domain) => <span key={domain} className="max-w-full truncate rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{domain}</span>)}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Websites on this VPS</h2>
            <p className="mt-1 text-xs text-muted-foreground">Nginx domains matched to their app or static deployment · {websites.length} sites</p>
          </div>
          {host?.swap.totalBytes ? <p className="text-xs text-muted-foreground">Swap {formatBytes(host.swap.usedBytes)} / {formatBytes(host.swap.totalBytes)}</p> : null}
        </div>
        {!snapshot.capabilities.nginx && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Nginx site configuration was not available to the API process.</div>
        )}
        {websites.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No active Nginx websites were found.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_110px_120px] items-center gap-4 border-b border-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground md:grid">
              <span>Website</span><span>Project / service</span><span>Status</span><span className="text-right">Storage</span>
            </div>
            <div className="divide-y divide-border">
              {websites.map((website, index) => (
                <article key={`${website.name}-${website.domains.join(",")}-${index}`} className="grid gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_110px_120px] md:items-center md:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{website.domains[0]}</span>
                      {website.tls && <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">TLS</span>}
                    </div>
                    {website.domains.length > 1 && <p className="mt-1 truncate pl-5 text-xs text-muted-foreground">{website.domains.slice(1).join(" · ")}</p>}
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    {website.type === "static" ? <HardDrive className="h-3.5 w-3.5 shrink-0" /> : <Server className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{website.type === "redirect" ? `Redirect${website.redirectedTo ? ` → ${website.redirectedTo}` : ""}` : website.serviceName || website.name}</span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5">{website.type === "static" ? "Static" : website.type === "redirect" ? "Redirect" : website.serviceType === "container" ? "Docker" : "PM2 / proxy"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs md:text-sm">
                    <span className={`h-1.5 w-1.5 rounded-full ${website.status === "online" ? "bg-emerald-500" : website.status === "degraded" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                    <span>{statusLabel(website.status)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground md:justify-end md:text-sm">
                    <HardDrive className="h-3.5 w-3.5 md:hidden" />
                    {website.storageBytes == null ? (website.type === "proxy" && website.serviceName ? "App memory above" : "—") : formatBytes(website.storageBytes)}
                    {website.storageScanLimited && <span title="Storage scan reached its file limit">≈</span>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> 7-day history · 1-minute samples</span>
          {snapshot.capabilities.pm2 && <span>PM2 connected</span>}
          {snapshot.capabilities.docker && <span>Docker connected</span>}
          {snapshot.capabilities.nginx && <span>Nginx connected</span>}
        </div>
        {error && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><CircleAlert className="h-3.5 w-3.5" /> Refresh delayed</span>}
      </div>
    </div>
  );
};

export default AdminVpsMonitor;
