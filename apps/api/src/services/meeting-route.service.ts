/**
 * Which project a recording belongs to, read from its title and Plaud summary.
 *
 * The Open API carries no tags or folders, and the account it reads is a person's
 * whole Plaud — lectures and personal notes sit beside client meetings. So a
 * recording only becomes a meeting when its words name ADVO or one of the
 * projects; everything else is skipped, never imported into Inbox.
 *
 * Keywords are each project's full title and client name, plus the aliases below
 * for the names people actually say out loud ("Myriad", "Power Mac Center").
 */
import { eq, ne } from "drizzle-orm";
import { db } from "../db/connection.js";
import { client, project } from "../db/schema.js";

export type RouteCandidate = { projectId: number; title: string; strong: string[]; weak: string[] };

export type RouteResult = {
  projectId: number | null;
  isAdvo: boolean;
  score: number;
  matched: string[];
};

/**
 * Lowercase project-title fragment → the names people say for it. Strong names are
 * distinctive enough to stand alone (including Plaud's own spellings: "Felichi",
 * "Advol Parks"). Weak ones are ordinary words — flood, parking, coffee — that
 * only count when the recording also names ADVO; a climate lecture says "flood"
 * and a law class says "city" all the time.
 */
const PROJECT_ALIAS: Record<string, { strong: string[]; weak: string[] }> = {
  fourlinq: { strong: ["fourlinq", "four linq", "fourlink", "power mac center"], weak: ["windows and doors"] },
  funride: { strong: ["myriad", "fun ride", "funride", "one ride"], weak: [] },
  vbe: { strong: ["vbe"], weak: ["eye center"] },
  nokohi: { strong: ["nokohi"], weak: [] },
  felici: { strong: ["felici", "felichi"], weak: ["gelato"] },
  flood: {
    strong: ["floodpass", "watec", "advo flood", "flood map", "flood sensor", "flood depth"],
    weak: ["flood", "san juan"],
  },
  advopark: { strong: ["advopark", "advo park", "advol park", "advol parks"], weak: ["parking"] },
  school: { strong: ["advo school"], weak: ["school id"] },
  pcedm: { strong: ["pcedm"], weak: [] },
  tmc: { strong: ["tmc registry"], weak: ["tmc", "medical city"] },
  "coffee rush": { strong: ["coffee rush"], weak: ["eastridge"] },
  "camps ph": { strong: ["camps ph"], weak: [] },
  "flowers and chocolates": { strong: ["flowers and chocolates"], weak: [] },
};

/** Client names that say nothing about which project (ADVO's own bucket). */
const GENERIC_CLIENT = new Set(["advo inbox"]);

function phraseOf(text: string | null): string {
  return (text ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

export function keywordFor(projectTitle: string, companyName: string | null): { strong: string[]; weak: string[] } {
  const title = phraseOf(projectTitle);
  const company = phraseOf(companyName);
  const strong = new Set<string>([title]);
  if (company && !GENERIC_CLIENT.has(company)) strong.add(company);
  const weak = new Set<string>();
  for (const [fragment, alias] of Object.entries(PROJECT_ALIAS)) {
    if (title.replace(/\s+/g, "").includes(fragment.replace(/\s+/g, ""))) {
      for (const a of alias.strong) strong.add(a);
      for (const a of alias.weak) weak.add(a);
    }
  }
  return { strong: [...strong].filter(Boolean), weak: [...weak] };
}

function countOf(haystack: string, needle: string): number {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  return (haystack.match(new RegExp(`\\b${escaped}\\b`, "gi")) ?? []).length;
}

/**
 * A strong name weighs 6 in the title and 2 per summary mention (5 at most); a weak
 * word 2 and 1 (3 at most), so "Power Mac Center" in a title outweighs a summary
 * that says "parking" five times. A project wins only
 * with score >= 2 and a strict lead over the runner-up; a tie stays unrouted
 * (Inbox) rather than guessed. A recording is ADVO when it says "ADVO" or hits a
 * strong name; weak words never make a recording ADVO on their own.
 */
export function routeRecording(
  text: { title: string; summary?: string | null },
  candidate: RouteCandidate[],
): RouteResult {
  const title = text.title ?? "";
  const summary = text.summary ?? "";
  const sayAdvo = /\badvo\b/i.test(title) || /\badvo\b/i.test(summary);
  let isStrongHit = false;
  const scored = candidate
    .map((c) => {
      let score = 0;
      const matched: string[] = [];
      const keyword = sayAdvo ? [...c.strong, ...c.weak] : c.strong;
      for (const k of keyword) {
        const isStrong = c.strong.includes(k);
        const hit = isStrong
          ? countOf(title, k) * 6 + Math.min(countOf(summary, k), 5) * 2
          : countOf(title, k) * 2 + Math.min(countOf(summary, k), 3);
        if (hit > 0) {
          score += hit;
          matched.push(k);
          if (isStrong) isStrongHit = true;
        }
      }
      return { projectId: c.projectId, score, matched };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  const isAdvo = sayAdvo || isStrongHit;
  if (isAdvo && best && best.score >= 2 && (!runnerUp || best.score > runnerUp.score)) {
    return { projectId: best.projectId, isAdvo, score: best.score, matched: best.matched };
  }
  return { projectId: null, isAdvo, score: best?.score ?? 0, matched: best?.matched ?? [] };
}

/** Every project except Inbox, with its keywords. */
export async function routeCandidate(): Promise<RouteCandidate[]> {
  const row = await db()
    .select({ projectId: project.projectId, title: project.title, companyName: client.companyName })
    .from(project)
    .leftJoin(client, eq(client.clientId, project.clientId))
    .where(ne(project.title, "Inbox"));
  return row.map((r) => ({ projectId: r.projectId, title: r.title, ...keywordFor(r.title, r.companyName) }));
}
