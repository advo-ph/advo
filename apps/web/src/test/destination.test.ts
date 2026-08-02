import { describe, it, expect } from "vitest";
import { destinationFor } from "@/lib/destination";

describe("destinationFor", () => {
  it("sends admin to /admin", () => {
    expect(destinationFor("admin")).toBe("/admin");
  });

  it("sends client to /hub", () => {
    expect(destinationFor("client")).toBe("/hub");
  });

  it("sends undefined / other roles to /hub", () => {
    expect(destinationFor(undefined)).toBe("/hub");
    expect(destinationFor("member")).toBe("/hub");
  });

  it("lets explicit redirect override role", () => {
    expect(destinationFor("admin", "/custom")).toBe("/custom");
    expect(destinationFor("client", "/projects/1")).toBe("/projects/1");
    expect(destinationFor(undefined, "/hub?tab=inbox")).toBe("/hub?tab=inbox");
  });

  it("ignores null / empty explicit redirect", () => {
    expect(destinationFor("admin", null)).toBe("/admin");
    expect(destinationFor("admin", "")).toBe("/admin");
    expect(destinationFor("client", undefined)).toBe("/hub");
  });
});
