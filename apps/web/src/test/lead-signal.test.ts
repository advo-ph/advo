/**
 * Lead signal extraction — the scraped facts a proposal argues from.
 *
 * Fixtures mirror the shapes in data/clinic-lead/sample.json, which is the
 * real archive's row shape.
 */
import { describe, expect, it } from "vitest";
import {
  describeLeadSignal,
  extractLeadSignal,
  leadTextForSignal,
} from "../../../api/src/services/lead-signal.service";

describe("extractLeadSignal", () => {
  it("reads an explicit digital score from the dump text", () => {
    const signal = extractLeadSignal("Shopify brochure site. Digital score 70.");
    expect(signal.digitalScore).toBe(70);
    expect(signal.isScoreExplicit).toBe(true);
  });

  it("reads design and performance scores independently", () => {
    const signal = extractLeadSignal("Design score 41. Performance score: 28. Digital score 33.");
    expect(signal.designScore).toBe(41);
    expect(signal.performanceScore).toBe(28);
    expect(signal.digitalScore).toBe(33);
  });

  it("maps a performance letter grade to a score", () => {
    expect(extractLeadSignal("perf grade D on mobile").performanceScore).toBe(50);
  });

  it("infers a low digital score when no website is on file", () => {
    const signal = extractLeadSignal("Metro Manila dental clinic. No website. Phone bookings only.");
    expect(signal.hasWebsite).toBe(false);
    expect(signal.digitalScore).toBe(5);
    expect(signal.isScoreExplicit).toBe(false);
    expect(signal.evidence).toContain("no website at all");
    expect(signal.evidence).toContain("bookings taken by phone");
  });

  it("infers an outdated score from legacy keywords", () => {
    const signal = extractLeadSignal("Legacy paper-based appointment book.");
    expect(signal.digitalScore).toBe(20);
    expect(signal.evidence).toContain("outdated or manual system");
  });

  it("flags a modern platform so the rebuild pitch does not apply", () => {
    const signal = extractLeadSignal("Already on Inventi for ops.");
    expect(signal.hasModernStack).toBe(true);
    expect(signal.digitalScore).toBe(90);
  });

  it("prefers the explicit score over the keyword inference", () => {
    const signal = extractLeadSignal("Outdated system. Digital score 44.");
    expect(signal.digitalScore).toBe(44);
  });

  it("reads system age from years-old and built-in phrasing", () => {
    expect(extractLeadSignal("12 year old system").systemAgeYear).toBe(12);
    const built = extractLeadSignal("Site built in 2014.");
    expect(built.systemAgeYear).toBe(new Date().getFullYear() - 2014);
  });

  it("clamps out-of-range scores", () => {
    expect(extractLeadSignal("digital score 480").digitalScore).toBe(100);
  });

  it("guesses the industry from the lead text", () => {
    expect(extractLeadSignal("Quezon City Family Dental").industry).toBe("dental clinic");
    expect(extractLeadSignal("Mandaluyong Pedia Clinic").industry).toBe("healthcare clinic");
    expect(extractLeadSignal("Coffee Rush kiosk").industry).toBe("food service");
  });

  it("returns an empty signal for empty text instead of guessing", () => {
    const signal = extractLeadSignal("   ");
    expect(signal.digitalScore).toBeNull();
    expect(signal.industry).toBeNull();
    expect(signal.hasWebsite).toBeNull();
    expect(signal.evidence).toHaveLength(0);
  });
});

describe("leadTextForSignal", () => {
  it("joins the fields the audit findings live in", () => {
    const text = leadTextForSignal({
      company: "Makati Smile Center",
      projectType: "clinic-website",
      description: "Digital score 22.",
      notes: "outdated system",
    });
    expect(text).toContain("Makati Smile Center");
    expect(text).toContain("Digital score 22.");
    expect(text).toContain("outdated system");
  });

  it("skips blank fields", () => {
    expect(leadTextForSignal({ company: "Acme", projectType: null, notes: "  " })).toBe("Acme");
  });
});

describe("describeLeadSignal", () => {
  it("summarizes the signal for the proposal document", () => {
    const summary = describeLeadSignal(
      extractLeadSignal("Makati Smile Center dental. Digital score 22. 12 year old system."),
    );
    expect(summary).toContain("dental clinic");
    expect(summary).toContain("digital 22/100");
    expect(summary).toContain("~12y old");
  });

  it("says so plainly when there is no signal", () => {
    expect(describeLeadSignal(extractLeadSignal(""))).toBe("no scraped signal on file");
  });
});
