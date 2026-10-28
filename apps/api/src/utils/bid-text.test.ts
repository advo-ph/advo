import { describe, expect, it } from "vitest";
import { plainBuyer, plainTitle } from "./bid-text.js";

describe("plain bid text", () => {
  it("drops procurement verbs and reference codes, keeps the thing being bought", () => {
    expect(plainTitle("Supply, Delivery and Installation of CCTV Surveillance System")).toBe("CCTV Surveillance System");
    expect(plainTitle("TRAFFIC SIGNAL SYSTEM (PR-2026-1011-00092)")).toBe("Traffic signal system");
    expect(plainTitle("PR No. 100-2026-1859 Procurement of 1 set Multi-platform Lidar Scanning System")).toBe(
      "1 set Multi-platform Lidar Scanning System",
    );
    expect(plainTitle("PURCHASE OF GIS SYSTEM FOR DISASTER MAPPING, MUNICIPALITY OF IBAAN, BATANGAS", "MUNICIPALITY OF IBAAN, BATANGAS")).toBe(
      "GIS system for disaster mapping",
    );
    expect(plainTitle("Improvement of CCTV Monitoring System")).toBe("Improvement of CCTV Monitoring System");
    expect(plainTitle("Procurement of Goods Improvement and Rehabilitation of CCTV System")).toBe(
      "Improvement and Rehabilitation of CCTV System",
    );
  });

  it("re-cases shouting buyer names and drops 'Municipality of'", () => {
    expect(plainBuyer("MUNICIPALITY OF IBAAN, BATANGAS")).toBe("Ibaan, Batangas");
    expect(plainBuyer("CITY OF MANDAUE, CEBU")).toBe("City of Mandaue, Cebu");
    expect(plainBuyer("Philippine Postal Corporation")).toBe("Philippine Postal Corporation");
  });
});
