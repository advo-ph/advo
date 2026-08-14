import { describe, expect, it } from "vitest";
import { previewApiUrl, previewPublicPath } from "@/pages/PreviewLink";

describe("previewApiUrl", () => {
  it("builds API preview URL from token and base", () => {
    expect(previewApiUrl("abc.def.ghi", "https://api.advo.ph")).toBe(
      "https://api.advo.ph/api/preview/abc.def.ghi",
    );
  });

  it("strips trailing slash on api base", () => {
    expect(previewApiUrl("tok", "http://localhost:6407/")).toBe(
      "http://localhost:6407/api/preview/tok",
    );
  });

  it("defaults to localhost API when base omitted", () => {
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
