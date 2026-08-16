import { describe, expect, it } from "vitest";
import {
  formatTaskDescription,
  generateTaskFromMeeting,
  groundTask,
  parseActionItem,
  resolvePerson,
  resolveProject,
  type MeetingGrounding,
  type ProposedTask,
} from "../../../api/src/services/meeting-task.service";

const roster = [
  { teamMemberId: 1, name: "Prince Wagan", role: "pm" },
  { teamMemberId: 2, name: "Angelo Revelo", role: "fullstack" },
  { teamMemberId: 3, name: "David Remo", role: "design" },
  { teamMemberId: 4, name: "Anthony Ramos", role: "frontend" },
];

const grounding: MeetingGrounding = {
  roster,
  project: { projectId: 99, title: "Inbox", clientName: "ADVO Inbox" },
  catalog: [
    { projectId: 99, title: "Inbox", clientName: "ADVO Inbox" },
    { projectId: 7, title: "Felici Gelato", clientName: "Felici" },
    { projectId: 8, title: "Coffee Rush", clientName: "Coffee Rush" },
  ],
};

function bare(partial: Partial<ProposedTask> & { title: string }): ProposedTask {
  return {
    description: "From Plaud note.",
    suggestedSkill: "general",
    assignedTo: null,
    assigneeName: null,
    ownerRaw: null,
    projectId: null,
    ...partial,
  };
}

describe("resolvePerson", () => {
  it("maps spoken first names and gelo alias to roster ids", () => {
    expect(resolvePerson("Prince", roster)).toMatchObject({
      assignedTo: 1,
      assigneeName: "Prince Wagan",
    });
    expect(resolvePerson("Gelo", roster)).toMatchObject({
      assignedTo: 2,
      assigneeName: "Angelo Revelo",
    });
    expect(resolvePerson("unknown intern", roster).assignedTo).toBeNull();
  });
});

describe("parseActionItem", () => {
  it("reads a Plaud Action Items section with owners", () => {
    const note = `## Summary
Talked about the hero.

## Action Items
- Prince: ship the Felici hero
- Gelo to wire the login API
- [ ] Anthony — restyle the FAQ

## Other
Ignore this.`;
    const task = parseActionItem(note);
    expect(task.map((t) => t.ownerRaw)).toEqual(["Prince", "Gelo", "Anthony"]);
    expect(task[0]?.title.toLowerCase()).toContain("hero");
  });

  it("reads a Next Arrangements checkbox block", () => {
    const note = `## Meeting Notes
- Discussion centered on a roadmap.

## Next Arrangements
- [ ] Refine the scheduling system
- [ ] Set up an Advo Vercel account
`;
    const task = parseActionItem(note);
    expect(task.map((t) => t.title)).toEqual([
      "Refine the scheduling system",
      "Set up an Advo Vercel account",
    ]);
  });
});

describe("groundTask + resolveProject", () => {
  it("assigns Prince and moves an Inbox ask onto Felici", () => {
    const grounded = groundTask(
      bare({
        title: "Ship the Felici Gelato hero",
        ownerRaw: "Prince",
      }),
      grounding,
    );
    expect(grounded.assignedTo).toBe(1);
    expect(grounded.projectId).toBe(7);
  });

  it("keeps a non-inbox project", () => {
    expect(
      resolveProject("anything", {
        ...grounding,
        project: { projectId: 8, title: "Coffee Rush", clientName: "Coffee Rush" },
      }),
    ).toBe(8);
  });
});

describe("generateTaskFromMeeting", () => {
  it("prefers Plaud note action items over the transcript", async () => {
    const extraction = await generateTaskFromMeeting({
      transcript: "Prince: ignore this chitchat about lunch",
      summary: "## Action Items\n- David: design the Felici hero",
      grounding,
    });
    expect(extraction.method).toBe("note");
    expect(extraction.task).toHaveLength(1);
    expect(extraction.task[0]?.assignedTo).toBe(3);
    expect(extraction.task[0]?.projectId).toBe(7);
  });
});

describe("formatTaskDescription", () => {
  it("prefixes suggested skill once", () => {
    const text = formatTaskDescription(
      bare({ title: "Ship hero", description: "Do the thing.", suggestedSkill: "frontend" }),
    );
    expect(text).toBe("Suggested skill: frontend\n\nDo the thing.");
  });
});
