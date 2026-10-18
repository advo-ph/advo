import { describe, expect, it } from "vitest";
import { normalizeOptionalListValue, parseMoneyInput } from "@/lib/project-form";
import { readCode } from "./read-source.js";

describe("project form money inputs", () => {
  it("converts PHP amounts to integer cents and keeps empty inputs safe", () => {
    expect(parseMoneyInput("60000")).toBe(6_000_000);
    expect(parseMoneyInput("60000.50")).toBe(6_000_050);
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("not a number")).toBe(0);
    expect(parseMoneyInput("-1")).toBe(0);
  });

  it("does not turn an empty optional list price into a zero discount basis", () => {
    expect(normalizeOptionalListValue(null)).toBeNull();
    expect(normalizeOptionalListValue(0)).toBeNull();
    expect(normalizeOptionalListValue(6_000_000)).toBe(6_000_000);
  });
});

describe("project form fields", () => {
  it("keeps contract URL and tech stack out of both project forms", () => {
    const createEditForm = readCode("apps/web/src/components/admin/AdminProjects.tsx");
    const commandCenterEditForm = readCode(
      "apps/web/src/components/admin/shared/EditProjectDialog.tsx",
    );

    expect(createEditForm).not.toContain(">Contract URL</label>");
    expect(createEditForm).not.toContain(">Tech Stack (comma-separated)</label>");
    expect(commandCenterEditForm).not.toContain(">Contract URL</label>");
    expect(commandCenterEditForm).not.toContain(">Tech stack (comma-separated)</label>");
  });
});
