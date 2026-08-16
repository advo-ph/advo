/**
 * Extract actionable tasks from a meeting transcript / Plaud note.
 *
 * Prefer the Plaud AI note (summary) when it already lists action items.
 * Otherwise Claude (ANTHROPIC_API_KEY) or a line/bullet heuristic.
 * Ground owners against the live team_member roster so assignedTo is an id.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  askPlaud,
  jsonFromAskAnswer,
  noteIdForFile,
} from "./plaud-ask.service.js";
import { hasPlaudAuth } from "./plaud.service.js";

export type TaskMethod = "heuristic" | "ai" | "note" | "ask";

export interface RosterPerson {
  teamMemberId: number;
  name: string;
  role?: string | null;
}

export interface ProjectRef {
  projectId: number;
  title: string;
  clientName?: string | null;
}

export interface MeetingGrounding {
  roster: RosterPerson[];
  project: ProjectRef;
  catalog: ProjectRef[];
}

export interface ProposedTask {
  title: string;
  description: string;
  suggestedSkill: string;
  assignedTo: number | null;
  assigneeName: string | null;
  ownerRaw: string | null;
  projectId: number | null;
}

export interface TaskExtraction {
  task: ProposedTask[];
  method: TaskMethod;
}

const MAX_TASK = 8;
const MIN_TITLE = 3;
const MAX_TITLE = 255;
const MAX_DESC = 5000;

const SKILL_SET = new Set([
  "design",
  "frontend",
  "backend",
  "fullstack",
  "content",
  "pm",
  "devops",
  "qa",
  "general",
]);

/** Spoken / typed nicknames → first-name needle. Only used if roster has a hit. */
const ALIAS: Record<string, string> = {
  gelo: "angelo",
  gel: "angelo",
  angelo: "angelo",
  prince: "prince",
  david: "david",
  dave: "david",
  anthony: "anthony",
  ant: "anthony",
  au: "au",
  kenneth: "kenneth",
  ken: "kenneth",
  schiffier: "schiffier",
  schiffer: "schiffier",
  schiff: "schiffier",
  maran: "maran",
  mar: "maran",
};

const PLACEHOLDER = new Set([
  "insert name",
  "tbd",
  "todo",
  "unknown",
  "n a",
  "tbc",
  "owner",
  "unassigned",
  "someone",
  "tbd later",
]);

function emptyAssign(): Pick<
  ProposedTask,
  "assignedTo" | "assigneeName" | "ownerRaw" | "projectId"
> {
  return { assignedTo: null, assigneeName: null, ownerRaw: null, projectId: null };
}

function normalizeSkill(raw: unknown): string {
  const s = String(raw ?? "general")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 40);
  if (SKILL_SET.has(s)) return s;
  if (s.length >= 2 && s.length <= 40 && /^[a-z][a-z0-9_-]*$/.test(s)) return s;
  return "general";
}

function clampTitle(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_TITLE) return t;
  return t.slice(0, MAX_TITLE - 1).trimEnd() + "…";
}

function clampDescription(raw: string): string {
  const d = raw.trim();
  if (d.length <= MAX_DESC) return d;
  return d.slice(0, MAX_DESC - 1).trimEnd() + "…";
}

/** Build deliverable.description including suggested skill (no skill column). */
export function formatTaskDescription(task: ProposedTask): string {
  const body = task.description.trim();
  const skillLine = `Suggested skill: ${task.suggestedSkill}`;
  if (!body) return skillLine;
  if (body.toLowerCase().includes("suggested skill:")) return clampDescription(body);
  return clampDescription(`${skillLine}\n\n${body}`);
}

function fold(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveOnePerson(
  needle: string,
  roster: RosterPerson[],
): { assignedTo: number | null; assigneeName: string | null } {
  if (!needle || roster.length === 0) return { assignedTo: null, assigneeName: null };

  const alias = ALIAS[needle.split(" ")[0] ?? ""] ?? needle;

  const scored = roster
    .map((person) => {
      const full = fold(person.name);
      const token = full.split(" ");
      const first = token[0] ?? "";
      const last = token[token.length - 1] ?? "";
      let score = 0;
      if (full === needle || full === alias) score = 100;
      else if (first === needle || first === alias) score = 80;
      else if (last === needle && last.length > 2) score = 60;
      else if (full.startsWith(needle) || needle.startsWith(first)) score = 40;
      return { person, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < 40) return { assignedTo: null, assigneeName: null };
  const tie = scored.filter((s) => s.score === top.score);
  if (tie.length > 1 && top.score < 80) return { assignedTo: null, assigneeName: null };
  return { assignedTo: top.person.teamMemberId, assigneeName: top.person.name };
}

export function resolvePerson(
  raw: string | null | undefined,
  roster: RosterPerson[],
): { assignedTo: number | null; assigneeName: string | null } {
  const part = String(raw ?? "")
    .split(/\s*\|\s*/)
    .map((p) => fold(p))
    .filter(Boolean);
  if (part.length === 0) return { assignedTo: null, assigneeName: null };
  for (const needle of part) {
    const hit = resolveOnePerson(needle, roster);
    if (hit.assignedTo != null) return hit;
  }
  return { assignedTo: null, assigneeName: null };
}

export function resolveProject(
  text: string,
  grounding: MeetingGrounding | null,
): number | null {
  if (!grounding) return null;
  const current = grounding.project;
  const inbox =
    fold(current.title) === "inbox" || fold(current.clientName ?? "") === "advo inbox";
  if (!inbox) return current.projectId;

  const hay = fold(text);
  const hit = grounding.catalog.filter((p) => {
    if (p.projectId === current.projectId) return false;
    const title = fold(p.title);
    const client = fold(p.clientName ?? "");
    if (title.length < 3) return false;
    return hay.includes(title) || (client.length >= 3 && hay.includes(client));
  });
  if (hit.length === 1) return hit[0].projectId;
  return current.projectId;
}

export function groundTask(
  task: ProposedTask,
  grounding: MeetingGrounding | null,
): ProposedTask {
  const resolved = resolvePerson(task.ownerRaw, grounding?.roster ?? []);
  const projectId = resolveProject(
    `${task.title} ${task.description} ${task.ownerRaw ?? ""}`,
    grounding,
  );
  return {
    ...task,
    assignedTo: resolved.assignedTo,
    assigneeName: resolved.assigneeName,
    projectId,
  };
}

// ---------------------------------------------------------------------------
// Heuristic: bullets, numbered lists, action-item prefixes; else long lines
// ---------------------------------------------------------------------------

const BULLET_RE = /^(?:[-*•▪▸◦–—]|\d+[.)]|\[\s*[x ]?\s*\])\s+(.+)$/i;
const ACTION_PREFIX_RE =
  /^(?:action(?:\s*items?)?|todo|to-do|task|follow[- ]?ups?|next steps?|owners?)\s*[:\-–]\s*(.+)$/i;
const OWNER_LINE_RE =
  /^(?:@)?([A-Za-z][\w.-]*(?:\s+[A-Za-z][\w.-]*)?)\s*[:\-–—]\s+(.+)$/;
const OWNER_TO_RE =
  /^(?:@)?([A-Za-z][\w.-]*(?:\s+[A-Za-z][\w.-]*)?)\s+to\s+(.+)$/i;
const SECTION_RE =
  /^(?:#{1,3}\s*)?(?:\*{0,2})(?:action(?:\s*items?)?|next (?:steps?|arrangements?)|arrangements?|to-?dos?|follow[- ]?ups?|owners?)(?:\*{0,2})\s*:?\s*$/i;

function guessSkill(text: string): string {
  const t = text.toLowerCase();
  if (/\b(ui|ux|figma|mockup|wireframe|brand|logo|visual)\b/.test(t)) return "design";
  if (/\b(react|css|html|frontend|front-end|component|page)\b/.test(t)) return "frontend";
  if (/\b(api|db|database|backend|back-end|server|endpoint|migration)\b/.test(t))
    return "backend";
  if (/\b(deploy|vercel|ci|docker|infra|devops)\b/.test(t)) return "devops";
  if (/\b(copy|content|blog|seo|write|writing)\b/.test(t)) return "content";
  if (/\b(test|qa|verify|acceptance)\b/.test(t)) return "qa";
  if (/\b(timeline|schedule|scope|client|kickoff|meeting)\b/.test(t)) return "pm";
  return "general";
}

function isPlaceholderName(name: string): boolean {
  const f = fold(name);
  if (!f) return true;
  if (PLACEHOLDER.has(f)) return true;
  if (f.startsWith("insert name")) return true;
  if (/^speaker \d+$/.test(f)) return true;
  return false;
}

/** Plaud note suffix: "do the thing — *Prince*" or "… — *[Insert Name]* *Anthony*". */
function ownerFromSuffix(body: string): { ownerRaw: string | null; text: string } | null {
  const suffix = body.match(/^(.*?)\s+[—–]\s+(.+)$/);
  if (!suffix?.[1] || suffix[1].trim().length < MIN_TITLE || !suffix[2]) return null;
  const star = [...suffix[2].matchAll(/\*([^*]+)\*/g)].map((m) => m[1].trim());
  const raw = star.length
    ? star
    : suffix[2]
        .split(/[,/&]| and /i)
        .map((s) => s.replace(/^@/, "").trim())
        .filter(Boolean);
  const candidate = raw.filter((n) => !isPlaceholderName(n));
  if (candidate.length === 0) return { ownerRaw: null, text: suffix[1].trim() };
  return { ownerRaw: candidate.join(" | "), text: suffix[1].trim() };
}

function splitOwner(body: string): { ownerRaw: string | null; text: string } {
  // Plaud notes put *Owner* after an em dash — prefer that over "Talk to …".
  if (/\*[^*]+\*/.test(body)) {
    const suffix = ownerFromSuffix(body);
    if (suffix) return suffix;
  }
  const ownerLine = body.match(OWNER_LINE_RE);
  if (ownerLine?.[1] && ownerLine[2] && ownerLine[2].trim().length >= MIN_TITLE) {
    return { ownerRaw: ownerLine[1].trim(), text: ownerLine[2].trim() };
  }
  const ownerTo = body.match(OWNER_TO_RE);
  if (
    ownerTo?.[1] &&
    ownerTo[2] &&
    ownerTo[2].trim().length >= MIN_TITLE &&
    !/^(talk|need|want|have|ask|go|try|make|get|set|add|fix|ship|implement|complete|finish|organize|initiate|hold)$/i.test(
      ownerTo[1],
    )
  ) {
    return { ownerRaw: ownerTo[1].trim(), text: ownerTo[2].trim() };
  }
  const suffix = ownerFromSuffix(body);
  if (suffix) return suffix;
  return { ownerRaw: null, text: body };
}

function lineToTask(line: string): ProposedTask | null {
  const trimmed = line.trim();
  if (trimmed.length < MIN_TITLE) return null;

  let body: string | null = null;

  const bullet = trimmed.match(BULLET_RE);
  if (bullet?.[1]) {
    body = bullet[1].replace(/^\[\s*[xX ]?\s*\]\s+/, "").trim();
  }

  if (!body) {
    const action = trimmed.match(ACTION_PREFIX_RE);
    if (action?.[1]) body = action[1].trim();
  }

  if (!body) {
    const owner = splitOwner(trimmed);
    if (owner.ownerRaw) {
      const skill = guessSkill(owner.text);
      return {
        title: clampTitle(owner.text),
        description: `From meeting transcript.`,
        suggestedSkill: skill,
        ...emptyAssign(),
        ownerRaw: owner.ownerRaw,
      };
    }
    return null;
  }

  if (body.length < MIN_TITLE) return null;
  const owner = splitOwner(body);
  return {
    title: clampTitle(owner.text),
    description: `From meeting transcript.`,
    suggestedSkill: guessSkill(owner.text),
    ...emptyAssign(),
    ownerRaw: owner.ownerRaw,
  };
}

function extractHeuristic(transcript: string): ProposedTask[] {
  const line = transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const task: ProposedTask[] = [];
  const seen = new Set<string>();

  const push = (t: ProposedTask) => {
    if (task.length >= MAX_TASK) return;
    const key = t.title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    task.push(t);
  };

  for (const l of line) {
    if (task.length >= MAX_TASK) break;
    const t = lineToTask(l);
    if (t) push(t);
  }

  if (task.length === 0) {
    for (const l of line) {
      if (task.length >= MAX_TASK) break;
      if (l.length < 12) continue;
      if (/^[A-Z0-9 /&-]{2,40}:?$/.test(l) && l.length < 40) continue;
      push({
        title: clampTitle(l),
        description: l.length > MAX_TITLE ? clampDescription(l) : "From meeting transcript.",
        suggestedSkill: guessSkill(l),
        ...emptyAssign(),
      });
    }
  }

  return task.slice(0, MAX_TASK);
}

/** Pull action-item bullets out of a Plaud AI note (markdown). */
export function parseActionItem(summary: string): ProposedTask[] {
  const line = summary.split(/\r?\n/).map((l) => l.trim());
  let inSection = false;
  const picked: string[] = [];

  for (const l of line) {
    if (!l) continue;
    if (SECTION_RE.test(l.replace(/\*+/g, ""))) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s+\S/.test(l)) {
      inSection = false;
      continue;
    }
    if (inSection) picked.push(l);
  }

  const source = picked.length > 0 ? picked : line.filter((l) => BULLET_RE.test(l));
  const task: ProposedTask[] = [];
  const seen = new Set<string>();
  for (const l of source) {
    if (task.length >= MAX_TASK) break;
    const t = lineToTask(l);
    if (!t) continue;
    const key = t.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    task.push({
      ...t,
      description: t.description === "From meeting transcript." ? "From Plaud note." : t.description,
    });
  }
  return task;
}

// ---------------------------------------------------------------------------
// AI path (Claude) — roster + project glossary in the prompt
// ---------------------------------------------------------------------------

function glossaryBlock(grounding: MeetingGrounding | null): string {
  if (!grounding) {
    return `People: (none loaded — leave owner null)
Projects: (none loaded)`;
  }
  const person = grounding.roster
    .map((p) => `- ${p.name} (teamMemberId=${p.teamMemberId}${p.role ? `, role=${p.role}` : ""})`)
    .join("\n");
  const project = grounding.catalog
    .map(
      (p) =>
        `- ${p.title} (projectId=${p.projectId}${p.clientName ? `, client=${p.clientName}` : ""})`,
    )
    .join("\n");
  return `People (owner MUST be one of these names, or null):
${person || "- (empty roster)"}

Projects (use projectId when the ask is clearly for one of these):
${project || "- (empty catalog)"}

Current meeting project: ${grounding.project.title} (projectId=${grounding.project.projectId})`;
}

function aiSystem(grounding: MeetingGrounding | null): string {
  return `You extract actionable project tasks from a meeting transcript for ADVO, a Philippine web/design agency.

Terminology (use these keys, never synonyms):
- deliverable, not "task" / "ticket" / "card"
- assignedTo is a team_member id, never a free-text owner
- suggestedSkill is one of design | frontend | backend | fullstack | content | pm | devops | qa | general
- projectId is the ADVO project the deliverable belongs on

${glossaryBlock(grounding)}

Return 1–8 concrete, assignable deliverables. Prefer ship-a-page / fix-a-bug / draft-copy / design-a-screen over vague notes.

For each item provide:
- title: short imperative (≤120 chars)
- description: 1–3 sentences with enough context to start
- suggestedSkill: one of the skills above
- owner: exact roster name or null (do not invent people)

Respond with ONLY a JSON object (no prose, no markdown code fences) of exactly this shape:
{"task":[{"title":"...","description":"...","suggestedSkill":"frontend","owner":"Prince"}]}

Rules:
- 1 to 8 items in "task"
- Skip pure chitchat, scheduling logistics, and already-done work
- If the transcript has almost no actions, still return the best 1–3 inferred next steps
- Do not invent client names or scope not present in the transcript
- owner must match a roster name or be null`;
}

interface RawAITask {
  title?: string;
  description?: string;
  suggestedSkill?: string;
  suggested_skill?: string;
  owner?: string | null;
  ownerRaw?: string | null;
}

interface RawAIExtraction {
  task?: RawAITask[];
  tasks?: RawAITask[];
}

function taskFromUnknown(parsed: unknown, grounding: MeetingGrounding | null): ProposedTask[] {
  const rec = parsed && typeof parsed === "object" ? (parsed as RawAIExtraction) : null;
  const list = Array.isArray(rec?.task)
    ? rec.task
    : Array.isArray(rec?.tasks)
      ? rec.tasks
      : null;
  if (!list) return [];
  const task: ProposedTask[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (task.length >= MAX_TASK) break;
    const t = normalizeProposed(item);
    if (!t) continue;
    const key = t.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    task.push(groundTask(t, grounding));
  }
  return task;
}

function askQuestion(grounding: MeetingGrounding | null): string {
  return `Extract ADVO deliverable items from this recording.

${glossaryBlock(grounding)}

Terminology: deliverable not "task"; owner is a roster name or null; suggestedSkill is one of design|frontend|backend|fullstack|content|pm|devops|qa|general.

Return ONLY a JSON object (no markdown fences, no prose):
{"task":[{"title":"...","description":"...","suggestedSkill":"frontend","owner":"Prince Wagan"}]}

1 to 8 items. Skip chitchat. owner must be a roster name or null. Do not invent people.`;
}

async function extractWithAsk(
  fileId: string,
  grounding: MeetingGrounding | null,
): Promise<TaskExtraction | null> {
  if (!hasPlaudAuth()) return null;
  try {
    const nid = await noteIdForFile(fileId);
    const asked = await askPlaud({
      fileId,
      noteId: nid,
      question: askQuestion(grounding),
    });
    const parsed = jsonFromAskAnswer(asked.answer);
    const task = taskFromUnknown(parsed, grounding);
    if (task.length === 0) return null;
    return { task, method: "ask" };
  } catch (err) {
    console.error("[meeting-task] Ask Plaud failed; falling back:", err);
    return null;
  }
}

function normalizeProposed(raw: RawAITask): ProposedTask | null {
  const title = clampTitle(String(raw.title ?? "").trim());
  if (title.length < MIN_TITLE) return null;
  const description = clampDescription(
    String(raw.description ?? "").trim() || "From meeting transcript.",
  );
  const skill = normalizeSkill(raw.suggestedSkill ?? raw.suggested_skill);
  const ownerRaw = raw.owner ?? raw.ownerRaw ?? null;
  return {
    title,
    description,
    suggestedSkill: skill,
    ...emptyAssign(),
    ownerRaw: ownerRaw ? String(ownerRaw).trim() || null : null,
  };
}

async function extractWithClaude(
  transcript: string,
  grounding: MeetingGrounding | null,
): Promise<TaskExtraction | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: aiSystem(grounding),
      messages: [
        {
          role: "user",
          content: `Extract deliverable items from this meeting transcript:\n\n${transcript.slice(0, 100_000)}`,
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;

    const raw = block.text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(raw) as RawAIExtraction;
    const list = Array.isArray(parsed.task)
      ? parsed.task
      : Array.isArray(parsed.tasks)
        ? parsed.tasks
        : null;
    if (!list) return null;

    const task: ProposedTask[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (task.length >= MAX_TASK) break;
      const t = normalizeProposed(item);
      if (!t) continue;
      const key = t.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      task.push(groundTask(t, grounding));
    }
    if (task.length === 0) return null;

    return { task, method: "ai" };
  } catch (err) {
    console.error("[meeting-task] AI path failed; falling back to heuristic:", err);
    return null;
  }
}

export interface GenerateMeetingTaskInput {
  transcript: string;
  summary?: string | null;
  grounding?: MeetingGrounding | null;
  plaudFileId?: string | null;
}

/**
 * Extract 1–8 deliverable-shaped items.
 * 1. Ask Plaud (`/ask/v2/ask`) when plaudFileId + auth — method "ask"
 * 2. Plaud note action-item section (method "note")
 * 3. Claude when ANTHROPIC_API_KEY is set (method "ai")
 * 4. Line/bullet heuristic
 * Then ground owners against the roster.
 */
export async function generateTaskFromMeeting(
  input: GenerateMeetingTaskInput,
): Promise<TaskExtraction> {
  const grounding = input.grounding ?? null;
  if (input.plaudFileId) {
    const asked = await extractWithAsk(input.plaudFileId, grounding);
    if (asked && asked.task.length > 0) return asked;
  }
  const summary = (input.summary ?? "").trim();
  if (summary) {
    const fromNote = parseActionItem(summary).map((t) => groundTask(t, grounding));
    if (fromNote.length > 0) return { task: fromNote, method: "note" };
  }

  const text = input.transcript.trim();
  if (!text) return { task: [], method: "heuristic" };

  const ai = await extractWithClaude(text, grounding);
  if (ai && ai.task.length > 0) return ai;

  return {
    task: extractHeuristic(text).map((t) => groundTask(t, grounding)),
    method: "heuristic",
  };
}

/**
 * Transcript-only entry (no roster). Kept for callers that have no grounding.
 */
export async function generateTaskFromTranscript(
  transcript: string,
): Promise<TaskExtraction> {
  return generateTaskFromMeeting({ transcript });
}
