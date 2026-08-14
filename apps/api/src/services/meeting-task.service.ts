/**
 * Extract actionable tasks from a meeting transcript.
 *
 * If ANTHROPIC_API_KEY is set, generateTaskFromTranscript() runs Claude first
 * and falls back to a line/bullet heuristic on any error, invalid output, or
 * missing key. Returns 1–8 tasks with title, description, and suggested skill.
 */
import Anthropic from "@anthropic-ai/sdk";

export type TaskMethod = "heuristic" | "ai";

export interface ProposedTask {
  title: string;
  description: string;
  suggestedSkill: string;
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

function normalizeSkill(raw: unknown): string {
  const s = String(raw ?? "general")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 40);
  if (SKILL_SET.has(s)) return s;
  // allow free-form short skills, else general
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

// ---------------------------------------------------------------------------
// Heuristic: bullets, numbered lists, action-item prefixes; else long lines
// ---------------------------------------------------------------------------

const BULLET_RE = /^(?:[-*•▪▸◦–—]|\d+[.)]|\[\s*[x ]?\s*\])\s+(.+)$/i;
const ACTION_PREFIX_RE =
  /^(?:action(?:\s*items?)?|todo|to-do|task|follow[- ]?ups?|next steps?|owners?)\s*[:\-–]\s*(.+)$/i;
const OWNER_LINE_RE = /^(?:@?[\w.-]+|[\w.-]+(?:\s+[\w.-]+)?)\s*[:\-–]\s+(.+)$/;

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

function lineToTask(line: string): ProposedTask | null {
  const trimmed = line.trim();
  if (trimmed.length < MIN_TITLE) return null;

  let body: string | null = null;

  const bullet = trimmed.match(BULLET_RE);
  if (bullet?.[1]) body = bullet[1].trim();

  if (!body) {
    const action = trimmed.match(ACTION_PREFIX_RE);
    if (action?.[1]) body = action[1].trim();
  }

  if (!body) {
    // "Prince: ship the hero" style — only if right-hand side is long enough
    const owner = trimmed.match(OWNER_LINE_RE);
    if (owner?.[1] && owner[1].trim().length >= MIN_TITLE) body = owner[1].trim();
  }

  if (!body) return null;
  if (body.length < MIN_TITLE) return null;

  const skill = guessSkill(body);
  return {
    title: clampTitle(body),
    description: `From meeting transcript.`,
    suggestedSkill: skill,
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

  // Fallback: substantial free lines (no bullets) become tasks.
  if (task.length === 0) {
    for (const l of line) {
      if (task.length >= MAX_TASK) break;
      // Skip pure section headers (very short or all-caps short labels)
      if (l.length < 12) continue;
      if (/^[A-Z0-9 /&-]{2,40}:?$/.test(l) && l.length < 40) continue;
      push({
        title: clampTitle(l),
        description: l.length > MAX_TITLE ? clampDescription(l) : "From meeting transcript.",
        suggestedSkill: guessSkill(l),
      });
    }
  }

  return task.slice(0, MAX_TASK);
}

// ---------------------------------------------------------------------------
// AI path (Claude)
// ---------------------------------------------------------------------------

const AI_SYSTEM = `You extract actionable project tasks from a meeting transcript for ADVO, a Philippine web/design agency.

Return 1–8 concrete, assignable tasks the team should do after this meeting. Prefer deliverable-shaped work (ship a page, fix a bug, draft copy, design a screen) over vague notes.

For each task provide:
- title: short imperative (≤120 chars)
- description: 1–3 sentences with enough context to start
- suggestedSkill: one of design | frontend | backend | fullstack | content | pm | devops | qa | general

Respond with ONLY a JSON object (no prose, no markdown code fences) of exactly this shape:
{"task":[{"title":"...","description":"...","suggestedSkill":"frontend"}]}

Rules:
- 1 to 8 items in "task"
- Skip pure chitchat, scheduling logistics, and already-done work
- If the transcript has almost no actions, still return the best 1–3 inferred next steps
- Do not invent client names or scope not present in the transcript`;

interface RawAITask {
  title?: string;
  description?: string;
  suggestedSkill?: string;
  suggested_skill?: string;
}

interface RawAIExtraction {
  task?: RawAITask[];
  tasks?: RawAITask[]; // tolerate plural if model slips
}

function normalizeProposed(raw: RawAITask): ProposedTask | null {
  const title = clampTitle(String(raw.title ?? "").trim());
  if (title.length < MIN_TITLE) return null;
  const description = clampDescription(String(raw.description ?? "").trim() || "From meeting transcript.");
  const skill = normalizeSkill(raw.suggestedSkill ?? raw.suggested_skill);
  return { title, description, suggestedSkill: skill };
}

async function extractWithClaude(transcript: string): Promise<TaskExtraction | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: AI_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Extract tasks from this meeting transcript:\n\n${transcript.slice(0, 100_000)}`,
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
      task.push(t);
    }
    if (task.length === 0) return null;

    return { task, method: "ai" };
  } catch (err) {
    console.error("[meeting-task] AI path failed; falling back to heuristic:", err);
    return null;
  }
}

/**
 * Extract 1–8 tasks from a meeting transcript.
 * Uses Claude when ANTHROPIC_API_KEY is set; otherwise (or on AI failure)
 * falls back to line/bullet heuristic. Caller must reject empty transcript
 * before calling — empty input yields empty task list (not a silent success
 * at the route layer).
 */
export async function generateTaskFromTranscript(
  transcript: string
): Promise<TaskExtraction> {
  const text = transcript.trim();
  if (!text) return { task: [], method: "heuristic" };

  const ai = await extractWithClaude(text);
  if (ai && ai.task.length > 0) return ai;

  return { task: extractHeuristic(text), method: "heuristic" };
}
