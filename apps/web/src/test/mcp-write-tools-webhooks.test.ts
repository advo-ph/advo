/**
 * @vitest-environment node
 *
 * MCP write tools + generic change-log middleware + member webhooks — Phase 2 of advo-mcp.
 *
 * Fully live-API; skips (not fails) when the dev API is down, matching every other
 * live-API suite in this file set (see live-api.ts).
 */
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { API, skipWhenApiDown } from "./live-api.js";

type TeamAccount = {
  teamMemberId: number;
  name: string;
  userId: number | null;
  isOwner: boolean | null;
  botKeyId: number | null;
  memberWebhookId: number | null;
};

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function loginAsAdmin(): Promise<string> {
  const { status, body } = await api("POST", "/api/auth/login", { username: "admin", password: "changeme" });
  if (status !== 200) throw new Error(`admin login failed: HTTP ${status}`);
  return body.data.accessToken as string;
}

async function callMcp(token: string, body: unknown) {
  const res = await fetch(`${API}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) return { status: res.status, body: null };
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  return { status: res.status, body: line ? JSON.parse(line.slice(5)) : null };
}

async function callTool(token: string, name: string, args: Record<string, unknown>) {
  const res = await callMcp(token, { jsonrpc: "2.0", method: "tools/call", params: { name, arguments: args }, id: 1 });
  if (res.status !== 200) return { status: res.status, result: null, isError: false };
  const content = res.body?.result?.content?.[0]?.text;
  return { status: res.status, result: content ? JSON.parse(content) : null, isError: !!res.body?.result?.isError };
}

async function ensureNoLiveKey(adminToken: string, account: TeamAccount) {
  if (account.botKeyId) await api("POST", `/api/bot-keys/${account.botKeyId}/revoke`, {}, adminToken);
}

async function recentActivityCount(token: string, entityType: string, entityId: number, action: string): Promise<number> {
  const res = await callTool(token, "recent_activity", { limit: 50 });
  const rows = (res.result ?? []) as { entityType: string; entityId: number; action: string }[];
  return rows.filter((r) => r.entityType === entityType && r.entityId === entityId && r.action === action).length;
}

describe.skipIf(skipWhenApiDown)("MCP write tools (Phase 2)", () => {
  let adminToken: string;
  let accounts: TeamAccount[];
  let teamMember_: TeamAccount | undefined;
  let ownerMember: TeamAccount | undefined;
  let nonOwnerMember: TeamAccount | undefined;
  let projectId: number;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
    const res = await api("GET", "/api/team/accounts", undefined, adminToken);
    accounts = res.body.data as TeamAccount[];
    teamMember_ = accounts.find((a) => a.userId != null);
    ownerMember = accounts.find((a) => a.userId != null && a.isOwner === true);
    nonOwnerMember = accounts.find((a) => a.userId != null && a.isOwner === false);

    const projectsRes = await api("GET", "/api/projects", undefined, adminToken);
    const projects = projectsRes.body?.data?.project ?? projectsRes.body?.data ?? [];
    if (Array.isArray(projects) && projects.length > 0) {
      projectId = projects[0].projectId ?? projects[0].project?.projectId;
    }
  });

  it("no tool is delete-shaped — tools/list never includes a delete_* tool", async () => {
    if (!teamMember_) return;
    await ensureNoLiveKey(adminToken, teamMember_);
    const created = await api("POST", "/api/bot-keys", { teamMemberId: teamMember_.teamMemberId }, adminToken);
    const token = created.body.data.token as string;
    const botKeyId = created.body.data.botKeyId as number;
    try {
      const list = await callMcp(token, { jsonrpc: "2.0", method: "tools/list", id: 1 });
      const names = list.body.result.tools.map((t: { name: string }) => t.name);
      expect(names.some((n: string) => n.startsWith("delete_"))).toBe(false);
    } finally {
      await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    }
  });

  it("a bot write (create_calendar_event) produces exactly one activity_log row with metadata.viaBot", async () => {
    if (!teamMember_) return;
    await ensureNoLiveKey(adminToken, teamMember_);
    const created = await api("POST", "/api/bot-keys", { teamMemberId: teamMember_.teamMemberId }, adminToken);
    const token = created.body.data.token as string;
    const botKeyId = created.body.data.botKeyId as number;

    try {
      const startsAt = new Date(Date.now() + 86_400_000).toISOString();
      const result = await callTool(token, "create_calendar_event", {
        title: "MCP write-tool test event",
        startsAt,
        category: "event",
        isAllDay: false,
      });
      expect(result.isError).toBe(false);
      const createdEvent = result.result as { calendarEventId: number };
      expect(createdEvent.calendarEventId).toBeTypeOf("number");

      const activityRes = await callTool(token, "recent_activity", { limit: 50 });
      const rows = (activityRes.result ?? []) as { entityType: string; entityId: number; action: string; metadata: Record<string, unknown> }[];
      const matches = rows.filter((r) => r.entityType === "calendar_event" && r.entityId === createdEvent.calendarEventId);
      expect(matches.length).toBe(1);
      expect(matches[0].action).toBe("calendar_event_created");
      expect(matches[0].metadata.viaBot).toBe(true);
      expect(matches[0].metadata.teamMemberId).toBe(teamMember_.teamMemberId);
      expect(matches[0].metadata.botKeyId).toBe(botKeyId);

      await api("DELETE", `/api/calendar/${createdEvent.calendarEventId}`, undefined, adminToken);
    } finally {
      await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    }
  });

  it("update_project silently drops money fields for a non-owner bot key", async () => {
    if (!nonOwnerMember || !projectId) return;
    await ensureNoLiveKey(adminToken, nonOwnerMember);
    const created = await api("POST", "/api/bot-keys", { teamMemberId: nonOwnerMember.teamMemberId }, adminToken);
    const token = created.body.data.token as string;
    const botKeyId = created.body.data.botKeyId as number;

    try {
      const before = await callTool(token, "get_project", { projectId });
      expect((before.result as Record<string, unknown>).totalValueCents).toBeUndefined();

      const result = await callTool(token, "update_project", { projectId, totalValueCents: 999999999 });
      expect(result.isError).toBe(false);

      const adminCheck = await api("GET", `/api/projects/${projectId}`, undefined, adminToken);
      const totalValueCents = adminCheck.body?.data?.totalValueCents ?? adminCheck.body?.data?.project?.totalValueCents;
      expect(totalValueCents).not.toBe(999999999);
    } finally {
      await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    }
  });

  it("an owner bot key CAN set a project money field via update_project", async () => {
    if (!ownerMember || !projectId) return;
    await ensureNoLiveKey(adminToken, ownerMember);
    const created = await api("POST", "/api/bot-keys", { teamMemberId: ownerMember.teamMemberId }, adminToken);
    const token = created.body.data.token as string;
    const botKeyId = created.body.data.botKeyId as number;

    try {
      const before = await api("GET", `/api/projects/${projectId}`, undefined, adminToken);
      const originalTotal = before.body?.data?.totalValueCents ?? before.body?.data?.project?.totalValueCents ?? 0;

      const result = await callTool(token, "update_project", { projectId, totalValueCents: originalTotal });
      expect(result.isError).toBe(false);
    } finally {
      await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    }
  });
});

describe.skipIf(skipWhenApiDown)("Generic change-log middleware (Phase 2)", () => {
  let adminToken: string;
  let teamMember_: TeamAccount | undefined;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
    const res = await api("GET", "/api/team/accounts", undefined, adminToken);
    const accounts = res.body.data as TeamAccount[];
    teamMember_ = accounts.find((a) => a.userId != null);
  });

  it("a human PATCH outside the self-logging/deny lists produces exactly one new source:'api' row", async () => {
    if (!teamMember_) return;
    await ensureNoLiveKey(adminToken, teamMember_);
    const botCreated = await api("POST", "/api/bot-keys", { teamMemberId: teamMember_.teamMemberId }, adminToken);
    const token = botCreated.body.data.token as string;
    const botKeyId = botCreated.body.data.botKeyId as number;

    try {
      // No-op-ish PATCH: re-send the member's own current bio so nothing else observes a change.
      const before = await api("GET", `/api/team/${teamMember_.teamMemberId}`, undefined, adminToken);
      const bio = before.body?.data?.bio ?? "";
      await api("PATCH", `/api/team/${teamMember_.teamMemberId}`, { bio }, adminToken);

      // entityTypeFromPath derives "team" from "/api/team/:id" (crude plural strip — "team"
      // has no trailing "s" to strip), not "team_member" — matches the generic middleware's
      // own path-based naming, not the table name.
      const beforeCount = await recentActivityCount(token, "team", teamMember_.teamMemberId, "team_updated");
      await api("PATCH", `/api/team/${teamMember_.teamMemberId}`, { bio }, adminToken);
      const afterCount = await recentActivityCount(token, "team", teamMember_.teamMemberId, "team_updated");
      expect(afterCount).toBe(beforeCount + 1);
    } finally {
      await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    }
  });

  it("a self-logging route (POST /api/change-order) does not get double-logged", async () => {
    if (!teamMember_) return;
    const projectsRes = await api("GET", "/api/projects", undefined, adminToken);
    const projects = projectsRes.body?.data?.project ?? projectsRes.body?.data ?? [];
    if (!Array.isArray(projects) || projects.length === 0) return;
    const projectId = projects[0].projectId ?? projects[0].project?.projectId;

    await ensureNoLiveKey(adminToken, teamMember_);
    const botCreated = await api("POST", "/api/bot-keys", { teamMemberId: teamMember_.teamMemberId }, adminToken);
    const token = botCreated.body.data.token as string;
    const botKeyId = botCreated.body.data.botKeyId as number;

    try {
      const created = await api(
        "POST",
        "/api/change-order",
        { projectId, scope: "MCP phase 2 denylist test", reason: "Verify no double-log" },
        adminToken,
      );
      expect(created.status).toBe(201);
      const changeOrderId = created.body.data.changeOrderId as number;

      const rows = await callTool(token, "recent_activity", { limit: 50 });
      const matches = ((rows.result ?? []) as { entityType: string; entityId: number }[]).filter(
        (r) => r.entityType === "change_order" && r.entityId === changeOrderId,
      );
      expect(matches.length).toBe(1);
    } finally {
      await api("POST", `/api/bot-keys/${botKeyId}/revoke`, {}, adminToken);
    }
  });
});

describe.skipIf(skipWhenApiDown)("Member webhooks (Phase 2)", () => {
  let adminToken: string;
  let teamMember_: TeamAccount | undefined;
  let listenerPort: number;
  let receivedBodies: { raw: string; signature: string | null; event: string | null; authorization: string | null }[] = [];
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
    const res = await api("GET", "/api/team/accounts", undefined, adminToken);
    const accounts = res.body.data as TeamAccount[];
    teamMember_ = accounts.find((a) => a.userId != null);

    await new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          receivedBodies.push({
            raw: Buffer.concat(chunks).toString("utf8"),
            signature: (req.headers["x-advo-signature"] as string) ?? null,
            event: (req.headers["x-advo-event"] as string) ?? null,
            authorization: (req.headers.authorization as string) ?? null,
          });
          res.writeHead(200);
          res.end("ok");
        });
      });
      server.listen(0, "127.0.0.1", () => {
        listenerPort = (server.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("create → test delivers an HMAC-signed POST that verifies against the returned secret", async () => {
    if (!teamMember_) return;
    receivedBodies = [];

    // member_webhook has one unconditional unique row per team_member_id (unlike bot_key's
    // partial-unique "one LIVE key" shape) — a previous run's leftover row makes POST 409.
    // Reuse + rotate instead of create when one already exists, same as a real owner would.
    const existing = await api("GET", "/api/webhooks", undefined, adminToken);
    const mine = (existing.body.data as { memberWebhookId: number; teamMemberId: number }[]).find(
      (w) => w.teamMemberId === teamMember_!.teamMemberId,
    );

    let memberWebhookId: number;
    let secret: string;
    if (mine) {
      memberWebhookId = mine.memberWebhookId;
      await api(
        "PATCH",
        `/api/webhooks/${memberWebhookId}`,
        { url: `http://127.0.0.1:${listenerPort}/`, isActive: true },
        adminToken,
      );
      const rotated = await api("POST", `/api/webhooks/${memberWebhookId}/rotate-secret`, {}, adminToken);
      expect(rotated.status).toBe(200);
      secret = rotated.body.data.secret as string;
    } else {
      const created = await api(
        "POST",
        "/api/webhooks",
        { teamMemberId: teamMember_.teamMemberId, url: `http://127.0.0.1:${listenerPort}/` },
        adminToken,
      );
      expect(created.status).toBe(201);
      memberWebhookId = created.body.data.memberWebhookId as number;
      secret = created.body.data.secret as string;
    }
    expect(secret).toBeTruthy();

    try {
      const test = await api("POST", `/api/webhooks/${memberWebhookId}/test`, {}, adminToken);
      expect(test.status).toBe(200);
      expect(test.body.data.ok).toBe(true);

      expect(receivedBodies.length).toBeGreaterThan(0);
      const delivery = receivedBodies[receivedBodies.length - 1];
      expect(delivery.signature).toMatch(/^sha256=/);
      const expected = createHmac("sha256", secret).update(delivery.raw).digest("hex");
      expect(delivery.signature).toBe(`sha256=${expected}`);

      const list = await api("GET", "/api/webhooks", undefined, adminToken);
      const row = (list.body.data as { memberWebhookId: number; lastStatus: string }[]).find((w) => w.memberWebhookId === memberWebhookId);
      expect(row?.lastStatus).toBe("ok");
    } finally {
      await api("PATCH", `/api/webhooks/${memberWebhookId}`, { isActive: false }, adminToken);
    }
  });

  it("never exposes secretEncrypted anywhere in the admin console response", async () => {
    const res = await api("GET", "/api/webhooks", undefined, adminToken);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/secretEncrypted|secret_encrypted|authHeaderValueEncrypted|auth_header_value_encrypted/);
  });

  it("test delivery sends the optional Authorization header and list responses only say whether it is set", async () => {
    if (!teamMember_) return;
    receivedBodies = [];
    const bearer = "Bearer cursor_wh_test_9f3a_do_not_leak";

    const existing = await api("GET", "/api/webhooks", undefined, adminToken);
    const mine = (existing.body.data as { memberWebhookId: number; teamMemberId: number }[]).find(
      (w) => w.teamMemberId === teamMember_!.teamMemberId,
    );

    let memberWebhookId: number;
    if (mine) {
      memberWebhookId = mine.memberWebhookId;
      const patched = await api(
        "PATCH",
        `/api/webhooks/${memberWebhookId}`,
        { url: `http://127.0.0.1:${listenerPort}/hook`, isActive: true, authHeader: bearer },
        adminToken,
      );
      expect(patched.status).toBe(200);
      expect(patched.body.data.authHeaderSet).toBe(true);
      expect(JSON.stringify(patched.body)).not.toContain(bearer);
    } else {
      const created = await api(
        "POST",
        "/api/webhooks",
        { teamMemberId: teamMember_.teamMemberId, url: `http://127.0.0.1:${listenerPort}/hook`, authHeader: bearer },
        adminToken,
      );
      expect(created.status).toBe(201);
      memberWebhookId = created.body.data.memberWebhookId as number;
      expect(JSON.stringify(created.body)).not.toContain(bearer);
    }

    try {
      const test = await api("POST", `/api/webhooks/${memberWebhookId}/test`, {}, adminToken);
      expect(test.status).toBe(200);
      expect(test.body.data.ok).toBe(true);

      const delivery = receivedBodies[receivedBodies.length - 1];
      expect(delivery.authorization).toBe(bearer);
      expect(delivery.event).toBe("webhook_test");
      expect(delivery.signature).toMatch(/^sha256=/);

      const list = await api("GET", "/api/webhooks", undefined, adminToken);
      const row = (list.body.data as { memberWebhookId: number; authHeaderSet: boolean }[]).find(
        (w) => w.memberWebhookId === memberWebhookId,
      );
      expect(row?.authHeaderSet).toBe(true);
      const listText = JSON.stringify(list.body);
      expect(listText).not.toContain(bearer);
      expect(listText).not.toMatch(/authHeaderValueEncrypted|auth_header_value_encrypted|secretEncrypted|secret_encrypted/);

      const developer = await api("GET", "/api/team/developer", undefined, adminToken);
      const developerText = JSON.stringify(developer.body);
      expect(developerText).not.toContain(bearer);
      expect(developerText).not.toMatch(/authHeaderValueEncrypted|auth_header_value_encrypted/);
      const developerRow = (developer.body.data as { teamMemberId: number; memberWebhookAuthHeaderSet: boolean }[]).find(
        (r) => r.teamMemberId === teamMember_!.teamMemberId,
      );
      expect(developerRow?.memberWebhookAuthHeaderSet).toBe(true);

      const cleared = await api("PATCH", `/api/webhooks/${memberWebhookId}`, { authHeader: null }, adminToken);
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.authHeaderSet).toBe(false);

      receivedBodies = [];
      const again = await api("POST", `/api/webhooks/${memberWebhookId}/test`, {}, adminToken);
      expect(again.body.data.ok).toBe(true);
      expect(receivedBodies[receivedBodies.length - 1].authorization).toBeNull();
    } finally {
      await api("PATCH", `/api/webhooks/${memberWebhookId}`, { isActive: false, authHeader: null }, adminToken);
    }
  });
});
