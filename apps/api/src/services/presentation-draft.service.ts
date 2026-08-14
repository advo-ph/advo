/**
 * Final client presentation draft (markdown outline).
 *
 * Builds a slide/section outline from project title + deliverable list.
 * Claude when ANTHROPIC_API_KEY is set; structured template otherwise.
 * Response-primary — no file storage.
 */
import Anthropic from "@anthropic-ai/sdk";

export type PresentationDraftMethod = "ai" | "template";

export interface PresentationDeliverableInput {
  title: string;
  description?: string | null;
  status?: string | null;
}

export interface PresentationProjectInput {
  title: string;
  description?: string | null;
  projectStatus?: string | null;
  techStack?: string[] | null;
}

export interface PresentationDraftInput {
  project: PresentationProjectInput;
  deliverable: PresentationDeliverableInput[];
  clientName?: string | null;
  /** Optional extra notes (scope, wins, next steps) to weave in. */
  note?: string | null;
}

export interface PresentationDraft {
  markdown: string;
  method: PresentationDraftMethod;
  disclaimer: string;
}

const DISCLAIMER =
  "Draft outline for ADVO's final client presentation — edit before the live walkthrough. Not a recorded deliverable; no file is stored.";

const MAX_DELIVERABLE = 50;
const MAX_MARKDOWN = 20_000;
const MAX_TITLE = 255;
const MAX_NOTE = 4000;

function clampStr(raw: unknown, max: number, fallback = ""): string {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function normalizeInput(input: PresentationDraftInput): PresentationDraftInput {
  return {
    project: {
      title: clampStr(input.project.title, MAX_TITLE, "Project"),
      description: input.project.description ?? null,
      projectStatus: input.project.projectStatus ?? null,
      techStack: input.project.techStack ?? [],
    },
    deliverable: (input.deliverable ?? [])
      .slice(0, MAX_DELIVERABLE)
      .map((d) => ({
        title: clampStr(d.title, MAX_TITLE),
        description: d.description ?? null,
        status: d.status ?? null,
      }))
      .filter((d) => d.title.length > 0),
    clientName: input.clientName?.trim() || null,
    note: input.note?.trim() || null,
  };
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return status.replace(/_/g, " ");
}

/**
 * Deterministic markdown outline when AI is unavailable.
 * Section order mirrors a typical ADVO client close-out deck.
 */
function templateDraft(input: PresentationDraftInput): string {
  const title = input.project.title;
  const client = input.clientName?.trim() || "Client";
  const tech =
    input.project.techStack && input.project.techStack.length > 0
      ? input.project.techStack.join(", ")
      : null;
  const description = (input.project.description ?? "").trim();
  const deliverable = input.deliverable;
  const note = (input.note ?? "").trim();

  const line: string[] = [];
  line.push(`# Final presentation — ${title}`);
  line.push("");
  line.push(`*Prepared for ${client} · ADVO*`);
  line.push("");
  line.push("---");
  line.push("");
  line.push("## 1. Welcome & agenda");
  line.push("");
  line.push("- Greeting and introductions");
  line.push("- Agenda: goals → what we built → walkthrough → handoff → next steps");
  line.push("- Timebox and Q&A window");
  line.push("");
  line.push("## 2. Engagement goals");
  line.push("");
  if (description) {
    line.push(description);
    line.push("");
  } else {
    line.push(`- Restate the original brief for **${title}**`);
    line.push("- Confirm success criteria the client cares about");
    line.push("");
  }
  if (tech) {
    line.push(`**Stack:** ${tech}`);
    line.push("");
  }
  line.push("## 3. Deliverable walkthrough");
  line.push("");
  if (deliverable.length === 0) {
    line.push("- *(No deliverables on record — add titles before the meeting.)*");
    line.push("");
  } else {
    deliverable.forEach((d, i) => {
      const n = i + 1;
      const st = statusLabel(d.status);
      line.push(`### 3.${n} ${d.title}${st ? ` _(${st})_` : ""}`);
      line.push("");
      if (d.description?.trim()) {
        line.push(d.description.trim());
        line.push("");
      } else {
        line.push("- Demo / screenshot");
        line.push("- What changed for the client");
        line.push("- Open items (if any)");
        line.push("");
      }
    });
  }
  line.push("## 4. Live preview");
  line.push("");
  line.push("- Open the project preview URL");
  line.push("- Walk primary flows end-to-end");
  line.push("- Note feedback for the revision round (2 rounds/phase policy)");
  line.push("");
  line.push("## 5. Handoff & access");
  line.push("");
  line.push("- Credentials / CMS / hosting ownership");
  line.push("- Documentation and source repo");
  line.push("- Support window and how to request changes");
  line.push("");
  line.push("## 6. Next steps");
  line.push("");
  line.push("- Confirm go-live or remaining blockers");
  line.push("- Schedule follow-up if needed");
  line.push("- Invoice / contract close-out notes");
  line.push("");
  if (note) {
    line.push("## 7. Team notes");
    line.push("");
    line.push(note);
    line.push("");
  }
  line.push("---");
  line.push("");
  line.push("_Draft outline — refine talking points before presenting._");
  return line.join("\n");
}

const AI_SYSTEM = `You write a concise markdown outline for ADVO's final client presentation (Philippine web/design agency).

Rules:
- Output ONLY markdown (no preamble, no code fences wrapping the whole document).
- Structure as a slide/section outline the team can present live — headings, short bullets, optional sub-sections per deliverable.
- Use the project title and every deliverable provided; do not invent deliverables that are not listed.
- Include: welcome/agenda, goals, deliverable walkthrough, live preview, handoff, next steps.
- Keep it practical and client-facing; avoid internal jargon and billing legalese beyond a light revision-round mention if relevant.
- Prefer tight bullets over long paragraphs. Cap total length around a 15–20 minute presentation.`;

function buildUserPayload(input: PresentationDraftInput): string {
  return JSON.stringify(
    {
      project: {
        title: input.project.title,
        description: input.project.description ?? null,
        projectStatus: input.project.projectStatus ?? null,
        techStack: input.project.techStack ?? [],
      },
      deliverable: input.deliverable.map((d) => ({
        title: d.title,
        description: d.description ?? null,
        status: d.status ?? null,
      })),
      clientName: input.clientName ?? null,
      note: input.note ?? null,
    },
    null,
    2,
  );
}

function sanitizeMarkdown(raw: string): string | null {
  let md = raw
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (md.length < 40) return null;
  if (md.length > MAX_MARKDOWN) {
    md = md.slice(0, MAX_MARKDOWN - 1).trimEnd() + "…";
  }
  return md;
}

async function draftWithClaude(
  input: PresentationDraftInput,
): Promise<string | null> {
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
          content: `Write the final client presentation markdown outline for this engagement:\n\n${buildUserPayload(input).slice(0, 100_000)}`,
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    return sanitizeMarkdown(block.text);
  } catch (err) {
    console.error("[presentation-draft] AI path failed; falling back to template:", err);
    return null;
  }
}

/**
 * Build a markdown presentation outline from project + deliverable list.
 * Claude when ANTHROPIC_API_KEY is set; template otherwise / on AI failure.
 */
export async function buildPresentationDraft(
  input: PresentationDraftInput,
): Promise<PresentationDraft> {
  const normalized = normalizeInput(input);

  const ai = await draftWithClaude(normalized);
  if (ai) {
    return { markdown: ai, method: "ai", disclaimer: DISCLAIMER };
  }

  return {
    markdown: templateDraft(normalized),
    method: "template",
    disclaimer: DISCLAIMER,
  };
}
