/**
 * Table-driven proof that extracting rateKey() into resolveClientIp() (see
 * process/general-plans/active/visitor-analytics_PLAN_09-10-26.md §4.1) changed nothing —
 * these tests encode the trust order that was already documented and true in
 * event.routes.ts before the extraction.
 */
import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { isPrivateAddress, resolveClientIp } from "./client-ip.js";
import type { Variables } from "../types/context.js";

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["10.0.0.5", true],
    ["192.168.1.1", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["172.15.0.1", false],
    ["8.8.8.8", false],
    ["203.0.113.5", false],
  ])("%s -> %s", (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

/** Minimal fake Context: only what getConnInfo + header reads actually touch. */
function fakeContext(opts: {
  remoteAddress?: string;
  headers?: Record<string, string>;
}): Context<{ Variables: Variables }> {
  const headers = opts.headers ?? {};
  return {
    env: opts.remoteAddress
      ? { incoming: { socket: { remoteAddress: opts.remoteAddress, remotePort: 1, remoteFamily: "IPv4" } } }
      : {},
    req: {
      header: (name: string) => headers[name],
    },
  } as unknown as Context<{ Variables: Variables }>;
}

describe("resolveClientIp", () => {
  it("direct peer wins when the peer is public — no header is read", () => {
    const c = fakeContext({
      remoteAddress: "8.8.8.8",
      headers: { "X-Real-IP": "9.9.9.9" },
    });
    expect(resolveClientIp(c)).toBe("8.8.8.8");
  });

  it("X-Real-IP wins only when the peer is private (arrived through our own nginx)", () => {
    const c = fakeContext({
      remoteAddress: "127.0.0.1",
      headers: { "X-Real-IP": "203.0.113.5" },
    });
    expect(resolveClientIp(c)).toBe("203.0.113.5");
  });

  it("CF-Connecting-IP is the next fallback behind a private peer with no X-Real-IP", () => {
    const c = fakeContext({
      remoteAddress: "10.0.0.1",
      headers: { "CF-Connecting-IP": "198.51.100.7" },
    });
    expect(resolveClientIp(c)).toBe("198.51.100.7");
  });

  it("falls back to the peer when behind a private proxy with no trusted header", () => {
    const c = fakeContext({ remoteAddress: "192.168.1.1" });
    expect(resolveClientIp(c)).toBe("192.168.1.1");
  });

  it("falls back to 'unknown' when there is no socket info at all (test harness)", () => {
    const c = fakeContext({});
    expect(resolveClientIp(c)).toBe("unknown");
  });
});
