/**
 * Header assembly for member-webhook deliveries. The live proof that a test POST
 * actually carries Authorization is apps/web/src/test/mcp-write-tools-webhooks.test.ts;
 * this file locks the shape both sendTestDelivery and the poller share.
 */
import { describe, expect, it } from "vitest";
import { buildDeliveryHeaders } from "./webhook-delivery.service.js";

describe("buildDeliveryHeaders", () => {
  const body = JSON.stringify({ event: "webhook_test" });

  it("sends Authorization alongside the ADVO signature headers", () => {
    const headers = buildDeliveryHeaders({
      secret: "signing-secret",
      body,
      event: "webhook_test",
      authHeaderValue: "Bearer cursor_key",
    });
    expect(headers.Authorization).toBe("Bearer cursor_key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-ADVO-Event"]).toBe("webhook_test");
    expect(headers["X-ADVO-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("omits the auth header when no value is stored", () => {
    const headers = buildDeliveryHeaders({
      secret: "signing-secret",
      body,
      event: "project_updated",
      authHeaderName: "Authorization",
      authHeaderValue: null,
    });
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-ADVO-Event"]).toBe("project_updated");
  });

  it("uses a custom header name and still keeps the signature headers", () => {
    const headers = buildDeliveryHeaders({
      secret: "signing-secret",
      body,
      event: "webhook_test",
      authHeaderName: "X-Custom-Auth",
      authHeaderValue: "token",
    });
    expect(headers["X-Custom-Auth"]).toBe("token");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-ADVO-Signature"]).toMatch(/^sha256=/);
  });

  it("does not let a stored name overwrite X-ADVO-Signature", () => {
    const headers = buildDeliveryHeaders({
      secret: "signing-secret",
      body,
      event: "webhook_test",
      authHeaderName: "X-ADVO-Signature",
      authHeaderValue: "forged",
    });
    expect(headers["X-ADVO-Signature"]).toMatch(/^sha256=/);
    expect(headers["X-ADVO-Signature"]).not.toBe("forged");
  });
});
