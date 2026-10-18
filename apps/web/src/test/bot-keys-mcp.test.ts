/**
 * @vitest-environment node
 *
 * Bot keys (apps/api/src/routes/bot-keys.routes.ts) + the read-only MCP server
 * (apps/api/src/routes/mcp.routes.ts) — Phase 1 of advo-mcp.
 *
 * Fully live-API; skips (not fails) when the dev API is down, matching every other
 * live-API suite in this file set (see live-api.ts). Fixtures (a team member with a
 * login and no live key, one linked to the owner account, one linked to a non-owner
 * account, and one with no login at all) are found dynamically from the real roster
 * rather than hard-coded ids, so the suite degrades gracefully instead of hard-failing
 * on a roster that does not happen to have every shape today.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { API, skipWhenApiDown } from "./live-api.js";

type TeamAccount = {
  teamMemberId: number;
  name: string;
  userId: number | null;
  isOwner: boolean | null;
  botKeyId: number | null;
};

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function loginAsAdmin(): Promise<string> {
  const { status, body } = await api("POST", "/api/auth/login", { username: "admin", password: "changeme" });
  if (status !== 200) throw new Error(`admin login failed: HTTP ${status}`);
  return body.data.accessToken as string;
}

/** Revoke any existing live key for a member so key creation is idempotent across re-runs. */
async function ensureNoLiveKey(adminToken: string, account: TeamAccount) {
  if (account.botKeyId) {
    await api("POST", `/api/bot-keys/${account.botKeyId}/revoke`, {}, adminToken);
  }
}

async function callMcp(token: string, body: unknown) {
  const res = await fetch(`${API}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The SDK's Streamable HTTP transport 406s a request that does not accept SSE.
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) return { status: res.status, body: null };
  // Successful responses are one SSE "data:" frame per line; parse the JSON after it.
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  return { status: res.status, body: line ? JSON.parse(line.slice(5)) : null };
}

describe.skipIf(skipWhenApiDown)("Bot keys — admin console", () => {
  let adminToken: string;
  let accounts: TeamAccount[];
  let noLoginMember: TeamAccount | undefined;
  let linkedMember: TeamAccount | undefined;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
    const res = await api("GET", "/api/team/accounts", undefined, adminToken);
    accounts = res.body.data as TeamAccount[];
    noLoginMember = accounts.find((a) => a.userId == null);
    linkedMember = accounts.find((a) => a.userId != null);
  });

  it("400s creating a key for a member with no login", async () => {
    if (!noLoginMember) return; // no such fixture on this roster — nothing to assert
    const res = await api("POST", "/api/bot-keys", { teamMemberId: noLoginMember.teamMemberId }, adminToken);
    expect(res.status).toBe(400);
  });

  it("creates a key, 409s a second create, then revokes", async () => {
    if (!linkedMember) return;
    await ensureNoLiveKey(adminToken, linkedMember);

    const created = await api("POST", "/api/bot-keys", { teamMemberId: linkedMember.teamMemberId }, adminToken);
    expect(created.status).toBe(200);
    expect(created.body.data.token).toMatch(/^advo_bot_/);
    const botKeyId = created.body.data.botKeyId as number;

    const second = await api("POST", "/api/bot-keys", { teamMemberId: linkedMember.teamMemberId }, adminToken);
    expect(second.status).toBe(409);

    const revoked = await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    expect(revoked.status).toBe(200);

    const revokedAgain = await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    expect(revokedAgain.status).toBe(404);
  });
});

describe.skipIf(skipWhenApiDown)("MCP server — /mcp (bot-key auth)", () => {
  let adminToken: string;
  let accounts: TeamAccount[];
  let ownerMember: TeamAccount | undefined;
  let nonOwnerMember: TeamAccount | undefined;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
    const res = await api("GET", "/api/team/accounts", undefined, adminToken);
    accounts = res.body.data as TeamAccount[];
    ownerMember = accounts.find((a) => a.userId != null && a.isOwner === true);
    nonOwnerMember = accounts.find((a) => a.userId != null && a.isOwner === false);
  });

  it("an owner's bot key sees money-shaped tools; a non-owner's does not", async () => {
    if (!ownerMember || !nonOwnerMember) return; // roster lacks one of the two shapes

    await ensureNoLiveKey(adminToken, ownerMember);
    const ownerKey = await api("POST", "/api/bot-keys", { teamMemberId: ownerMember.teamMemberId }, adminToken);
    const ownerToken = ownerKey.body.data.token as string;
    const ownerKeyId = ownerKey.body.data.botKeyId as number;

    await ensureNoLiveKey(adminToken, nonOwnerMember);
    const memberKey = await api("POST", "/api/bot-keys", { teamMemberId: nonOwnerMember.teamMemberId }, adminToken);
    const memberToken = memberKey.body.data.token as string;
    const memberKeyId = memberKey.body.data.botKeyId as number;

    try {
      const ownerList = await callMcp(ownerToken, { jsonrpc: "2.0", method: "tools/list", id: 1 });
      expect(ownerList.status).toBe(200);
      const ownerTools = ownerList.body.result.tools.map((t: { name: string }) => t.name);
      expect(ownerTools).toContain("whoami");
      expect(ownerTools).toContain("list_invoices");

      const memberList = await callMcp(memberToken, { jsonrpc: "2.0", method: "tools/list", id: 1 });
      expect(memberList.status).toBe(200);
      const memberTools = memberList.body.result.tools.map((t: { name: string }) => t.name);
      expect(memberTools).toContain("whoami");
      expect(memberTools).not.toContain("list_invoices");
      expect(memberTools).not.toContain("list_contracts");
      expect(memberTools).not.toContain("list_expenses");

      const whoamiCall = await callMcp(memberToken, {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "whoami", arguments: {} },
        id: 2,
      });
      expect(whoamiCall.status).toBe(200);
      const whoamiText = JSON.parse(whoamiCall.body.result.content[0].text);
      expect(whoamiText.isOwner).toBe(false);

      const listProjectsCall = await callMcp(memberToken, {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "list_projects", arguments: {} },
        id: 3,
      });
      expect(listProjectsCall.status).toBe(200);
      const projects = JSON.parse(listProjectsCall.body.result.content[0].text);
      if (Array.isArray(projects) && projects.length > 0) {
        expect(projects[0]).not.toHaveProperty("totalValueCents");
      }
    } finally {
      await api("POST", `/api/bot-keys/${ownerKeyId}/revoke`, {}, adminToken);
      await api("POST", `/api/bot-keys/${memberKeyId}/revoke`, {}, adminToken);
    }
  });

  it("rejects a garbage bearer token with 401", async () => {
    const res = await callMcp("not-a-real-token", { jsonrpc: "2.0", method: "tools/list", id: 1 });
    expect(res.status).toBe(401);
  });

  it("a revoked key is rejected with 401", async () => {
    if (!nonOwnerMember) return;
    await ensureNoLiveKey(adminToken, nonOwnerMember);
    const created = await api("POST", "/api/bot-keys", { teamMemberId: nonOwnerMember.teamMemberId }, adminToken);
    const token = created.body.data.token as string;
    const botKeyId = created.body.data.botKeyId as number;

    const before = await callMcp(token, { jsonrpc: "2.0", method: "tools/list", id: 1 });
    expect(before.status).toBe(200);

    await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);

    const after = await callMcp(token, { jsonrpc: "2.0", method: "tools/list", id: 1 });
    expect(after.status).toBe(401);
  });
});

describe.skipIf(skipWhenApiDown)("Bot keys — Settings → Developer (self-serve)", () => {
  it("a member sees only their own row, can add their own key, and cannot touch anyone else's", async () => {
    const adminToken = await loginAsAdmin();
    const accounts = (await api("GET", "/api/team/accounts", undefined, adminToken)).body.data as (TeamAccount & {
      username: string | null;
    })[];

    // New accounts start on the shared default password; skip quietly when none is still on it.
    let memberToken: string | null = null;
    let self: (typeof accounts)[number] | undefined;
    for (const m of accounts.filter((a) => a.userId != null && !a.isOwner && a.username).slice(0, 3)) {
      const res = await api("POST", "/api/auth/login", { username: m.username, password: "changeme" });
      if (res.status === 200) {
        memberToken = res.body.data.accessToken as string;
        self = m;
        break;
      }
    }
    if (!memberToken || !self) return;
    const other = accounts.find((a) => a.userId != null && a.teamMemberId !== self!.teamMemberId);
    if (!other) return;

    const dev = await api("GET", "/api/team/developer", undefined, memberToken);
    expect(dev.status).toBe(200);
    expect((dev.body.data as { teamMemberId: number }[]).map((r) => r.teamMemberId)).toEqual([self.teamMemberId]);

    expect((await api("POST", "/api/bot-keys", { teamMemberId: other.teamMemberId }, memberToken)).status).toBe(403);
    expect(
      (await api("POST", "/api/webhooks", { teamMemberId: other.teamMemberId, url: "https://example.com/hook" }, memberToken))
        .status,
    ).toBe(403);
    expect((await api("GET", "/api/bot-keys", undefined, memberToken)).status).toBe(403);

    await ensureNoLiveKey(adminToken, self);
    const created = await api("POST", "/api/bot-keys", { teamMemberId: self.teamMemberId }, memberToken);
    expect(created.status).toBe(200);
    const revoked = await api("POST", `/api/bot-keys/${created.body.data.botKeyId}/revoke`, {}, memberToken);
    expect(revoked.status).toBe(200);
  });
});
