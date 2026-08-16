/**
 * Ask Plaud — POST /ask/v2/ask (same consumer JWT as the web app / praud).
 * Streams SSE answer + reference events. We only send a question + file id;
 * Plaud already holds the recording.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { hasPlaudAuth, getFileDetail, noteId } from "./plaud.service.js";

const ASK_PATH = "/ask/v2/ask";
const DEFAULT_HOST = "https://api-apse1.plaud.ai";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const SKILL_CONFIRM_ACTION = "confirm_actions";

export type AskAnswer = {
  answer: string;
  reference: { startMs: number; endMs: number }[];
};

/** Pure SSE parser — fixture-tested, no network. */
export function parseAskStream(raw: string): AskAnswer {
  let answer = "";
  const reference: { startMs: number; endMs: number }[] = [];
  let event = "";
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event: ")) {
      event = line.slice(7).trim();
      continue;
    }
    if (!line.startsWith("data: ")) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event === "answer" && typeof parsed.content === "string") {
      answer += parsed.content;
    }
    if (event === "reference") {
      const start = Number(parsed.start_time);
      const end = Number(parsed.end_time);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        reference.push({ startMs: start, endMs: end });
      }
    }
  }
  return { answer, reference };
}

/** Pull the first JSON object out of streamed prose / fences. */
export function jsonFromAskAnswer(answer: string): unknown | null {
  const trimmed = answer
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* scan */
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function bearerToken(): string {
  if (process.env.PLAUD_TOKEN) return process.env.PLAUD_TOKEN;
  const path = process.env.PLAUD_AUTH_FILE || join(homedir(), ".piper", "plaud-auth.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as { token?: string };
  if (!raw.token) throw new Error(`No token in ${path}`);
  return raw.token;
}

function authHeader(): Record<string, string> {
  const token = bearerToken();
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": BROWSER_UA,
    Origin: "https://web.plaud.ai",
    Referer: "https://web.plaud.ai/",
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    "edit-from": "web",
    "app-platform": "web",
    "app-language": "en",
    timezone: "Asia/Manila",
  };
}

export async function askPlaud(input: {
  fileId: string;
  noteId?: string | null;
  question: string;
  skill?: string | null;
}): Promise<AskAnswer> {
  if (!hasPlaudAuth()) {
    throw new Error("Plaud auth is not configured");
  }
  const host = (process.env.PLAUD_API_HOST || DEFAULT_HOST).replace(/\/$/, "");
  const body: Record<string, unknown> = {
    question: input.question,
    query: input.question,
    file_id: input.fileId,
    note_id: input.noteId ?? "",
    deep_thinking: "false",
    show_thinking: "false",
  };
  if (input.skill) {
    body.skills = { name: input.skill, source: "action" };
  }
  const res = await fetch(`${host}${ASK_PATH}`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error("Ask Plaud 401 — consumer JWT is stale");
  }
  if (!res.ok) {
    throw new Error(`Ask Plaud failed: HTTP ${res.status}`);
  }
  const raw = await res.text();
  const parsed = parseAskStream(raw);
  if (!parsed.answer.trim()) {
    throw new Error("Ask Plaud returned no answer");
  }
  return parsed;
}

export async function noteIdForFile(fileId: string): Promise<string | null> {
  const detail = await getFileDetail(fileId);
  return noteId(detail)[0] ?? null;
}
