/*
 * Standalone Linux snapshot collector. The API runs this file locally, or sends
 * its source over an existing non-interactive SSH connection for local preview.
 * Only explicitly selected monitoring fields are written to stdout.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function readCpuCounters() {
  try {
    const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
    const values = line.trim().split(/\s+/).slice(1).map(number);
    return {
      total: values.reduce((sum, value) => sum + value, 0),
      idle: (values[3] || 0) + (values[4] || 0),
    };
  } catch {
    return null;
  }
}

function readNetworkCounters() {
  try {
    const interfaces = new Map();
    for (const line of fs.readFileSync("/proc/net/dev", "utf8").split("\n").slice(2)) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const name = line.slice(0, colon).trim();
      const values = line.slice(colon + 1).trim().split(/\s+/).map(number);
      interfaces.set(name, { received: values[0] || 0, sent: values[8] || 0 });
    }

    let selected = null;
    try {
      const route = fs.readFileSync("/proc/net/route", "utf8").split("\n").slice(1)
        .find((line) => {
          const fields = line.trim().split(/\s+/);
          return fields[1] === "00000000" && (parseInt(fields[3] || "0", 16) & 1) === 1;
        });
      selected = route?.trim().split(/\s+/)[0] || null;
    } catch {}

    if (selected && interfaces.has(selected)) {
      return { interfaceName: selected, ...interfaces.get(selected) };
    }

    const physical = [...interfaces.entries()].filter(([name]) =>
      name !== "lo" && !/^(docker|br-|veth|virbr|cni|flannel|tun|tap)/.test(name),
    );
    if (!physical.length) return { interfaceName: null, received: 0, sent: 0 };
    return physical.reduce((sum, [name, counters]) => ({
      interfaceName: sum.interfaceName || name,
      received: sum.received + counters.received,
      sent: sum.sent + counters.sent,
    }), { interfaceName: null, received: 0, sent: 0 });
  } catch {
    return { interfaceName: null, received: 0, sent: 0 };
  }
}

function readMeminfo() {
  try {
    return Object.fromEntries(fs.readFileSync("/proc/meminfo", "utf8").split("\n")
      .map((line) => {
        const match = line.match(/^([^:]+):\s+(\d+)/);
        return match ? [match[1], Number(match[2]) * 1024] : null;
      }).filter(Boolean));
  } catch {
    return {};
  }
}

function percent(value, total) {
  return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
}

function parseHumanBytes(value) {
  const match = String(value || "").match(/([\d.]+)\s*(B|kB|MB|GB|TB|KiB|MiB|GiB|TiB)/i);
  if (!match) return 0;
  const factors = {
    b: 1, kb: 1000, mb: 1000 ** 2, gb: 1000 ** 3, tb: 1000 ** 4,
    kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
  };
  return Math.round(Number(match[1]) * factors[match[2].toLowerCase()]);
}

function safeCommand(command, args, timeout = 4500) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function pm2Apps() {
  const output = safeCommand("pm2", ["jlist"]);
  if (output === null) return { available: false, apps: [] };

  try {
    const rows = JSON.parse(output);
    const grouped = new Map();
    for (const row of rows) {
      const info = row.pm2_env || {};
      const name = String(row.name || "Unnamed process");
      const group = grouped.get(name) || {
        name,
        type: "pm2",
        status: "offline",
        cpuPercent: 0,
        memoryBytes: 0,
        instanceCount: 0,
        onlineInstances: 0,
        restartCount: 0,
        uptimeSeconds: null,
        domains: [],
        ports: [],
      };
      const status = String(info.status || "offline");
      const isOnline = status === "online";
      const startedAt = number(info.pm_uptime);
      const environment = info.env && typeof info.env === "object" ? info.env : {};
      const ports = [environment.PORT, environment.API_PORT, environment.WEB_PORT]
        .map(Number).filter((port) => Number.isInteger(port) && port > 0 && port < 65536);

      group.instanceCount += 1;
      if (isOnline) group.onlineInstances += 1;
      group.cpuPercent += number(row.monit?.cpu);
      group.memoryBytes += number(row.monit?.memory);
      group.restartCount += number(info.restart_time);
      group.ports.push(...ports);
      if (startedAt > 0) {
        const uptime = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        group.uptimeSeconds = group.uptimeSeconds === null
          ? uptime
          : Math.max(group.uptimeSeconds, uptime);
      }
      group.status = group.onlineInstances === group.instanceCount
        ? "online"
        : group.onlineInstances > 0 ? "degraded" : "offline";
      grouped.set(name, group);
    }

    const apps = [...grouped.values()].map((app) => ({
      ...app,
      cpuPercent: Math.round(app.cpuPercent * 10) / 10,
      domains: [],
      ports: [...new Set(app.ports)],
    }));
    return { available: true, apps };
  } catch {
    return { available: false, apps: [] };
  }
}

function dockerApps() {
  const output = safeCommand("docker", ["stats", "--no-stream", "--format", "{{json .}}"]);
  if (output === null) return { available: false, apps: [] };
  const statusOutput = safeCommand("docker", ["ps", "-a", "--format", "{{json .}}"]);
  const statuses = new Map();
  if (statusOutput !== null) {
    for (const line of statusOutput.split("\n").filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        const ports = String(row.Ports || "").match(/(?:\d+\.\d+\.\d+\.\d+:)?(\d+)->(\d+)/g) || [];
        statuses.set(row.Names, {
          status: /unhealthy/i.test(String(row.Status)) ? "degraded" : /^Up\b/i.test(String(row.Status)) ? "online" : "offline",
          image: String(row.Image || ""),
          uptime: String(row.Status || ""),
          ports: ports.flatMap((entry) => [...entry.matchAll(/(\d+)->(\d+)/g)].flatMap((match) => [Number(match[1]), Number(match[2])])),
        });
      } catch {}
    }
  }

  const apps = [];
  for (const line of output.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      const name = String(row.Name || row.Container || "Container");
      const status = statuses.get(name) || { status: "unknown", image: "", uptime: "", ports: [] };
      const memory = String(row.MemUsage || "").split("/")[0].trim();
      const network = String(row.NetIO || "").split("/").map(parseHumanBytes);
      const block = String(row.BlockIO || "").split("/").map(parseHumanBytes);
      apps.push({
        name,
        type: "container",
        status: status.status,
        cpuPercent: Number.parseFloat(String(row.CPUPerc || "0")) || 0,
        memoryBytes: parseHumanBytes(memory),
        memoryLimitBytes: parseHumanBytes(String(row.MemUsage || "").split("/")[1] || ""),
        memoryPercent: Number.parseFloat(String(row.MemPerc || "0")) || 0,
        instanceCount: 1,
        onlineInstances: status.status === "online" ? 1 : 0,
        restartCount: null,
        uptimeSeconds: null,
        domains: [],
        image: status.image,
        uptime: status.uptime,
        networkReceivedBytes: network[0] || 0,
        networkSentBytes: network[1] || 0,
        blockReadBytes: block[0] || 0,
        blockWriteBytes: block[1] || 0,
        ports: status.ports,
      });
    } catch {}
  }
  return { available: true, apps };
}

function nginxServerBlocks(config) {
  const blocks = [];
  const matcher = /\bserver\s*\{/g;
  let match;
  while ((match = matcher.exec(config))) {
    const open = config.indexOf("{", match.index);
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let index = open; index < config.length; index += 1) {
      const char = config[index];
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote) {
        if (char === quote) quote = "";
        continue;
      }
      if (char === "\"" || char === "'") { quote = char; continue; }
      if (char === "#") {
        const end = config.indexOf("\n", index);
        if (end < 0) break;
        index = end;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        blocks.push(config.slice(open + 1, index));
        matcher.lastIndex = index + 1;
        break;
      }
    }
  }
  return blocks;
}

function measureDirectory(root) {
  if (!root || !path.isAbsolute(root)) return { bytes: null, truncated: false };
  let bytes = 0;
  let visited = 0;
  let truncated = false;
  const pending = [root];
  const ignored = new Set(["node_modules", ".git", ".cache", "cache", "logs", "tmp", "backups"]);
  try {
    while (pending.length && visited < 100000) {
      const directory = pending.pop();
      let entries;
      try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        visited += 1;
        if (visited >= 100000) { truncated = true; break; }
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!ignored.has(entry.name)) pending.push(entryPath);
        } else if (entry.isFile()) {
          try { bytes += fs.statSync(entryPath).size; } catch {}
        }
      }
    }
    if (pending.length) truncated = true;
    return { bytes, truncated };
  } catch {
    return { bytes: null, truncated: false };
  }
}

function nginxSites(processes, containers) {
  const enabled = "/etc/nginx/sites-enabled";
  let filenames;
  try { filenames = fs.readdirSync(enabled); } catch { return { available: false, sites: [] }; }

  const seenFiles = new Set();
  const configs = [];
  const upstreams = new Map();

  for (const filename of filenames) {
    const source = path.join(enabled, filename);
    try {
      const real = fs.realpathSync(source);
      if (seenFiles.has(real)) continue;
      seenFiles.add(real);
      const config = fs.readFileSync(real, "utf8");
      configs.push(config);
      for (const match of config.matchAll(/\bupstream\s+([a-zA-Z0-9_.-]+)\s*\{([\s\S]*?)\}/g)) {
        const ports = [...match[2].matchAll(/\bserver\s+[^;\s:]+:(\d+)/g)].map((port) => Number(port[1]));
        upstreams.set(match[1], ports);
      }
    } catch {}
  }

  const apps = [...processes, ...containers];
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const canonical = (domain) => domain.replace(/^www\./i, "").toLowerCase();
  const candidates = [];

  for (const config of configs) {
    for (const block of nginxServerBlocks(config)) {
      const domains = [...block.matchAll(/^\s*server_name\s+([^;]+);/gm)]
        .flatMap((entry) => entry[1].split(/\s+/))
        .filter((domain) => domain && domain !== "_" && domain !== "localhost" && !domain.startsWith("~") && !domain.startsWith("$"));
      if (!domains.length) continue;

      const roots = [...block.matchAll(/^\s*(?:root|alias)\s+([^;]+);/gm)]
        .map((entry) => entry[1].trim().replace(/^['"]|['"]$/g, ""))
        .filter((root) => root.startsWith("/") && !root.includes("$"));
      const proxyTargets = [];
      const ports = [];
      for (const entry of block.matchAll(/\bproxy_pass\s+https?:\/\/([^/;\s]+)[^;]*;/g)) {
        const target = entry[1];
        proxyTargets.push(target);
        const direct = target.match(/:(\d+)$/);
        if (direct) ports.push(Number(direct[1]));
        else {
          if (upstreams.has(target)) ports.push(...upstreams.get(target));
        }
      }
      const uniquePorts = [...new Set(ports)].filter((port) => port > 0);
      const tls = /^\s*listen\s+[^;]*\b443\b[^;]*\bssl\b/gm.test(block);
      const redirectRule = [...block.matchAll(/^\s*return\s+30[1278]\s+([^;\s]+);/gm)]
        .map((entry) => entry[1])[0] || null;
      const redirectHost = redirectRule?.match(/^https?:\/\/([^/$?#]+)(?:[/$?#]|$)/i)?.[1] || null;
      const redirect = redirectHost ? `https://${redirectHost}` : null;
      const redirects = Boolean(redirectRule);
      const hasProxy = proxyTargets.length > 0;

      let app = apps.find((candidate) => candidate.ports?.some((port) => uniquePorts.includes(port))) || null;
      if (!app && proxyTargets.length) {
        const upstreamNames = proxyTargets.map(normalize);
        const matches = apps.filter((candidate) => {
          const appName = normalize(candidate.name);
          return upstreamNames.some((upstream) => upstream === appName || upstream.startsWith(appName) || appName.startsWith(upstream));
        });
        if (matches.length === 1) app = matches[0];
      }
      if (!app && hasProxy) {
        const domainLabels = domains.map((domain) => canonical(domain).split(".")[0]).filter((label) => label.length >= 4);
        const matches = apps.filter((candidate) => candidate.type === "pm2" && domainLabels.some((label) => {
          const normalizedLabel = normalize(label);
          const appName = normalize(candidate.name);
          return appName.includes(normalizedLabel) || normalizedLabel.includes(appName);
        }));
        if (matches.length === 1) app = matches[0];
      }

      const rootsFound = [...new Set(roots)]
        .filter((root) => !root.startsWith("/var/www/certbot") && fs.existsSync(root))
        .sort((a, b) => a.length - b.length);
      const root = rootsFound[0] || null;

      if (hasProxy) {
        candidates.push({ kind: "proxy", domains, app, ports: uniquePorts, tls, root });
      } else if (redirects) {
        candidates.push({ kind: "redirect", domains, redirect, tls });
      } else if (root) {
        candidates.push({ kind: "static", domains, root, tls });
      }
    }
  }

  const activeDomains = new Set(candidates.filter((candidate) => candidate.kind !== "redirect")
    .flatMap((candidate) => candidate.domains.map(canonical)));
  const groups = new Map();
  for (const candidate of candidates.filter((item) => item.kind !== "redirect")) {
    let key;
    if (candidate.kind === "proxy" && candidate.app) key = `service:${candidate.app.type}:${candidate.app.name}`;
    else if (candidate.kind === "static") key = `root:${candidate.root}`;
    else if (candidate.kind === "redirect") key = `redirect:${candidate.domains.map(canonical).sort().join(",")}`;
    else key = `proxy:${candidate.domains.map(canonical).sort().join(",")}:${candidate.ports.join(",")}`;

    const group = groups.get(key) || {
      kind: candidate.kind,
      domains: new Set(),
      root: candidate.root || null,
      app: candidate.app || null,
      ports: [],
      tls: false,
      redirect: candidate.redirect || null,
    };
    candidate.domains.forEach((domain) => group.domains.add(domain));
    group.ports.push(...(candidate.ports || []));
    group.tls ||= candidate.tls;
    if (candidate.kind === "proxy" && candidate.root && !group.root) group.root = candidate.root;
    if (candidate.redirect) group.redirect = candidate.redirect;
    groups.set(key, group);
  }

  for (const candidate of candidates.filter((item) => item.kind === "redirect")) {
    const redirectsToActiveSite = candidate.domains.every((domain) => activeDomains.has(canonical(domain)));
    if (redirectsToActiveSite) {
      for (const domain of candidate.domains) {
        const activeGroup = [...groups.values()].find((group) =>
          [...group.domains].some((activeDomain) => canonical(activeDomain) === canonical(domain)),
        );
        if (activeGroup) {
          activeGroup.domains.add(domain);
          activeGroup.tls ||= candidate.tls;
        }
      }
      continue;
    }
    const key = `redirect:${candidate.domains.map(canonical).sort().join(",")}`;
    const group = groups.get(key) || {
      kind: "redirect",
      domains: new Set(),
      root: null,
      app: null,
      ports: [],
      tls: false,
      redirect: candidate.redirect || null,
    };
    candidate.domains.forEach((domain) => group.domains.add(domain));
    group.tls ||= candidate.tls;
    if (candidate.redirect) group.redirect = candidate.redirect;
    groups.set(key, group);
  }

  const sites = [...groups.values()].map((group) => {
    const domains = [...group.domains].sort((a, b) => canonical(a).localeCompare(canonical(b)) || a.localeCompare(b));
    const kind = group.kind;
    const storage = kind === "static" && group.root ? measureDirectory(group.root) : null;
    const projectName = group.app?.name || (group.root
      ? path.relative("/var/www", group.root).split(path.sep)[0] || path.basename(group.root)
      : domains.find((domain) => !domain.startsWith("www.")) || "Website");
    const status = group.app ? group.app.status : kind === "proxy" ? "unknown" : "configured";
    if (group.app) group.app.domains = [...new Set([...(group.app.domains || []), ...domains])];
    return {
      name: projectName,
      domains,
      type: kind,
      serviceName: group.app?.name || null,
      serviceType: group.app?.type || null,
      status,
      tls: group.tls,
      storageBytes: storage?.bytes ?? null,
      storageScanLimited: storage?.truncated ?? false,
      redirectedTo: group.redirect,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.domains[0].localeCompare(b.domains[0]));

  return { available: true, sites };
}

function filesystem() {
  try {
    const stat = fs.statfsSync("/");
    const totalBytes = stat.blocks * stat.bsize;
    const freeBytes = stat.bfree * stat.bsize;
    const availableBytes = stat.bavail * stat.bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      mount: "/",
      totalBytes,
      usedBytes,
      availableBytes,
      usedPercent: percent(usedBytes, totalBytes),
    };
  } catch {
    return { mount: "/", totalBytes: 0, usedBytes: 0, availableBytes: 0, usedPercent: 0 };
  }
}

async function main() {
  const cpuStart = readCpuCounters();
  const networkStart = readNetworkCounters();
  const timeStart = process.hrtime.bigint();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const cpuEnd = readCpuCounters();
  const networkEnd = readNetworkCounters();
  const elapsedSeconds = Number(process.hrtime.bigint() - timeStart) / 1e9;
  let cpuPercent = null;
  if (cpuStart && cpuEnd) {
    const total = cpuEnd.total - cpuStart.total;
    const idle = cpuEnd.idle - cpuStart.idle;
    if (total > 0) cpuPercent = Math.round(percent(total - idle, total) * 10) / 10;
  }

  const memoryInfo = readMeminfo();
  const memoryTotalBytes = memoryInfo.MemTotal || 0;
  const memoryAvailableBytes = memoryInfo.MemAvailable || memoryInfo.MemFree || 0;
  const memoryUsedBytes = Math.max(0, memoryTotalBytes - memoryAvailableBytes);
  const swapTotalBytes = memoryInfo.SwapTotal || 0;
  const swapFreeBytes = memoryInfo.SwapFree || 0;
  const disk = filesystem();
  const pm2 = pm2Apps();
  const docker = dockerApps();
  const services = [...pm2.apps, ...docker.apps].map((app) => ({
    ...app,
    cpuPercent: Math.round(app.cpuPercent * 10) / 10,
    memoryPercent: Math.round((app.memoryPercent || percent(app.memoryBytes, app.memoryLimitBytes || memoryTotalBytes)) * 10) / 10,
  }));
  const nginx = nginxSites(services, []);
  const apps = services.map(({ ports, ...app }) => app);
  const sites = nginx.sites;
  const rxDelta = Math.max(0, networkEnd.received - networkStart.received);
  const txDelta = Math.max(0, networkEnd.sent - networkStart.sent);

  const result = {
    sampledAt: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      operatingSystem: `${os.type()} ${os.release()}`,
      architecture: os.arch(),
      cpuCores: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
      cpuPercent,
      loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
      uptimeSeconds: Math.floor(os.uptime()),
      memory: {
        usedBytes: memoryUsedBytes,
        totalBytes: memoryTotalBytes,
        availableBytes: memoryAvailableBytes,
        usedPercent: Math.round(percent(memoryUsedBytes, memoryTotalBytes) * 10) / 10,
      },
      swap: {
        usedBytes: Math.max(0, swapTotalBytes - swapFreeBytes),
        totalBytes: swapTotalBytes,
        usedPercent: Math.round(percent(Math.max(0, swapTotalBytes - swapFreeBytes), swapTotalBytes) * 10) / 10,
      },
      disk,
      network: {
        interfaceName: networkEnd.interfaceName,
        receivedBytesPerSecond: Math.round(rxDelta / elapsedSeconds),
        sentBytesPerSecond: Math.round(txDelta / elapsedSeconds),
        receivedBytes: networkEnd.received,
        sentBytes: networkEnd.sent,
      },
    },
    services: apps,
    websites: sites,
    capabilities: {
      pm2: pm2.available,
      docker: docker.available,
      nginx: nginx.available,
    },
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch(() => {
  process.stderr.write("VPS snapshot collection failed\n");
  process.exitCode = 1;
});
