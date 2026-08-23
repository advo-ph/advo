/**
 * @vitest-environment node
 *
 * Node, not jsdom: this file exercises the real API token service, and jsdom's
 * TextEncoder emits a cross-realm Uint8Array that jose refuses to sign with.
 * Nothing here touches the DOM.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

// ─── The lifetime guarantee ──
//
// The 20-minute expiry and the branded 410 gate are the product here — a new
// hosting provider must not extend or bypass either. These exercise the real
// token functions from the API service, not a copy of the logic.

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "a".repeat(48);
process.env.JWT_REFRESH_SECRET ??= "b".repeat(48);

const { loadEnv } = await import("../../../api/src/utils/env");
loadEnv();

const { PREVIEW_TTL_MINUTES, signPreviewToken, verifyPreviewToken } = await import(
  "../../../api/src/services/preview.service"
);

describe("preview token expiry", () => {
  it("still mints a 20-minute lifetime", () => {
    expect(PREVIEW_TTL_MINUTES).toBe(20);
  });

  it("stamps an expiry 20 minutes out and verifies while fresh", async () => {
    const { token, expiresAt } = await signPreviewToken(42);
    const secondOut = (Date.parse(expiresAt) - Date.now()) / 1000;
    expect(secondOut).toBeGreaterThan(19 * 60);
    expect(secondOut).toBeLessThanOrEqual(20 * 60 + 1);
    await expect(verifyPreviewToken(token)).resolves.toBe(42);
  });

  it("rejects a token whose expiry has passed", async () => {
    const { SignJWT } = await import("jose");
    const expired = await new SignJWT({ projectId: 42, kind: "preview" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET as string));

    await expect(verifyPreviewToken(expired)).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ projectId: 42, kind: "preview" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(new TextEncoder().encode("z".repeat(48)));

    await expect(verifyPreviewToken(forged)).resolves.toBeNull();
  });

  it("rejects a non-preview token", async () => {
    const { SignJWT } = await import("jose");
    const wrongKind = await new SignJWT({ projectId: 42, kind: "session" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET as string));

    await expect(verifyPreviewToken(wrongKind)).resolves.toBeNull();
  });
});

describe("the branded gate", () => {
  const routeSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../api/src/routes/preview.routes.ts"),
    "utf8",
  );

  it("answers an expired or invalid token with 410, not a redirect", () => {
    expect(routeSource).toMatch(/Preview link expired[\s\S]*?410/);
  });

  it("keeps the gate branded rather than bare", () => {
    expect(routeSource).toContain("ADVO");
    expect(routeSource).toMatch(/Ask the ADVO team for a fresh one/);
  });

  it("only redirects once a token has verified", () => {
    const gateIndex = routeSource.indexOf("410");
    const redirectIndex = routeSource.indexOf("c.redirect");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(redirectIndex).toBeGreaterThan(gateIndex);
  });
});

describe("preview hosting provider", () => {
  it("defaults to manual so an unconfigured deploy behaves as it does today", async () => {
    const { activeProviderName } = await import(
      "../../../api/src/services/preview-host.service"
    );
    expect(activeProviderName()).toBe("manual");
  });

  it("falls back to the pasted URL when herenow has no credential", async () => {
    const { hostPreview } = await import("../../../api/src/services/preview-host.service");
    const hosted = await hostPreview({
      projectId: 42,
      pastedUrl: "https://preview.example.com/site",
    });
    expect(hosted?.previewUrl).toBe("https://preview.example.com/site");
    expect(hosted?.provider).toBe("manual");
  });

  it("returns null when there is nothing to preview at all", async () => {
    const { hostPreview } = await import("../../../api/src/services/preview-host.service");
    await expect(hostPreview({ projectId: 42, pastedUrl: null })).resolves.toBeNull();
  });

  it("asks the host for the same lifetime the token carries", async () => {
    const { PREVIEW_HOST_TTL_MINUTE } = await import(
      "../../../api/src/services/preview-host.service"
    );
    expect(PREVIEW_HOST_TTL_MINUTE).toBe(PREVIEW_TTL_MINUTES);
  });
});
