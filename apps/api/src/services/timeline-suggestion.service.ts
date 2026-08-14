/**
 * AI timeline suggestion for a project.
 *
 * Given project context, deliverable list, and optional contract notes,
 * proposes a phase/milestone plan with reasonable (not heroic) deadlines
 * for a small vibe-coding team.
 *
 * Claude when ANTHROPIC_API_KEY is set; heuristic fallback otherwise.
 */
import Anthropic from "@anthropic-ai/sdk";

export type TimelineMethod = "heuristic" | "ai";

export interface TimelineDeliverableInput {
  title: string;
  description?: string | null;
  priority?: number | null;
  status?: string | null;
}

export interface TimelineProjectInput {
  title: string;
  description?: string | null;
  projectStatus?: string | null;
  techStack?: string[] | null;
  totalValueCents?: number | null;
}

export interface TimelinePhase {
  name: string;
  durationDays: number;
  startOffsetDays: number;
  endOffsetDays: number;
  deliverableTitle: string[];
  note: string;
}

export interface TimelineMilestone {
  title: string;
  offsetDays: number;
  note: string;
}

export interface TimelineSuggestion {
  summary: string;
  totalDurationDays: number;
  phase: TimelinePhase[];
  milestone: TimelineMilestone[];
  assumption: string[];
  risk: string[];
  method: TimelineMethod;
  disclaimer: string;
}

export interface SuggestTimelineInput {
  project: TimelineProjectInput;
  deliverable: TimelineDeliverableInput[];
  contractNotes?: string | null;
  /** ISO date (YYYY-MM-DD) planning start; defaults to today UTC. */
  startDate?: string | null;
}

const DISCLAIMER =
  "Planning aid for ADVO's vibe-coding team — reasonable, not heroic, deadlines. Not a binding commitment; adjust for school blackouts and client feedback latency.";

const MAX_DELIVERABLE = 50;
const MAX_PHASE = 8;
const MAX_MILESTONE = 12;
const MAX_NOTE = 500;
const MAX_ASSUMPTION = 8;
const MAX_RISK = 8;

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function clampStr(raw: unknown, max: number, fallback = ""): string {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function normalizeTitleList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = clampStr(item, 255);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

function normalizeStringList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = clampStr(item, MAX_NOTE);
    if (!s) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function normalizePhase(raw: unknown, fallbackStart: number): TimelinePhase | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = clampStr(r.name, 120);
  if (!name) return null;
  const durationDays = clampInt(r.durationDays ?? r.duration_days, 1, 90, 5);
  const startOffsetDays = clampInt(
    r.startOffsetDays ?? r.start_offset_days,
    0,
    365,
    fallbackStart,
  );
  const endOffsetDays = clampInt(
    r.endOffsetDays ?? r.end_offset_days,
    startOffsetDays + 1,
    400,
    startOffsetDays + durationDays,
  );
  return {
    name,
    durationDays,
    startOffsetDays,
    endOffsetDays: Math.max(endOffsetDays, startOffsetDays + 1),
    deliverableTitle: normalizeTitleList(r.deliverableTitle ?? r.deliverable_title),
    note: clampStr(r.note, MAX_NOTE),
  };
}

function normalizeMilestone(raw: unknown): TimelineMilestone | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = clampStr(r.title, 255);
  if (!title) return null;
  return {
    title,
    offsetDays: clampInt(r.offsetDays ?? r.offset_days, 0, 400, 0),
    note: clampStr(r.note, MAX_NOTE),
  };
}

// ---------------------------------------------------------------------------
// Heuristic: phase plan from status + deliverable count + stack signal
// ---------------------------------------------------------------------------

const PHASE_BASE: Array<{ name: string; baseDays: number }> = [
  { name: "Discovery", baseDays: 3 },
  { name: "Architecture", baseDays: 3 },
  { name: "Development", baseDays: 10 },
  { name: "Testing & polish", baseDays: 4 },
  { name: "Ship", baseDays: 2 },
];

const STATUS_START_INDEX: Record<string, number> = {
  discovery: 0,
  architecture: 1,
  development: 2,
  testing: 3,
  shipped: 4,
};

function complexityMultiplier(project: TimelineProjectInput, count: number): number {
  let m = 1;
  const stack = (project.techStack ?? []).join(" ").toLowerCase();
  if (/\b(next|react|vue|svelte|node|postgres|supabase|auth|stripe|payment)\b/.test(stack)) {
    m += 0.15;
  }
  if (/\b(native|mobile|ios|android|ml|ai|realtime|websocket)\b/.test(stack)) {
    m += 0.25;
  }
  if (count >= 8) m += 0.3;
  else if (count >= 4) m += 0.15;
  const value = project.totalValueCents ?? 0;
  if (value >= 150_000_00) m += 0.25; // ≥ ₱150k
  else if (value >= 70_000_00) m += 0.1;
  // Cap — never schedule "heroic" compressed weeks for large scope
  return Math.min(2.2, Math.max(0.85, m));
}

function heuristicSuggest(input: SuggestTimelineInput): TimelineSuggestion {
  const { project, deliverable } = input;
  const open = deliverable.filter((d) => {
    const s = (d.status ?? "not_started").toLowerCase();
    return s !== "completed";
  });
  const titles = (open.length ? open : deliverable).map((d) => d.title).filter(Boolean);
  const count = Math.max(titles.length, 1);
  const mult = complexityMultiplier(project, count);
  const startIdx = STATUS_START_INDEX[project.projectStatus ?? "discovery"] ?? 0;

  const phase: TimelinePhase[] = [];
  let cursor = 0;
  const remaining = PHASE_BASE.slice(startIdx);

  for (let i = 0; i < remaining.length; i++) {
    const base = remaining[i];
    let days = Math.round(base.baseDays * mult);
    // Spread deliverables mostly into Development
    if (base.name === "Development") {
      days = Math.max(days, Math.round(count * 2.5 * mult));
    }
    days = clampInt(days, 1, 60, 5);

    const assigned =
      base.name === "Development"
        ? titles.slice(0, 12)
        : base.name === "Testing & polish"
          ? titles.slice(0, 6).map((t) => `QA: ${t}`)
          : [];

    phase.push({
      name: base.name,
      durationDays: days,
      startOffsetDays: cursor,
      endOffsetDays: cursor + days,
      deliverableTitle: assigned,
      note:
        base.name === "Discovery"
          ? "Scope lock, kickoff, asset gather — do not start build until notes are clear."
          : base.name === "Development"
            ? "Parallelize only where safe; leave buffer for revision rounds."
            : base.name === "Testing & polish"
              ? "Client preview + one batched feedback round before ship."
              : "",
    });
    cursor += days;
  }

  // Soft week-boundary padding if total is very short for multi-deliverable work
  if (count >= 3 && cursor < 14) {
    const pad = 14 - cursor;
    const dev = phase.find((p) => p.name === "Development");
    if (dev) {
      dev.durationDays += pad;
      dev.endOffsetDays += pad;
      let shift = false;
      for (const p of phase) {
        if (p === dev) {
          shift = true;
          continue;
        }
        if (shift) {
          p.startOffsetDays += pad;
          p.endOffsetDays += pad;
        }
      }
      cursor += pad;
    }
  }

  const totalDurationDays = phase.length
    ? phase[phase.length - 1].endOffsetDays
    : 14;

  const milestone: TimelineMilestone[] = [
    {
      title: "Kickoff / scope confirmed",
      offsetDays: phase[0]?.startOffsetDays ?? 0,
      note: "Written scope + deliverable list agreed.",
    },
  ];
  const dev = phase.find((p) => p.name === "Development");
  if (dev) {
    milestone.push({
      title: "First internal preview",
      offsetDays: Math.round((dev.startOffsetDays + dev.endOffsetDays) / 2),
      note: "Happy-path demo for team before client.",
    });
  }
  const test = phase.find((p) => p.name === "Testing & polish");
  if (test) {
    milestone.push({
      title: "Client preview",
      offsetDays: test.startOffsetDays,
      note: "One batched feedback list within 5 business days.",
    });
  }
  milestone.push({
    title: "Ship / handoff",
    offsetDays: totalDurationDays,
    note: "Deploy + credentials + short handoff note.",
  });

  const assumption = [
    "Team capacity is part-time vibe-coding, not full-time war-room.",
    "Client feedback returns within 5 business days per revision round.",
    "No major out-of-scope change orders mid-build.",
    "School / blackout calendar does not erase more than ~20% of calendar days.",
  ];

  const risk: string[] = [];
  if (count >= 6) {
    risk.push("High deliverable count — sequence ruthlessly; defer nice-to-haves.");
  }
  if ((project.totalValueCents ?? 0) > 0 && (project.totalValueCents ?? 0) < 30_000_00) {
    risk.push("Budget is tight relative to scope — keep the plan lean.");
  }
  risk.push("Heroic single-week compressions fail when feedback or school blocks land.");
  if (!titles.length) {
    risk.push("No open deliverables provided — plan is phase-only until tasks are listed.");
  }

  const summary = [
    `Suggested ~${totalDurationDays} calendar days for "${project.title}"`,
    `from ${project.projectStatus ?? "discovery"}`,
    `(${count} open deliverable${count === 1 ? "" : "s"}, complexity ×${mult.toFixed(2)}).`,
    "Paced for a small vibe-coding team — buffer over heroics.",
  ].join(" ");

  return {
    summary,
    totalDurationDays,
    phase,
    milestone: milestone.slice(0, MAX_MILESTONE),
    assumption,
    risk,
    method: "heuristic",
    disclaimer: DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// AI path
// ---------------------------------------------------------------------------

const AI_SYSTEM = `You are a project planner for ADVO, a small Philippine web/design agency run as a vibe-coding team (students + builders, not a 40-hour corporate bench).

Propose a realistic delivery timeline: reasonable deadlines, never heroic. Prefer calendar buffers for school blackouts, client feedback latency (5 business days per revision round), and revision caps (2 rounds per phase). Do not compress multi-week builds into a single crunch week.

Use ADVO phases when they fit: Discovery → Architecture → Development → Testing & polish → Ship. Skip phases already past given projectStatus. Map provided deliverables into the right phase (mostly Development / Testing).

Respond with ONLY a JSON object (no prose, no markdown code fences) of exactly this shape:
{
  "summary": "<1-2 sentences>",
  "totalDurationDays": <int>,
  "phase": [
    {
      "name": "Development",
      "durationDays": 12,
      "startOffsetDays": 6,
      "endOffsetDays": 18,
      "deliverableTitle": ["Home page", "Auth"],
      "note": "optional short note"
    }
  ],
  "milestone": [
    { "title": "Client preview", "offsetDays": 18, "note": "optional" }
  ],
  "assumption": ["..."],
  "risk": ["..."]
}

Rules:
- Offsets are calendar days from planning start (0 = start day).
- phase: 2–6 items; each durationDays 1–60; endOffsetDays > startOffsetDays
- milestone: 2–8 items
- assumption / risk: 1–6 short strings each
- totalDurationDays must match the last phase endOffsetDays (or be within ±2)
- Prefer 2–6 weeks for a typical site/app; only go longer when deliverable count or notes demand it
- Collection keys are singular: phase, milestone, assumption, risk, deliverableTitle
- Never invent client promises tighter than the plan supports`;

interface RawAISuggestion {
  summary?: string;
  totalDurationDays?: number;
  total_duration_days?: number;
  phase?: unknown[];
  phases?: unknown[];
  milestone?: unknown[];
  milestones?: unknown[];
  assumption?: unknown[];
  assumptions?: unknown[];
  risk?: unknown[];
  risks?: unknown[];
}

function normalizeSuggestion(parsed: RawAISuggestion, method: TimelineMethod): TimelineSuggestion | null {
  const phaseRaw = Array.isArray(parsed.phase)
    ? parsed.phase
    : Array.isArray(parsed.phases)
      ? parsed.phases
      : null;
  if (!phaseRaw || phaseRaw.length === 0) return null;

  const phase: TimelinePhase[] = [];
  let fallbackStart = 0;
  for (const item of phaseRaw) {
    if (phase.length >= MAX_PHASE) break;
    const p = normalizePhase(item, fallbackStart);
    if (!p) continue;
    phase.push(p);
    fallbackStart = p.endOffsetDays;
  }
  if (phase.length === 0) return null;

  const milestoneRaw = Array.isArray(parsed.milestone)
    ? parsed.milestone
    : Array.isArray(parsed.milestones)
      ? parsed.milestones
      : [];
  const milestone: TimelineMilestone[] = [];
  for (const item of milestoneRaw) {
    if (milestone.length >= MAX_MILESTONE) break;
    const m = normalizeMilestone(item);
    if (m) milestone.push(m);
  }
  if (milestone.length === 0) {
    milestone.push({
      title: "Ship / handoff",
      offsetDays: phase[phase.length - 1].endOffsetDays,
      note: "",
    });
  }

  const lastEnd = phase[phase.length - 1].endOffsetDays;
  const totalDurationDays = clampInt(
    parsed.totalDurationDays ?? parsed.total_duration_days,
    1,
    400,
    lastEnd,
  );

  return {
    summary: clampStr(parsed.summary, 500, `Suggested ~${totalDurationDays}-day plan.`),
    totalDurationDays: Math.max(totalDurationDays, lastEnd),
    phase,
    milestone,
    assumption: normalizeStringList(
      parsed.assumption ?? parsed.assumptions,
      MAX_ASSUMPTION,
    ),
    risk: normalizeStringList(parsed.risk ?? parsed.risks, MAX_RISK),
    method,
    disclaimer: DISCLAIMER,
  };
}

function buildUserPayload(input: SuggestTimelineInput): string {
  const deliverable = input.deliverable.slice(0, MAX_DELIVERABLE).map((d) => ({
    title: d.title,
    description: d.description ?? null,
    priority: d.priority ?? null,
    status: d.status ?? null,
  }));

  return JSON.stringify(
    {
      project: {
        title: input.project.title,
        description: input.project.description ?? null,
        projectStatus: input.project.projectStatus ?? null,
        techStack: input.project.techStack ?? [],
        totalValueCents: input.project.totalValueCents ?? 0,
      },
      deliverable,
      contractNotes: input.contractNotes?.trim() || null,
      startDate: input.startDate ?? null,
    },
    null,
    2,
  );
}

async function suggestWithClaude(
  input: SuggestTimelineInput,
): Promise<TimelineSuggestion | null> {
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
          content: `Suggest a reasonable project timeline for this engagement:\n\n${buildUserPayload(input).slice(0, 100_000)}`,
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
    const parsed = JSON.parse(raw) as RawAISuggestion;
    return normalizeSuggestion(parsed, "ai");
  } catch (err) {
    console.error("[timeline-suggestion] AI path failed; falling back to heuristic:", err);
    return null;
  }
}

/**
 * Suggest a phase/milestone timeline for a project.
 * Uses Claude when ANTHROPIC_API_KEY is set; otherwise (or on AI failure)
 * falls back to a complexity heuristic.
 */
export async function suggestTimeline(
  input: SuggestTimelineInput,
): Promise<TimelineSuggestion> {
  const normalized: SuggestTimelineInput = {
    project: {
      title: clampStr(input.project.title, 255, "Project"),
      description: input.project.description ?? null,
      projectStatus: input.project.projectStatus ?? null,
      techStack: input.project.techStack ?? [],
      totalValueCents: input.project.totalValueCents ?? 0,
    },
    deliverable: (input.deliverable ?? [])
      .slice(0, MAX_DELIVERABLE)
      .map((d) => ({
        title: clampStr(d.title, 255),
        description: d.description ?? null,
        priority: d.priority ?? null,
        status: d.status ?? null,
      }))
      .filter((d) => d.title.length > 0),
    contractNotes: input.contractNotes?.trim() || null,
    startDate: input.startDate ?? null,
  };

  const ai = await suggestWithClaude(normalized);
  if (ai) return ai;
  return heuristicSuggest(normalized);
}
