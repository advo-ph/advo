import { describe, expect, it } from "vitest";
import { previewApiUrl, previewPublicPath } from "@/pages/PreviewLink";

describe("previewApiUrl", () => {
  it("builds API preview URL from token and base", () => {
    expect(previewApiUrl("abc.def.ghi", "https://api.advo.ph")).toBe(
      "https://api.advo.ph/api/preview/abc.def.ghi",
    );
  });

  it("strips trailing slash on api base", () => {
    expect(previewApiUrl("tok", "http://localhost:6107/")).toBe(
      "http://localhost:6107/api/preview/tok",
    );
  });

  it("defaults to localhost API when base omitted", () => {
    // In vitest, VITE_API_URL may be unset → default http://localhost:6107
    const url = previewApiUrl("x");
    expect(url).toMatch(/\/api\/preview\/x$/);
    expect(url.startsWith("http")).toBe(true);
  });

  it("encodes token for safe path segment", () => {
    expect(previewApiUrl("a/b+c", "https://api.example.com")).toBe(
      "https://api.example.com/api/preview/a%2Fb%2Bc",
    );
  });
});

describe("previewPublicPath", () => {
  it("returns branded frontend path for a token", () => {
    expect(previewPublicPath("signed.jwt.here")).toBe("/p/signed.jwt.here");
  });
});
