/**
 * End-to-End Flow Tests
 *
 * Tests the complete ADVO app flow against the live API:
 * Admin CRUD, client lifecycle, camelCase mapping, auth flows
 */

import { describe, it, expect, beforeAll } from "vitest";

const API = process.env.VITE_API_URL || "http://localhost:6407";

let adminToken: string;
let teamToken: string;

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

beforeAll(async () => {
  const { body } = await api("POST", "/api/auth/login", {
    email: "admin@advo.ph",
    password: "changeme",
  });
  adminToken = body.data.accessToken;
});

// ─── Auth Flows ───────────────────────────────────────

describe("Auth Flows", () => {
  it("admin can login and gets role=admin", async () => {
    const { body } = await api("POST", "/api/auth/login", {
      email: "admin@advo.ph",
      password: "changeme",
    });
    expect(body.data.user.role).toBe("admin");
  });

  it("team member can login", async () => {
    const { body } = await api("POST", "/api/auth/login", {
      email: "angelo.revelo@advo.ph",
      password: "Advo2026!admin",
    });
    expect(body.data.user).toBeTruthy();
    teamToken = body.data.accessToken;
  });

  it("refresh token rotation works (one-time use)", async () => {
    const login = await api("POST", "/api/auth/login", {
      email: "admin@advo.ph",
      password: "changeme",
    });
    const rt = login.body.data.refreshToken;

    // First refresh should work
    const r1 = await api("POST", "/api/auth/refresh", { refreshToken: rt });
    expect(r1.status).toBe(200);
    expect(r1.body.data.refreshToken).not.toBe(rt);

    // Second refresh with same token should fail (one-time use)
    const r2 = await api("POST", "/api/auth/refresh", { refreshToken: rt });
    expect(r2.status).toBe(401);
  });

  it("magic link request returns success (no email enumeration)", async () => {
    const { status, body } = await api("POST", "/api/auth/magic-link", {
      email: "nonexistent@example.com",
    });
    expect(status).toBe(200);
    expect(body.error).toBeNull();
  });

  it("invalid magic link token is rejected", async () => {
    const { status } = await api("POST", "/api/auth/magic-link/verify", {
      token: "invalid-token-here",
    });
    expect(status).toBe(401);
  });
});

// ─── API Response Format ──────────────────────────────

describe("API Response Format", () => {
  it("all responses use camelCase keys", async () => {
    const { body } = await api("GET", "/api/projects", undefined, adminToken);
    if (body.data.length > 0) {
      const project = body.data[0];
      expect(project).toHaveProperty("projectId");
      expect(project).toHaveProperty("clientId");
      expect(project).toHaveProperty("projectStatus");
      expect(project).toHaveProperty("totalValueCents");
      expect(project).toHaveProperty("createdAt");
      // Should NOT have snake_case
      expect(project).not.toHaveProperty("project_id");
      expect(project).not.toHaveProperty("client_id");
    }
  });

  it("team members have camelCase keys", async () => {
    const { body } = await api("GET", "/api/team");
    if (body.data.length > 0) {
      const member = body.data[0];
      expect(member).toHaveProperty("teamMemberId");
      expect(member).toHaveProperty("avatarUrl");
      expect(member).toHaveProperty("permissionRole");
      expect(member).not.toHaveProperty("team_member_id");
    }
  });

  it("invoices have camelCase keys", async () => {
    const { body } = await api("GET", "/api/invoices", undefined, adminToken);
    if (body.data.length > 0) {
      const inv = body.data[0];
      expect(inv).toHaveProperty("invoiceId");
      expect(inv).toHaveProperty("amountCents");
      expect(inv).toHaveProperty("projectId");
      expect(inv).not.toHaveProperty("invoice_id");
    }
  });

  it("leads have camelCase keys", async () => {
    const { body } = await api("GET", "/api/leads", undefined, adminToken);
    if (body.data.length > 0) {
      const lead = body.data[0];
      expect(lead).toHaveProperty("leadId");
      expect(lead).toHaveProperty("projectType");
      expect(lead).toHaveProperty("submittedAt");
      expect(lead).not.toHaveProperty("lead_id");
    }
  });
});

// ─── Full CRUD Lifecycle ──────────────────────────────

describe("Client CRUD Lifecycle", () => {
  let clientId: number;

  it("create client", async () => {
    const { status, body } = await api(
      "POST",
      "/api/clients",
      { companyName: "E2E Test Corp", contactEmail: "e2e@test.com" },
      adminToken
    );
    expect(status).toBe(201);
    clientId = body.data.clientId;
    expect(clientId).toBeTruthy();
    expect(body.data.companyName).toBe("E2E Test Corp");
  });

  it("read client", async () => {
    const { body } = await api("GET", `/api/clients/${clientId}`, undefined, adminToken);
    expect(body.data.companyName).toBe("E2E Test Corp");
  });

  it("update client", async () => {
    const { body } = await api(
      "PATCH",
      `/api/clients/${clientId}`,
      { companyName: "E2E Updated Corp" },
      adminToken
    );
    expect(body.data.companyName).toBe("E2E Updated Corp");
  });

  it("invite client (creates auth account)", async () => {
    const { status, body } = await api(
      "POST",
      `/api/clients/${clientId}/invite`,
      undefined,
      adminToken
    );
    expect(status).toBe(200);
    expect(body.data.userId).toBeTruthy();
  });

  it("delete client", async () => {
    const { status } = await api("DELETE", `/api/clients/${clientId}`, undefined, adminToken);
    expect(status).toBe(200);
  });
});

describe("Project CRUD Lifecycle", () => {
  let projectId: number;
  let clientId: number;

  beforeAll(async () => {
    // Create a client first
    const { body } = await api(
      "POST",
      "/api/clients",
      { companyName: "Project Test Co", contactEmail: "proj@test.com" },
      adminToken
    );
    clientId = body.data.clientId;
  });

  it("create project", async () => {
    const { status, body } = await api(
      "POST",
      "/api/projects",
      {
        clientId,
        title: "E2E Test Project",
        description: "Testing project CRUD",
        projectStatus: "discovery",
        totalValueCents: 10000000,
        techStack: ["React", "TypeScript"],
      },
      adminToken
    );
    expect(status).toBe(201);
    projectId = body.data.projectId;
    expect(projectId).toBeTruthy();
  });

  it("read project with relations", async () => {
    const { body } = await api("GET", `/api/projects/${projectId}`, undefined, adminToken);
    expect(body.data.title).toBe("E2E Test Project");
    expect(body.data.client).toBeTruthy();
    expect(body.data.updates).toBeDefined();
    expect(body.data.assets).toBeDefined();
    expect(body.data.team).toBeDefined();
  });

  it("update project status", async () => {
    const { body } = await api(
      "PATCH",
      `/api/projects/${projectId}`,
      { projectStatus: "development" },
      adminToken
    );
    expect(body.data.projectStatus).toBe("development");
  });

  it("add progress update to project", async () => {
    const { status, body } = await api(
      "POST",
      `/api/projects/${projectId}/updates`,
      { updateTitle: "E2E progress update", updateBody: "Testing" },
      adminToken
    );
    expect(status).toBe(201);
    expect(body.data.progressUpdateId).toBeTruthy();
  });

  it("list project updates", async () => {
    const { body } = await api("GET", `/api/projects/${projectId}/updates`, undefined, adminToken);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].updateTitle).toBe("E2E progress update");
  });

  it("delete project", async () => {
    const { status } = await api("DELETE", `/api/projects/${projectId}`, undefined, adminToken);
    expect(status).toBe(200);
  });

  // Cleanup
  it("cleanup test client", async () => {
    await api("DELETE", `/api/clients/${clientId}`, undefined, adminToken);
  });
});

describe("Invoice Lifecycle", () => {
  let invoiceId: number;
  let projectId: number;

  beforeAll(async () => {
    // Use existing project
    const { body } = await api("GET", "/api/projects", undefined, adminToken);
    projectId = body.data[0]?.projectId;
  });

  it("create invoice", async () => {
    if (!projectId) return;
    const { status, body } = await api(
      "POST",
      "/api/invoices",
      {
        projectId,
        amountCents: 5000000,
        label: "E2E Test Invoice",
        status: "unpaid",
      },
      adminToken
    );
    expect(status).toBe(201);
    invoiceId = body.data.invoiceId;
  });

  it("toggle invoice to paid", async () => {
    if (!invoiceId) return;
    const { body } = await api(
      "PATCH",
      `/api/invoices/${invoiceId}`,
      { status: "paid" },
      adminToken
    );
    expect(body.data.status).toBe("paid");
    expect(body.data.paidAt).toBeTruthy();
  });

  it("delete invoice", async () => {
    if (!invoiceId) return;
    const { status } = await api("DELETE", `/api/invoices/${invoiceId}`, undefined, adminToken);
    expect(status).toBe(200);
  });
});

describe("Lead Lifecycle", () => {
  let leadId: number;

  it("submit lead (public, no auth)", async () => {
    const { status, body } = await api("POST", "/api/leads", {
      name: "E2E Lead",
      email: "e2elead@test.com",
      company: "E2E Corp",
      projectType: "Web App",
      budget: "₱100k-200k",
      description: "End-to-end test lead",
    });
    expect(status).toBe(201);
    leadId = body.data.leadId;
  });

  it("update lead status", async () => {
    const { body } = await api(
      "PATCH",
      `/api/leads/${leadId}`,
      { status: "contacted" },
      adminToken
    );
    expect(body.data.status).toBe("contacted");
  });

  it("add notes to lead", async () => {
    const { body } = await api(
      "PATCH",
      `/api/leads/${leadId}`,
      { notes: "E2E test notes" },
      adminToken
    );
    expect(body.data.notes).toBe("E2E test notes");
  });

  it("delete lead", async () => {
    const { status } = await api("DELETE", `/api/leads/${leadId}`, undefined, adminToken);
    expect(status).toBe(200);
  });
});

describe("Notification Flow", () => {
  it("send notification to client", async () => {
    // Get first client
    const clients = await api("GET", "/api/clients", undefined, adminToken);
    const clientId = clients.body.data[0]?.clientId;
    if (!clientId) return;

    const { status, body } = await api(
      "POST",
      "/api/notifications",
      {
        clientId,
        title: "E2E Test Notification",
        body: "This is a test",
        type: "custom",
        sendEmail: false,
      },
      adminToken
    );
    expect(status).toBe(201);
    expect(body.data.notificationId).toBeTruthy();
  });

  it("broadcast notification", async () => {
    const { status } = await api(
      "POST",
      "/api/notifications/broadcast",
      { title: "E2E Broadcast", body: "Test broadcast", sendEmail: false },
      adminToken
    );
    expect(status).toBe(200);
  });
});

// ─── Content / CMS ────────────────────────────────────

describe("CMS Operations", () => {
  it("toggle section visibility", async () => {
    const { status, body } = await api(
      "PATCH",
      "/api/content/sections/hero",
      { visiblePublic: true },
      adminToken
    );
    expect(status).toBe(200);
    expect(body.data.visiblePublic).toBe(true);
  });

  it("update section content", async () => {
    const { status } = await api(
      "PATCH",
      "/api/content/sections/hero",
      { content: { headline: "Test headline" } },
      adminToken
    );
    expect(status).toBe(200);

    // Verify it persisted
    const { body } = await api("GET", "/api/content/sections");
    const hero = body.data.find((s: { sectionId: string }) => s.sectionId === "hero");
    expect(hero.content.headline).toBe("Test headline");

    // Revert
    await api(
      "PATCH",
      "/api/content/sections/hero",
      { content: {} },
      adminToken
    );
  });
});

// ─── Settings ─────────────────────────────────────────

describe("Settings", () => {
  it("update and read setting", async () => {
    await api(
      "PATCH",
      "/api/settings/test_key",
      { value: "test_value" },
      adminToken
    );

    const { body } = await api("GET", "/api/settings/test_key", undefined, adminToken);
    expect(body.data.value).toBe("test_value");
  });
});

// ─── RBAC / Permissions ───────────────────────────────

describe("RBAC", () => {
  it("unauthenticated cannot access projects", async () => {
    const { status } = await api("GET", "/api/projects");
    expect(status).toBe(401);
  });

  it("unauthenticated cannot access clients", async () => {
    const { status } = await api("GET", "/api/clients");
    expect(status).toBe(401);
  });

  it("unauthenticated CAN access team (public)", async () => {
    const { status } = await api("GET", "/api/team");
    expect(status).toBe(200);
  });

  it("unauthenticated CAN access content sections (public)", async () => {
    const { status } = await api("GET", "/api/content/sections");
    expect(status).toBe(200);
  });

  it("unauthenticated CAN submit leads (public)", async () => {
    const { status } = await api("POST", "/api/leads", {
      name: "RBAC Test",
      email: "rbac@test.com",
    });
    expect(status).toBe(201);
    // Cleanup
    const leads = await api("GET", "/api/leads", undefined, adminToken);
    const testLead = leads.body.data.find((l: { name: string }) => l.name === "RBAC Test");
    if (testLead) await api("DELETE", `/api/leads/${testLead.leadId}`, undefined, adminToken);
  });

  it("unauthenticated cannot access settings", async () => {
    const { status } = await api("GET", "/api/settings");
    expect(status).toBe(401);
  });
});

// ─── Data Integrity ───────────────────────────────────

describe("Data Integrity", () => {
  it("team members have avatar URLs", async () => {
    const { body } = await api("GET", "/api/team");
    for (const m of body.data) {
      expect(m.avatarUrl).toBeTruthy();
      expect(m.avatarUrl).toMatch(/^\/team\//);
    }
  });

  it("team members are ordered by ID (founder first)", async () => {
    const { body } = await api("GET", "/api/team");
    if (body.data.length >= 2) {
      expect(body.data[0].teamMemberId).toBeLessThan(body.data[1].teamMemberId);
    }
  });

  it("site config has required keys", async () => {
    const { body } = await api("GET", "/api/settings", undefined, adminToken);
    const keys = body.data.map((s: { key: string }) => s.key);
    expect(keys).toContain("agency_name");
    expect(keys).toContain("accent_color");
    expect(keys).toContain("auto_email_on_progress_update");
  });

  it("projects have client relation populated", async () => {
    const { body } = await api("GET", "/api/projects", undefined, adminToken);
    for (const p of body.data) {
      if (p.client) {
        expect(p.client.companyName).toBeTruthy();
      }
    }
  });
});
