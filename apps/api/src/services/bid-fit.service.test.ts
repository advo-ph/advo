import { describe, expect, it } from "vitest";
import { classifyBid, hasSoftwareSignal } from "./bid-fit.service.js";
import { msUntilNextRun } from "./bid-sync.service.js";

describe("bid fit rules", () => {
  it("keeps the bids the team kept by hand", () => {
    const kept = [
      "Supply, Delivery, Installation and Commissioning of Emergency ICS & EOC Platform Software with Environmental Monitoring and Forecasting Capabilities - PDRRMO",
      "Procurement of Early Warning System and Programs",
      "Procurement of Services for the Emenrgency Response and Public Safety Command Center Upgrade of MDDRMO",
      "AI-Backed Customer Support Solution",
    ];
    for (const title of kept) {
      const r = classifyBid({ title, abc: 5_000_000 });
      expect(r.isCandidate, title).toBe(true);
      expect(r.ruleNotFit, title).toBeNull();
    }
  });

  it("keeps a laboratory information system while dropping lab supplies", () => {
    expect(classifyBid({ title: "Procurement of Laboratory Information System (LIS), including implementation", abc: 5_000_000 }).isCandidate).toBe(true);
    expect(classifyBid({ title: "Supply of laboratory supplies and consumables", abc: 5_000_000 }).isCandidate).toBe(false);
  });

  it("gives flood and emergency bids their own topic before 'software'", () => {
    expect(classifyBid({ title: "Water level monitoring system", abc: 2_300_000 }).topic).toBe("flood");
    expect(classifyBid({ title: "DRRM information system", abc: 2_500_000 }).topic).toBe("emergency");
  });

  it("drops construction, vehicles and plain computers by title", () => {
    for (const title of ["Construction of a two-storey building", "Procurement of one unit pick-up vehicle", "Supply of laptop computers"]) {
      expect(classifyBid({ title, abc: 9_000_000 }).isCandidate, title).toBe(false);
    }
  });

  it("rules out renewals, plain equipment and tiny budgets with a reason", () => {
    expect(classifyBid({ title: "Subscription of ArcGIS licenses for the GIS office", abc: 3_000_000 }).ruleNotFit).toBe(
      "Renewal or one brand's licence",
    );
    // "renewal" in a title is excluded earlier, with the construction and food words.
    expect(classifyBid({ title: "Renewal of software subscription", abc: 3_000_000 }).isCandidate).toBe(false);
    expect(classifyBid({ title: "CCTV equipment and supplies", abc: 48_000_000 }).ruleNotFit).toBe("Equipment supply only");
    expect(classifyBid({ title: "Barangay information system", abc: 200_000 }).ruleNotFit).toBe("Under ₱500k");
    // A blank budget is kept: the notice may print it in the text.
    expect(classifyBid({ title: "Barangay information system", abc: null }).ruleNotFit).toBeNull();
  });
});

describe("rule-only fit (no model)", () => {
  it("counts only titles that name software or a system we build", () => {
    expect(hasSoftwareSignal("Improvement of the City-Wide Early Warning System: Multihazard Early Warning System")).toBe(true);
    expect(hasSoftwareSignal("Procurement of Queueing System for Business One Stop Shop (BOSS)")).toBe(true);
    expect(hasSoftwareSignal("Supply and Delivery of Sound System")).toBe(false);
    expect(hasSoftwareSignal("Supply, Delivery and Installation of Fire Detection and Alarm System")).toBe(false);
  });

  it("catches plural exclusions the first list missed", () => {
    for (const title of ["2026-451-PURCHASE OF MEDICINES (LDRRM)", "Supply of blood bank reagents and consumables", "Purchase and delivery of emergency go bags", "Supply of Various Medical and Laboratory Supplies"]) {
      expect(classifyBid({ title, abc: 1_000_000 }).isCandidate, title).toBe(false);
    }
  });
});

describe("daily schedule", () => {
  it("runs next at 06:00 Manila (22:00 UTC)", () => {
    expect(msUntilNextRun(new Date("2026-10-27T21:00:00Z"))).toBe(3600_000);
    expect(msUntilNextRun(new Date("2026-10-27T22:00:00Z"))).toBe(24 * 3600_000);
    expect(msUntilNextRun(new Date("2026-10-27T23:00:00Z"))).toBe(23 * 3600_000);
  });
});
