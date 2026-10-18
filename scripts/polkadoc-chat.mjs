#!/usr/bin/env node
/**
 * Turn a polkadoc thread note into a corpus chat body, and optionally post it.
 *
 *   node scripts/polkadoc-chat.mjs <vault> <Platform/Thread> [--since 2026-09-12] [--post]
 *       [--project 22] [--external-suffix tail] [--ocr 300]
 *
 * Body format (same as sources #46–50): one line per message,
 * `YYYY-MM-DD HH:MM Sender: text`, ⏎ for a newline inside a message, and
 * `[ATT name] ocr…` for an attachment with its OCR or transcript text, cut to
 * --ocr characters (screenshots OCR to kilobytes of noise; the Prince DM is 54 MB).
 * "You" becomes "Gelo". Exact repeated blocks (polkadoc's capture twins) are dropped.
 *
 * With --post it calls POST /api/corpus/ingest/text on ADVO_API_URL as ADVO_EMAIL,
 * kind "text", externalId `polkadoc:<Platform/Thread>` (plus `#<suffix>` when given),
 * so a re-run replaces the same source instead of adding a copy. The server runs
 * its extractor (CORPUS_EXTRACT_MODEL) over the text for facts, terms and actions.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const MONTH = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const pad = (n) => String(n).padStart(2, "0");

/** `## 2026.10.14` → "2026-10-14". */
function dayOf(header) {
  const m = header.match(/^##\s+(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
}

/** `_October 14, 2026, 10:05 AM · 😆_` or `_4:00 PM_` → { day?, time }. */
function stampOf(line) {
  const m = line.match(/^_(.*)_$/);
  if (!m) return null;
  const inner = m[1].split(" · ")[0];
  const t = inner.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!t) return null;
  // Telegram notes stamp 24-hour `_20:35_`; Messenger 12-hour with AM/PM.
  if (!t[3] && !/^\d{1,2}:\d{2}$/.test(inner.trim())) return null;
  let hour = Number(t[1]);
  if (t[3]) hour = (hour % 12) + (t[3].toUpperCase() === "PM" ? 12 : 0);
  const d = inner.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  const day = d && MONTH[d[1].toLowerCase()] ? `${d[3]}-${pad(MONTH[d[1].toLowerCase()])}-${pad(d[2])}` : null;
  return { day, time: `${pad(hour)}:${t[2]}` };
}

export function parseThread(text, { ocr = 300 } = {}) {
  const block = text.split(/\n---\n/);
  const message = [];
  const seen = new Set();
  let duplicateCount = 0;
  for (const raw of block) {
    const line = raw.split("\n");
    const header = line.find((l) => l.startsWith("## "));
    const day = header ? dayOf(header) : null;
    if (!day) continue;
    if (seen.has(raw)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(raw);

    const senderLine = line.find((l) => l.startsWith("### "));
    const sender = senderLine ? senderLine.slice(4).trim().replace(/^You$/, "Gelo") : "(system)";
    let stamp = null;
    const part = [];
    let attachment = null;
    const flush = () => {
      if (!attachment) return;
      const body = attachment.text.join(" ").replace(/\s+/g, " ").trim();
      part.push(`[ATT ${attachment.name}]${body ? " " + body.slice(0, ocr) + (body.length > ocr ? "…" : "") : ""}`);
      attachment = null;
    };
    for (const l of line) {
      if (l.startsWith("## ") || l.startsWith("### ")) continue;
      if (/^>\s*↪/.test(l)) continue;
      const forward = l.match(/^>\s*⤳\s*_forwarded from \*\*(.+?)\*\*_/);
      if (forward) {
        part.push(`(forwarded from ${forward[1]})`);
        continue;
      }
      const s = stampOf(l.trim());
      if (s) {
        stamp = s;
        continue;
      }
      const att = l.match(/^#### Attachment:\s*(.+)$/);
      if (att) {
        flush();
        attachment = { name: att[1].trim(), text: [] };
        continue;
      }
      if (/^!\[.*\]\(.*\)$/.test(l.trim())) continue;
      if (attachment) attachment.text.push(l);
      else part.push(l);
    }
    flush();
    const content = part.join("\n").trim().replace(/\n{2,}/g, "\n").replace(/\n/g, " ⏎ ");
    if (!content) continue;
    message.push({
      day: stamp?.day ?? day,
      time: stamp?.time ?? "??:??",
      sender,
      content,
    });
  }
  return { message, duplicateCount };
}

export function bodyOf(message) {
  return message.map((m) => `${m.day} ${m.time} ${m.sender}: ${m.content}`).join("\n");
}

async function main() {
  const arg = process.argv.slice(2);
  const flag = (name) => (arg.includes(name) ? arg[arg.indexOf(name) + 1] : null);
  const [vault, thread] = arg.filter((a, i) => !a.startsWith("--") && !arg[i - 1]?.startsWith("--"));
  if (!vault || !thread) {
    console.error("usage: polkadoc-chat.mjs <vault> <Platform/Thread> [--since D] [--post] [--project N]");
    process.exit(2);
  }
  const name = basename(thread);
  const text = readFileSync(join(vault, thread, `${name}.md`), "utf8");
  const ocr = Number(flag("--ocr") ?? 300);
  const since = flag("--since");
  const { message, duplicateCount } = parseThread(text, { ocr });
  const kept = since ? message.filter((m) => m.day >= since) : message;
  const body = bodyOf(kept);
  const first = kept[0];
  const last = kept[kept.length - 1];
  const stat = {
    thread,
    messageCount: kept.length,
    duplicateCount,
    characterCount: body.length,
    firstMessageAt: first ? `${first.day} ${first.time}` : null,
    lastMessageAt: last ? `${last.day} ${last.time}` : null,
  };

  if (!arg.includes("--post")) {
    if (arg.includes("--print")) console.log(body);
    else console.log(JSON.stringify(stat));
    return;
  }
  if (kept.length === 0) {
    console.log(JSON.stringify({ ...stat, posted: false }));
    return;
  }

  const API = (process.env.ADVO_API_URL || "http://127.0.0.1:6407").replace(/\/$/, "");
  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.ADVO_EMAIL || "admin@advo.ph", password: process.env.ADVO_PASSWORD || "changeme" }),
  }).then((r) => r.json());
  const token = login.data?.accessToken;
  if (!token) throw new Error(`login failed: ${JSON.stringify(login.error)}`);

  const suffix = flag("--external-suffix");
  const project = flag("--project");
  const platform = thread.split("/")[0];
  const res = await fetch(`${API}/api/corpus/ingest/text`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: `${name} (chat, polkadoc capture${since ? `, from ${since}` : ""})`,
      text: body,
      kind: "text",
      externalId: `polkadoc:${thread}${suffix ? `#${suffix}` : ""}`,
      occurredAt: last ? `${last.day}T${last.time === "??:??" ? "00:00" : last.time}:00+08:00` : null,
      projectId: project ? Number(project) : null,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ingest ${thread} → ${res.status} ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
  console.log(JSON.stringify({ ...stat, platform, posted: true, sourceId: json.data?.source?.corpusSourceId ?? json.data?.sourceId ?? null, method: json.data?.method }));
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
