import { describe, expect, it } from "vitest";

// placeOf is pure; import it without starting the route's database code.
const { placeOf } = await import("./bids.routes.js");

describe("placeOf", () => {
  it("drops the parts of the place the buyer already names", () => {
    expect(placeOf("Makati City, Metro Manila", "Makati City")).toBe("Metro Manila");
    expect(placeOf("Batangas", "Ibaan, Batangas")).toBeNull();
    expect(placeOf("Quezon City, Metro Manila", "SK Bagong Silangan, Quezon City")).toBe("Metro Manila");
    expect(placeOf("Cagayan", "Lal-lo")).toBe("Cagayan");
    expect(placeOf(null, "PHLPost")).toBeNull();
  });
});
