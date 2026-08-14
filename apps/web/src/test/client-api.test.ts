import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import * as db from "@/lib/db";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client API mapping", () => {
  it("creates clients with the camelCase payload expected by the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { clientId: 123 }, error: null }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await db.createClient({
      company_name: "Acme Corp",
      contact_email: "contact@acme.test",
      github_org_name: null,
      brand_color_hex: "#22C55E",
    });

    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:6407/api/clients",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          companyName: "Acme Corp",
          contactEmail: "contact@acme.test",
          brandColorHex: "#22C55E",
        }),
      })
    );
  });
});

describe("api wrapper", () => {
  it("returns a standard error instead of throwing when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("database unavailable")));

    const result = await api("/api/clients", { method: "POST" });

    expect(result.data).toBeNull();
    expect(result.error).toBe("database unavailable");
  });
});
