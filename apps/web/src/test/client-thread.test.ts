/**
 * @vitest-environment node
 *
 * Client thread + preview history + event notifications (migration 026), against the
 * live API. Probed once (live-api.ts); an unreachable API SKIPS rather than fails, and
 * VITE_REQUIRE_LIVE_API=1 turns that back into a hard failure for CI. Node environment
 * (as preview-link.test.ts) because jsdom's fetch cannot reach the local API.
 *
 * Every fixture is created through the API and deleted at the end. Deleting the project
 * cascades to its messages, preview links, deliverables and notifications, so the
 * teardown is two DELETEs.
 *
 * The client session is the seeded client@advo.ph / changeme (seed.ts) — the one client
 * login this repo guarantees. The "foreign" project belongs to a throwaway client with
 * no login at all, which is enough: the assertion is that client@advo.ph cannot see it.
 */

import { describe as describeAlways, it, expect, beforeAll, afterAll } from "vitest";
import { API, skipWhenApiDown } from "./live-api.js";

const describe = describeAlways.skipIf(skipWhenApiDown);

const CLIENT_EMAIL = "client@advo.ph";
const CLIENT_PASSWORD = "changeme";

let adminToken: string;
let clientToken: string;
let ownProjectId: number;
let ownProjectTitle: string;
let foreignClientId: number;
let foreignProjectId: number;

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return { status: res.status, body: await res.json() };
}

async function login(email: string, password: string) {
  const { status, body } = await api("POST", "/api/auth/login", { email, password });
  if (status !== 200) throw new Error(`login failed for ${email}: HTTP ${status}`);
  return body.data.accessToken as string;
}

beforeAll(async () => {
  if (skipWhenApiDown) return;
  adminToken = await login("admin@advo.ph", "changeme");
  clientToken = await login(CLIENT_EMAIL, CLIENT_PASSWORD);

  // The seeded client's row, found by its contact email rather than a hard-coded id.
  const clientList = await api("GET", "/api/clients", undefined, adminToken);
  const own = clientList.body.data.find(
    (c: { contactEmail: string | null }) => c.contactEmail === CLIENT_EMAIL,
  );
  if (!own) throw new Error(`no client row with contactEmail ${CLIENT_EMAIL}; run the seed`);

  const stamp = Date.now();
  ownProjectTitle = `Thread project ${stamp}`;
  const ownProject = await api(
    "POST",
    "/api/projects",
    { clientId: own.clientId, title: ownProjectTitle, previewUrl: "https://example.test/preview" },
    adminToken,
  );
  expect(ownProject.status).toBe(201);
  ownProjectId = ownProject.body.data.projectId;

  const foreignClient = await api(
    "POST",
    "/api/clients",
    { companyName: `Thread foreign ${stamp}`, contactEmail: `thread-${stamp}@example.test` },
    adminToken,
  );
  expect(foreignClient.status).toBe(201);
  foreignClientId = foreignClient.body.data.clientId;

  const foreignProject = await api(
    "POST",
    "/api/projects",
    { clientId: foreignClientId, title: `Thread foreign project ${stamp}` },
    adminToken,
  );
  expect(foreignProject.status).toBe(201);
  foreignProjectId = foreignProject.body.data.projectId;
});

afterAll(async () => {
  if (skipWhenApiDown || !adminToken) return;
  if (ownProjectId) await api("DELETE", `/api/projects/${ownProjectId}`, undefined, adminToken);
  if (foreignProjectId) {
    await api("DELETE", `/api/projects/${foreignProjectId}`, undefined, adminToken);
  }
  if (foreignClientId) await api("DELETE", `/api/clients/${foreignClientId}`, undefined, adminToken);
});

async function clientNotification() {
  const { status, body } = await api("GET", "/api/notifications", undefined, clientToken);
  expect(status).toBe(200);
  return body.data as { type: string; title: string; body: string | null; projectId: number | null }[];
}

// ─── Thread: read + post, own project ─────────────────

describe("Client thread — own project", () => {
  it("client can post on their own project and the row carries the JWT role", async () => {
    const { status, body } = await api(
      "POST",
      "/api/project-message",
      { projectId: ownProjectId, body: "Hello from the client" },
      clientToken,
    );
    expect(status).toBe(201);
    expect(body.error).toBeNull();
    expect(body.data.projectId).toBe(ownProjectId);
    expect(body.data.authorRole).toBe("client");
    expect(body.data.body).toBe("Hello from the client");
    // The author's own side is read; the other side is not.
    expect(body.data.isReadByClient).toBe(true);
    expect(body.data.isReadByTeam).toBe(false);
    expect(typeof body.data.authorName).toBe("string");
    expect(body.data.createdAt).toBeTruthy();
  });

  it("client can read the thread, oldest first", async () => {
    const { status, body } = await api(
      "GET",
      `/api/project-message?projectId=${ownProjectId}`,
      undefined,
      clientToken,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].body).toBe("Hello from the client");
    expect(body.data[0]).toHaveProperty("projectMessageId");
    expect(body.data[0]).not.toHaveProperty("project_message_id");
  });

  it("client cannot spoof authorRole through the body", async () => {
    const { status, body } = await api(
      "POST",
      "/api/project-message",
      { projectId: ownProjectId, body: "Still a client", authorRole: "admin" },
      clientToken,
    );
    expect(status).toBe(201);
    expect(body.data.authorRole).toBe("client");
  });
});

// ─── Thread: another client's project ─────────────────

describe("Client thread — foreign project", () => {
  it("GET on another client's project is 403", async () => {
    const { status } = await api(
      "GET",
      `/api/project-message?projectId=${foreignProjectId}`,
      undefined,
      clientToken,
    );
    expect(status).toBe(403);
  });

  it("POST on another client's project is 403 and writes nothing", async () => {
    const post = await api(
      "POST",
      "/api/project-message",
      { projectId: foreignProjectId, body: "Should not land" },
      clientToken,
    );
    expect(post.status).toBe(403);

    const asAdmin = await api(
      "GET",
      `/api/project-message?projectId=${foreignProjectId}`,
      undefined,
      adminToken,
    );
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data).toEqual([]);
  });

  it("POST /read on another client's project is 403", async () => {
    const { status } = await api(
      "POST",
      "/api/project-message/read",
      { projectId: foreignProjectId },
      clientToken,
    );
    expect(status).toBe(403);
  });
});

// ─── Team post → client notification → unread → read ──

describe("Team post notifies the client and drives the unread count", () => {
  const teamBody = "Team reply: the first draft is up.";

  it("team/admin post is 201 with authorRole from the JWT and the team side read", async () => {
    const { status, body } = await api(
      "POST",
      "/api/project-message",
      { projectId: ownProjectId, body: teamBody },
      adminToken,
    );
    expect(status).toBe(201);
    expect(body.data.authorRole).toBe("admin");
    expect(body.data.isReadByTeam).toBe(true);
    expect(body.data.isReadByClient).toBe(false);
  });

  it("the client sees a notification for the team post", async () => {
    const row = await clientNotification();
    const hit = row.find(
      (n) => n.projectId === ownProjectId && n.title === `New message on ${ownProjectTitle}`,
    );
    expect(hit).toBeTruthy();
    expect(hit?.type).toBe("custom");
    expect(hit?.body).toBe(teamBody);
  });

  it("the client's unread count reflects only the team post", async () => {
    const { status, body } = await api("GET", "/api/project-message/unread", undefined, clientToken);
    expect(status).toBe(200);
    const hit = body.data.find((r: { projectId: number }) => r.projectId === ownProjectId);
    expect(hit).toBeTruthy();
    expect(Number(hit.unreadCount)).toBe(1);
  });

  it("the team's unread count reflects the two client posts", async () => {
    const { body } = await api("GET", "/api/project-message/unread", undefined, adminToken);
    const hit = body.data.find((r: { projectId: number }) => r.projectId === ownProjectId);
    expect(hit).toBeTruthy();
    expect(Number(hit.unreadCount)).toBe(2);
  });

  it("POST /read clears the client's unread count and reports what it changed", async () => {
    const read = await api(
      "POST",
      "/api/project-message/read",
      { projectId: ownProjectId },
      clientToken,
    );
    expect(read.status).toBe(200);
    expect(read.body.data).toEqual({ projectId: ownProjectId, updatedCount: 1 });

    const { body } = await api("GET", "/api/project-message/unread", undefined, clientToken);
    const hit = body.data.find((r: { projectId: number }) => r.projectId === ownProjectId);
    expect(hit).toBeUndefined();

    // Idempotent: a second read changes nothing.
    const again = await api(
      "POST",
      "/api/project-message/read",
      { projectId: ownProjectId },
      clientToken,
    );
    expect(again.body.data.updatedCount).toBe(0);
  });

  it("a client post does not create a client notification", async () => {
    const before = (await clientNotification()).length;
    await api(
      "POST",
      "/api/project-message",
      { projectId: ownProjectId, body: "Client again" },
      clientToken,
    );
    const after = (await clientNotification()).length;
    expect(after).toBe(before);
  });
});

// ─── Preview link history ─────────────────────────────

describe("Preview link history", () => {
  let mintedUrl: string;

  it("POST /:id/preview-link mints a link (setting a preview URL first if needed)", async () => {
    const detail = await api("GET", `/api/projects/${ownProjectId}`, undefined, adminToken);
    if (!detail.body.data?.previewUrl) {
      const patched = await api(
        "PATCH",
        `/api/projects/${ownProjectId}`,
        { previewUrl: "https://example.test/preview" },
        adminToken,
      );
      expect(patched.status).toBe(200);
    }

    const { status, body } = await api(
      "POST",
      `/api/projects/${ownProjectId}/preview-link`,
      undefined,
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.data.url).toContain("/api/preview/");
    mintedUrl = body.data.url;
  });

  it("GET /:id/preview-link lists the minted row, newest first", async () => {
    const { status, body } = await api(
      "GET",
      `/api/projects/${ownProjectId}/preview-link`,
      undefined,
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].url).toBe(mintedUrl);
    expect(body.data[0].projectId).toBe(ownProjectId);
    expect(body.data[0].issuedByUserId).toBeTruthy();
    expect(body.data[0].expiresAt).toBeTruthy();
    expect(new Date(body.data[0].expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("the client sees their own history and gets 403 on a foreign project", async () => {
    const own = await api(
      "GET",
      `/api/projects/${ownProjectId}/preview-link`,
      undefined,
      clientToken,
    );
    expect(own.status).toBe(200);
    expect(own.body.data[0].url).toBe(mintedUrl);

    const foreign = await api(
      "GET",
      `/api/projects/${foreignProjectId}/preview-link`,
      undefined,
      clientToken,
    );
    expect(foreign.status).toBe(403);
  });

  it("minting notifies the client with the url in the body", async () => {
    const row = await clientNotification();
    const hit = row.find(
      (n) =>
        n.projectId === ownProjectId &&
        n.title === `A new preview is ready for ${ownProjectTitle}`,
    );
    expect(hit).toBeTruthy();
    expect(hit?.type).toBe("progress_update");
    expect(hit?.body).toContain(mintedUrl);
  });
});

// ─── Deliverable completion ───────────────────────────

describe("Deliverable completion notifies the client", () => {
  const title = `Thread deliverable ${Date.now()}`;
  let deliverableId: number;

  it("PATCH status → finished creates a deliverable_completed notification", async () => {
    const created = await api(
      "POST",
      "/api/deliverables",
      { projectId: ownProjectId, title, status: "in_progress" },
      adminToken,
    );
    expect(created.status).toBe(201);
    deliverableId = created.body.data.deliverableId;

    const patched = await api(
      "PATCH",
      `/api/deliverables/${deliverableId}`,
      { status: "finished" },
      adminToken,
    );
    expect(patched.status).toBe(200);
    expect(patched.body.data.status).toBe("finished");

    const row = await clientNotification();
    const hit = row.filter(
      (n) => n.projectId === ownProjectId && n.title === `${title} is done`,
    );
    expect(hit.length).toBe(1);
    expect(hit[0].type).toBe("deliverable_completed");
  });

  it("re-saving an already-finished deliverable does not notify again", async () => {
    const patched = await api(
      "PATCH",
      `/api/deliverables/${deliverableId}`,
      { status: "finished", description: "touched" },
      adminToken,
    );
    expect(patched.status).toBe(200);

    const row = await clientNotification();
    const hit = row.filter(
      (n) => n.projectId === ownProjectId && n.title === `${title} is done`,
    );
    expect(hit.length).toBe(1);
  });
});
