import { describe, it, expect } from "vitest";
import { projectFormMode } from "@/lib/project-form";

describe("projectFormMode", () => {
  it("returns closed when isOpen is false", () => {
    expect(projectFormMode(false, null)).toBe("closed");
    expect(projectFormMode(false, { project_id: 1 })).toBe("closed");
  });

  it("returns create when open with no editing project", () => {
    expect(projectFormMode(true, null)).toBe("create");
  });

  it("returns edit when open with an editing project", () => {
    expect(projectFormMode(true, { project_id: 1, title: "Acme" })).toBe("edit");
  });

  it("treats undefined editing project as create when open", () => {
    expect(projectFormMode(true, undefined as unknown as null)).toBe("create");
  });
});
