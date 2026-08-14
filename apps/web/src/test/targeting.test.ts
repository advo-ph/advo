import { describe, it, expect } from "vitest";
import {
  outreachPriority,
  isOutreachTarget,
  signalFromLeadText,
  leadTextForSignal,
  type DigitalSignal,
} from "@/lib/targeting";

describe("outreachPriority", () => {
  it("returns 0 when hasModernStack is true (do not target)", () => {
    expect(outreachPriority({ hasModernStack: true })).toBe(0);
    expect(
      outreachPriority({
        hasModernStack: true,
        hasWebsite: false,
        digitalScore: 5,
        systemAgeYears: 20,
      }),
    ).toBe(0);
  });

  it("returns 100 when hasWebsite is false", () => {
    expect(outreachPriority({ hasWebsite: false })).toBe(100);
  });

  it("inverts digitalScore (low score → high priority)", () => {
    expect(outreachPriority({ digitalScore: 0 })).toBe(100);
    expect(outreachPriority({ digitalScore: 100 })).toBe(0);
    expect(outreachPriority({ digitalScore: 25 })).toBe(75);
  });

  it("boosts priority for older systems", () => {
    const young = outreachPriority({ systemAgeYears: 1 });
    const old = outreachPriority({ systemAgeYears: 10 });
    expect(old).toBeGreaterThan(young);
    expect(old).toBeGreaterThanOrEqual(40);
  });

  it("clamps digitalScore outside 0–100", () => {
    expect(outreachPriority({ digitalScore: -10 })).toBe(100);
    expect(outreachPriority({ digitalScore: 150 })).toBe(0);
  });

  it("mildly deprioritizes known website with no other signal", () => {
    expect(outreachPriority({ hasWebsite: true })).toBe(30);
  });

  it("defaults sparse signal near mid range", () => {
    expect(outreachPriority({})).toBe(50);
  });
});

describe("isOutreachTarget", () => {
  it("defaults minPriority to 40", () => {
    expect(isOutreachTarget({ digitalScore: 50 })).toBe(true); // priority 50
    expect(isOutreachTarget({ digitalScore: 70 })).toBe(false); // priority 30
    expect(isOutreachTarget({ hasModernStack: true })).toBe(false);
    expect(isOutreachTarget({ hasWebsite: false })).toBe(true);
  });

  it("respects custom minPriority", () => {
    const signal: DigitalSignal = { digitalScore: 40 }; // priority 60
    expect(isOutreachTarget(signal, 60)).toBe(true);
    expect(isOutreachTarget(signal, 61)).toBe(false);
  });
});

describe("signalFromLeadText", () => {
  it("flags modern platforms (shopify, inventi, squarespace)", () => {
    expect(signalFromLeadText("Runs on Shopify Plus").hasModernStack).toBe(true);
    expect(signalFromLeadText("AAPM uses Inventi for ops").hasModernStack).toBe(true);
    expect(signalFromLeadText("Squarespace brochure site").hasModernStack).toBe(true);
    expect(outreachPriority(signalFromLeadText("Shopify store"))).toBe(0);
    expect(isOutreachTarget(signalFromLeadText("built with Wix"))).toBe(false);
  });

  it("detects no website as high-priority target", () => {
    const signal = signalFromLeadText("Family bakery, no website, phone orders only");
    expect(signal.hasWebsite).toBe(false);
    expect(isOutreachTarget(signal)).toBe(true);
    expect(outreachPriority(signal)).toBe(100);
  });

  it("detects outdated / legacy keywords", () => {
    const signal = signalFromLeadText("Legacy paper-based inventory, outdated system");
    expect(signal.digitalScore).toBeDefined();
    expect(signal.digitalScore!).toBeLessThan(40);
    expect(isOutreachTarget(signal)).toBe(true);
  });

  it("parses system age from text", () => {
    const signal = signalFromLeadText("Their 12 year old POS still runs the store");
    expect(signal.systemAgeYears).toBe(12);
    expect(isOutreachTarget(signal)).toBe(true);
  });

  it("returns empty signal for blank text", () => {
    expect(signalFromLeadText("")).toEqual({});
    expect(signalFromLeadText("   ")).toEqual({});
  });

  it("does not mark generic text as modern stack", () => {
    const signal = signalFromLeadText("Need a new booking site for the clinic");
    expect(signal.hasModernStack).toBeUndefined();
    expect(isOutreachTarget(signal)).toBe(true);
  });
});

describe("leadTextForSignal", () => {
  it("joins company, project_type, description, notes", () => {
    const text = leadTextForSignal({
      company: "Acme",
      project_type: "website",
      description: "no website yet",
      notes: "call Monday",
    });
    expect(text).toContain("Acme");
    expect(text).toContain("website");
    expect(text).toContain("no website yet");
    expect(text).toContain("call Monday");
  });

  it("skips empty parts", () => {
    expect(leadTextForSignal({ company: "X", description: null, notes: "" })).toBe("X");
  });
});
