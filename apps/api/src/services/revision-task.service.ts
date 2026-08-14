/**
 * Format a client revision note into a deliverable description.
 *
 * Always appends the CONTRACTS.md revision-limit policy reminder
 * (2 rounds per phase). When ANTHROPIC_API_KEY is set, polishRevisionNote()
 * may clean the note into a clearer action list; on missing key or any AI
 * error the raw note is used unchanged.
 */
import Anthropic from "@anthropic-ai/sdk";

export type RevisionMethod = "raw" | "ai";

export interface RevisionTaskBody {
  description: string;
  method: RevisionMethod;
}

const MAX_DESC = 5000;
const MAX_NOTE = 4000;

/** CONTRACTS.md Policy 2 — revision limits (2 rounds/phase). */
export const REVISION_POLICY_REMINDER =
  "Policy reminder (CONTRACTS.md): Each phase — Discovery, Design, and Build — includes two (2) revision rounds. One round = one batched feedback list within 5 business days of the deliverable's preview. Revisions beyond the included rounds are billed at ADVO's then-current hourly rate.";

function clampDescription(raw: string): string {
  const d = raw.trim();
  if (d.length <= MAX_DESC) return d;
  return d.slice(0, MAX_DESC - 1).trimEnd() + "…";
}

function composeDescription(note: string): string {
  const body = note.trim();
  if (!body) return clampDescription(REVISION_POLICY_REMINDER);
  return clampDescription(`${body}\n\n---\n${REVISION_POLICY_REMINDER}`);
}

const AI_SYSTEM = `You rewrite client revision notes for ADVO (a Philippine web/design agency) into a clear internal task description.

Rules:
- Preserve every concrete request the client made. Do not invent scope, features, or deadlines.
- Organize into short bullets when there are multiple items; otherwise keep a tight paragraph.
- Keep the client's intent and wording meaning intact; only polish clarity for the team.
- Do not mention contracts, billing, or revision-round policy (the server appends that).
- Respond with ONLY the polished note text — no title, no markdown fences, no preamble.`;

async function polishWithClaude(note: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: AI_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Polish this client revision note for the team:\n\n${note.slice(0, MAX_NOTE)}`,
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;

    const polished = block.text
      .trim()
      .replace(/^```(?:\w+)?/i, "")
      .replace(/```$/i, "")
      .trim();
    if (polished.length < 3) return null;
    return polished.slice(0, MAX_NOTE);
  } catch (err) {
    console.error("[revision-task] AI polish failed; using raw note:", err);
    return null;
  }
}

/**
 * Build deliverable description from a client revision_note.
 * Claude polish when ANTHROPIC_API_KEY is set; raw note otherwise / on failure.
 * Policy reminder is always appended.
 */
export async function buildRevisionTaskDescription(
  revisionNote: string,
): Promise<RevisionTaskBody> {
  const note = revisionNote.trim();
  if (!note) {
    return { description: composeDescription(""), method: "raw" };
  }

  const polished = await polishWithClaude(note);
  if (polished) {
    return { description: composeDescription(polished), method: "ai" };
  }

  return { description: composeDescription(note), method: "raw" };
}
