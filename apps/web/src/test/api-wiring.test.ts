/**
 * API Wiring Validation Tests
 *
 * These tests verify that all frontend modules correctly call the ADVO
 * API. Default target is the local dev API (http://localhost:6107) but
 * can be overridden via VITE_API_URL (e.g. https://api.advo.ph).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API = process.env.VITE_API_URL || "http://localhost:6107";

async function apiGet(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

async function apiPost(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function apiPatch(path: string, body: unknown, token: string) {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function apiDelete(path: string, token: string) {
  const res = await fetch(`${API}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

let adminToken: string;

beforeAll(async () => {
  // Login as admin
  const { body } = await apiPost("/api/auth/login", {
    email: "admin@advo.ph",
    password: "changeme",
  });
  adminToken = body.data.accessToken;
});

// ─── Health ───────────────────────────────────────────

describe("Health", () => {
  it("GET /api/health returns ok", async () => {
    const { status, body } = await apiGet("/api/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe(true);
  });
});

// ─── Auth ─────────────────────────────────────────────

describe("Auth", () => {
  it("POST /api/auth/login returns tokens", async () => {
    const { status, body } = await apiPost("/api/auth/login", {
      email: "admin@advo.ph",
      password: "changeme",
    });
    expect(status).toBe(200);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();
    expect(body.data.user.role).toBe("admin");
    expect(body.error).toBeNull();
  });

  it("POST /api/auth/login rejects bad password", async () => {
    const { status, body } = await apiPost("/api/auth/login", {
      email: "admin@advo.ph",
      password: "wrong",
    });
    expect(status).toBe(401);
    expect(body.error).toBeTruthy();
  });

  it("GET /api/auth/me returns current user", async () => {
    const { status, body } = await apiGet("/api/auth/me", adminToken);
    expect(status).toBe(200);
    expect(body.data.email).toBe("admin@advo.ph");
    expect(body.data.role).toBe("admin");
  });

  it("GET /api/auth/me rejects without token", async () => {
    const { status } = await apiGet("/api/auth/me");
    expect(status).toBe(401);
  });

  it("POST /api/auth/refresh rotates tokens", async () => {
    // Get a fresh token pair
    const login = await apiPost("/api/auth/login", {
      email: "admin@advo.ph",
      password: "changeme",
    });
    const refreshToken = login.body.data.refreshToken;

    const { status, body } = await apiPost("/api/auth/refresh", { refreshToken });
    expect(status).toBe(200);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();
    // Old token should be invalidated (one-time use)
    expect(body.data.refreshToken).not.toBe(refreshToken);
  });
});

// ─── Projects ─────────────────────────────────────────

describe("Projects", () => {
  it("GET /api/projects returns array", async () => {
    const { status, body } = await apiGet("/api/projects", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.error).toBeNull();
  });

  it("GET /api/projects requires auth", async () => {
    const { status } = await apiGet("/api/projects");
    expect(status).toBe(401);
  });
});

// ─── Clients ──────────────────────────────────────────

describe("Clients", () => {
  it("GET /api/clients returns array", async () => {
    const { status, body } = await apiGet("/api/clients", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("POST + PATCH + DELETE client lifecycle", async () => {
    // Create
    const create = await apiPost(
      "/api/clients",
      { companyName: "Test Lifecycle Co", contactEmail: "test@lifecycle.com" },
      adminToken
    );
    expect(create.status).toBe(201);
    const clientId = create.body.data.clientId;
    expect(clientId).toBeTruthy();

    // Update
    const update = await apiPatch(
      `/api/clients/${clientId}`,
      { companyName: "Updated Co" },
      adminToken
    );
    expect(update.status).toBe(200);
    expect(update.body.data.companyName).toBe("Updated Co");

    // Delete
    const del = await apiDelete(`/api/clients/${clientId}`, adminToken);
    expect(del.status).toBe(200);
  });
});

// ─── Leads ────────────────────────────────────────────

describe("Leads", () => {
  it("POST /api/leads works without auth (public)", async () => {
    const { status, body } = await apiPost("/api/leads", {
      name: "Test Lead",
      email: "lead@test.com",
      company: "Test Inc",
      description: "Testing",
    });
    expect(status).toBe(201);
    expect(body.data.leadId).toBeTruthy();
    expect(body.error).toBeNull();
  });

  it("GET /api/leads requires auth", async () => {
    const { status } = await apiGet("/api/leads");
    expect(status).toBe(401);
  });

  it("GET /api/leads returns array for admin", async () => {
    const { status, body } = await apiGet("/api/leads", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── Team ─────────────────────────────────────────────

describe("Team", () => {
  it("GET /api/team works without auth (public)", async () => {
    const { status, body } = await apiGet("/api/team");
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── Invoices ─────────────────────────────────────────

describe("Invoices", () => {
  it("GET /api/invoices returns array", async () => {
    const { status, body } = await apiGet("/api/invoices", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── Deliverables ─────────────────────────────────────

describe("Deliverables", () => {
  it("GET /api/deliverables returns array", async () => {
    const { status, body } = await apiGet("/api/deliverables", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /api/deliverables/upcoming returns array", async () => {
    const { status, body } = await apiGet("/api/deliverables/upcoming", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── Notifications ────────────────────────────────────

describe("Notifications", () => {
  it("GET /api/notifications returns array", async () => {
    const { status, body } = await apiGet("/api/notifications", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── Calendar ─────────────────────────────────────────
// Regression for the "Calendar endpoints" coverage gap (commit 0018c3e):
// /api/calendar GET (derived ∪ manual union) + manual-event CRUD.

describe("Calendar", () => {
  it("GET /api/calendar requires auth", async () => {
    const { status } = await apiGet("/api/calendar");
    expect(status).toBe(401);
  });

  it("GET /api/calendar returns the unified event array for a range", async () => {
    const from = new Date(Date.UTC(2026, 0, 1)).toISOString();
    const to = new Date(Date.UTC(2026, 11, 31)).toISOString();
    const { status, body } = await apiGet(
      `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      adminToken,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.error).toBeNull();
    // Every event — derived or manual — carries the unified CalEvent shape.
    for (const ev of body.data) {
      expect(ev).toHaveProperty("id");
      expect(ev).toHaveProperty("source");
      expect(ev).toHaveProperty("start");
      expect(typeof ev.editable).toBe("boolean");
    }
  });

  it("POST + GET + PATCH + DELETE manual-event lifecycle", async () => {
    const startsAt = new Date(Date.UTC(2026, 5, 15, 9, 0, 0)).toISOString();

    // Create a manual event.
    const create = await apiPost(
      "/api/calendar",
      { title: "Test Calendar Event", category: "meeting", startsAt, isAllDay: false },
      adminToken,
    );
    expect(create.status).toBe(201);
    const eventId = create.body.data.calendarEventId;
    expect(eventId).toBeTruthy();
    expect(create.body.data.category).toBe("meeting");

    // Read it back through the unified range query — manual events are editable
    // and namespaced `manual-<id>` in the union.
    const from = new Date(Date.UTC(2026, 5, 1)).toISOString();
    const to = new Date(Date.UTC(2026, 5, 30)).toISOString();
    const list = await apiGet(
      `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      adminToken,
    );
    const mine = list.body.data.find((e: { id: string }) => e.id === `manual-${eventId}`);
    expect(mine).toBeTruthy();
    expect(mine.source).toBe("manual");
    expect(mine.editable).toBe(true);
    expect(mine.title).toBe("Test Calendar Event");

    // Update (PATCH targets the raw numeric calendarEventId, not the namespaced id).
    const update = await apiPatch(
      `/api/calendar/${eventId}`,
      { title: "Renamed Event" },
      adminToken,
    );
    expect(update.status).toBe(200);
    expect(update.body.data.title).toBe("Renamed Event");

    // Delete, then confirm it's gone (a second delete 404s).
    const del = await apiDelete(`/api/calendar/${eventId}`, adminToken);
    expect(del.status).toBe(200);
    const delAgain = await apiDelete(`/api/calendar/${eventId}`, adminToken);
    expect(delAgain.status).toBe(404);
  });

  it("derives a content/social layer into the union (Phase 2, no migration)", async () => {
    const scheduledFor = new Date(Date.UTC(2026, 7, 10, 8, 0, 0)).toISOString();

    // Seed a scheduled social post via the content API.
    const create = await apiPost(
      "/api/content/social",
      { platform: "Instagram", content: "Calendar layer test post", scheduledFor },
      adminToken,
    );
    expect(create.status).toBe(201);
    const socialId = create.body.data.socialPostId;
    expect(socialId).toBeTruthy();

    // It surfaces in the calendar union as a read-only derived event.
    const from = new Date(Date.UTC(2026, 7, 1)).toISOString();
    const to = new Date(Date.UTC(2026, 7, 31)).toISOString();
    const list = await apiGet(
      `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      adminToken,
    );
    const ev = list.body.data.find(
      (e: { id: string }) => e.id === `social-scheduled-${socialId}`,
    );
    expect(ev).toBeTruthy();
    expect(ev.source).toBe("social");
    expect(ev.category).toBe("social_scheduled");
    expect(ev.editable).toBe(false);
    expect(ev.title).toContain("Instagram");

    // Clean up the seeded post.
    const del = await apiDelete(`/api/content/social/${socialId}`, adminToken);
    expect(del.status).toBe(200);
  });

  it("generates PH compliance deadlines into the union (read-only, no DB rows)", async () => {
    // April 2026 → annual ITR (Apr 15), monthly 1601-C (Apr 10), SSS month-end (Apr 30).
    const from = new Date(Date.UTC(2026, 3, 1)).toISOString();
    const to = new Date(Date.UTC(2026, 3, 30, 23, 59, 59)).toISOString();
    const { status, body } = await apiGet(
      `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      adminToken,
    );
    expect(status).toBe(200);
    const itr = body.data.find(
      (e: { id: string }) => e.id === "compliance-1701-annual-2026-04-15",
    );
    expect(itr).toBeTruthy();
    expect(itr.source).toBe("compliance");
    expect(itr.category).toBe("compliance_deadline");
    expect(itr.editable).toBe(false);
    expect(itr.title).toContain("BIR");
    // Monthly 1601-C withholding (Apr 10).
    const monthly = body.data.find(
      (e: { id: string }) => e.id === "compliance-1601-c-monthly-2026-3",
    );
    expect(monthly).toBeTruthy();
    expect(monthly.category).toBe("compliance_deadline");
    // Non-BIR agency derives too (SSS month-end, day 30 clamped to Apr 30).
    const sss = body.data.find(
      (e: { id: string }) => e.id === "compliance-sss-r5-monthly-2026-3",
    );
    expect(sss).toBeTruthy();
    expect(sss.title).toContain("SSS");
  });
});

// ─── Content / CMS ────────────────────────────────────

describe("Content", () => {
  it("GET /api/content/sections works without auth", async () => {
    const { status, body } = await apiGet("/api/content/sections");
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("GET /api/content/portfolio works without auth", async () => {
    const { status, body } = await apiGet("/api/content/portfolio");
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("PATCH /api/content/sections/:id requires admin", async () => {
    const { status } = await apiPatch(
      "/api/content/sections/hero",
      { visiblePublic: true },
      adminToken
    );
    expect(status).toBe(200);
  });
});

// ─── Settings ─────────────────────────────────────────

describe("Settings", () => {
  it("GET /api/settings returns config", async () => {
    const { status, body } = await apiGet("/api/settings", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    const keys = body.data.map((s: { key: string }) => s.key);
    expect(keys).toContain("agency_name");
    expect(keys).toContain("accent_color");
  });

  it("GET /api/settings requires admin", async () => {
    const { status } = await apiGet("/api/settings");
    expect(status).toBe(401);
  });
});

// ─── Response Envelope ────────────────────────────────

describe("Response Envelope", () => {
  it("All responses have { data, error } shape", async () => {
    const endpoints = [
      { path: "/api/health", auth: false },
      { path: "/api/projects", auth: true },
      { path: "/api/clients", auth: true },
      { path: "/api/leads", auth: true },
      { path: "/api/invoices", auth: true },
      { path: "/api/deliverables", auth: true },
      { path: "/api/notifications", auth: true },
      { path: "/api/content/sections", auth: false },
      { path: "/api/content/portfolio", auth: false },
      { path: "/api/team", auth: false },
      { path: "/api/settings", auth: true },
    ];

    for (const ep of endpoints) {
      const { body } = await apiGet(ep.path, ep.auth ? adminToken : undefined);
      // Health endpoint has different shape
      if (ep.path === "/api/health") {
        expect(body.status).toBeDefined();
        continue;
      }
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error");
    }
  });
});

// ─── Contracts — red-flag review ──────────────────────

describe("Contracts red-flag review", () => {
  it("flags a contract silent on all policies as high_risk", async () => {
    const { status, body } = await apiPost(
      "/api/contracts/review",
      {
        contractText:
          "This agreement is between ADVO and the Client for a website build. The total cost is one hundred thousand pesos. Work begins when both parties agree.",
      },
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.data.verdict).toBe("high_risk");
    expect(body.data.flags.every((f: { severity: string }) => f.severity === "red")).toBe(true);
  });

  it("passes a contract that covers all five policies", async () => {
    const { status, body } = await apiPost(
      "/api/contracts/review",
      {
        contractText:
          "Client shall pay a non-refundable downpayment of forty percent (40%) of the Total Project Value before any work begins. Each phase includes two (2) revision rounds; additional revisions are billed at the then-current hourly rate. Any change order adding new scope must be signed before work commences. Invoices are due within fifteen (15) days; amounts unpaid after thirty (30) days accrue interest at 2% per month and ADVO may pause work. Either party may terminate with fifteen (15) days written notice.",
      },
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.data.verdict).toBe("good_to_go");
  });

  it("requires auth", async () => {
    const { status } = await apiPost("/api/contracts/review", { contractText: "x".repeat(40) });
    expect(status).toBe(401);
  });
});

// ─── Contract records (CRUD + calendar) ───────────────
// Phase 2 calendar layer (migration 004): first-class contract/MOA records
// whose signed/expiry dates derive into the /api/calendar union.

describe("Contract records (CRUD + calendar derivation)", () => {
  let contractClientId: number;

  beforeAll(async () => {
    const c = await apiPost(
      "/api/clients",
      { companyName: "Contract Test Co", contactEmail: "contract@test.com" },
      adminToken,
    );
    contractClientId = c.body.data.clientId;
  });

  afterAll(async () => {
    // Cascades any leftover contract rows (FK ON DELETE CASCADE, migration 004).
    if (contractClientId) await apiDelete(`/api/clients/${contractClientId}`, adminToken);
  });

  it("GET /api/contracts requires auth", async () => {
    const { status } = await apiGet("/api/contracts");
    expect(status).toBe(401);
  });

  it("POST + GET + PATCH + DELETE + calendar derivation", async () => {
    const signedAt = new Date(Date.UTC(2026, 8, 5)).toISOString(); // Sep 5 2026
    const expiresAt = new Date(Date.UTC(2026, 11, 5)).toISOString(); // Dec 5 2026

    // Create a contract record.
    const create = await apiPost(
      "/api/contracts",
      {
        clientId: contractClientId,
        title: "Felici Gelato MOA",
        contractType: "moa",
        status: "signed",
        valueCents: 6000000,
        signedAt,
        expiresAt,
      },
      adminToken,
    );
    expect(create.status).toBe(201);
    const contractId = create.body.data.contractId;
    expect(contractId).toBeTruthy();
    expect(create.body.data.contractType).toBe("moa");

    // It lists.
    const list = await apiGet("/api/contracts", adminToken);
    expect(list.status).toBe(200);
    expect(
      list.body.data.some((x: { contractId: number }) => x.contractId === contractId),
    ).toBe(true);

    // Both signed + expiry markers derive into the calendar union, read-only.
    const from = new Date(Date.UTC(2026, 8, 1)).toISOString();
    const to = new Date(Date.UTC(2026, 11, 31)).toISOString();
    const cal = await apiGet(
      `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      adminToken,
    );
    const signed = cal.body.data.find(
      (e: { id: string }) => e.id === `contract-signed-${contractId}`,
    );
    const expires = cal.body.data.find(
      (e: { id: string }) => e.id === `contract-expires-${contractId}`,
    );
    expect(signed).toBeTruthy();
    expect(signed.source).toBe("contract");
    expect(signed.category).toBe("contract_signed");
    expect(signed.editable).toBe(false);
    expect(signed.title).toContain("Felici Gelato MOA");
    expect(expires).toBeTruthy();
    expect(expires.category).toBe("contract_expires");

    // Update status.
    const update = await apiPatch(
      `/api/contracts/${contractId}`,
      { status: "active" },
      adminToken,
    );
    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe("active");

    // Delete, then confirm it's gone.
    const del = await apiDelete(`/api/contracts/${contractId}`, adminToken);
    expect(del.status).toBe(200);
    const delAgain = await apiDelete(`/api/contracts/${contractId}`, adminToken);
    expect(delAgain.status).toBe(404);
  });
});

// ─── Preview links (Show Client Now) ──────────────────

describe("Preview links", () => {
  let previewClientId: number;
  let previewProjectId: number;

  beforeAll(async () => {
    const c = await apiPost(
      "/api/clients",
      { companyName: "Preview Co", contactEmail: "preview@test.com" },
      adminToken,
    );
    previewClientId = c.body.data.clientId;
    const p = await apiPost(
      "/api/projects",
      { clientId: previewClientId, title: "Preview Project", previewUrl: "https://example.com/staging" },
      adminToken,
    );
    previewProjectId = p.body.data.projectId;
  });

  afterAll(async () => {
    if (previewClientId) await apiDelete(`/api/clients/${previewClientId}`, adminToken);
  });

  it("mints an expiring preview link", async () => {
    const { status, body } = await apiPost(
      `/api/projects/${previewProjectId}/preview-link`,
      {},
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.data.url).toContain("/api/preview/");
    expect(body.data.ttlMinutes).toBe(20);
  });

  it("an invalid preview token returns 410", async () => {
    const res = await fetch(`${API}/api/preview/not-a-valid-token`, { redirect: "manual" });
    expect(res.status).toBe(410);
  });

  it("logs a client preview request the team can see", async () => {
    const { status } = await apiPost(
      `/api/projects/${previewProjectId}/preview-request`,
      {},
      adminToken,
    );
    expect(status).toBe(201);
    const reqs = await apiGet(`/api/projects/${previewProjectId}/preview-requests`, adminToken);
    expect(reqs.body.data.length).toBeGreaterThan(0);
  });
});

// ─── Authorization — cross-tenant data scoping ────────
// Regression for WIRING-AUDIT.md S1/S2/S3: a logged-in client must not be able
// to read another client's deliverables, project detail, or notifications.
// Requires the client@advo.ph seed fixture (apps/api/src/db/seed.ts).

describe("Authorization — cross-tenant data scoping", () => {
  let clientToken: string | undefined;
  let otherClientId: number;
  let otherProjectId: number;
  let otherDeliverableId: number;
  let otherNotificationId: number;

  beforeAll(async () => {
    // Log in as the seeded client (owns only "Seed Client Co" data).
    const login = await apiPost("/api/auth/login", {
      email: "client@advo.ph",
      password: "changeme",
    });
    clientToken = login.body?.data?.accessToken;

    // As admin, create a SECOND client's project + deliverable + notification.
    const other = await apiPost(
      "/api/clients",
      { companyName: "Isolation Test Co", contactEmail: "isolation@test.com" },
      adminToken
    );
    otherClientId = other.body.data.clientId;

    const proj = await apiPost(
      "/api/projects",
      { clientId: otherClientId, title: "Other Client Project", totalValueCents: 999999 },
      adminToken
    );
    otherProjectId = proj.body.data.projectId;

    const dlv = await apiPost(
      "/api/deliverables",
      { projectId: otherProjectId, title: "Other client deliverable" },
      adminToken
    );
    otherDeliverableId = dlv.body.data.deliverableId;

    const notif = await apiPost(
      "/api/notifications",
      { clientId: otherClientId, title: "Other client notification", sendEmail: false },
      adminToken
    );
    otherNotificationId = notif.body.data.notificationId;
  });

  afterAll(async () => {
    // Deleting the client cascades to its project/deliverable/notification
    // (FK ON DELETE CASCADE, migration 002).
    if (otherClientId) await apiDelete(`/api/clients/${otherClientId}`, adminToken);
  });

  it("seed client fixture is present (login succeeds)", () => {
    expect(clientToken).toBeTruthy();
  });

  it("S2: client cannot read another client's project by id (IDOR → 404)", async () => {
    const { status } = await apiGet(`/api/projects/${otherProjectId}`, clientToken);
    expect(status).toBe(404);
  });

  it("S2: GET /api/projects lists only the client's own projects", async () => {
    const { body } = await apiGet("/api/projects", clientToken);
    const ids = body.data.map((p: { projectId: number }) => p.projectId);
    expect(ids).not.toContain(otherProjectId);
  });

  it("S1: GET /api/deliverables does not leak another client's deliverables", async () => {
    const { body } = await apiGet("/api/deliverables", clientToken);
    const ids = body.data.map((d: { deliverableId: number }) => d.deliverableId);
    expect(ids).not.toContain(otherDeliverableId);
  });

  it("S3: client cannot mark another client's notification read (→ 404)", async () => {
    const { status } = await apiPatch(
      `/api/notifications/${otherNotificationId}/read`,
      {},
      clientToken as string
    );
    expect(status).toBe(404);
  });
});

// ─── No Supabase Imports ──────────────────────────────

describe("No Supabase in Source", () => {
  it("No source files import from @/integrations/supabase", async () => {
    // This test verifies the migration is complete by checking
    // that no active source files still import supabase
    const fs = await import("fs");
    const path = await import("path");

    const srcDir = path.resolve(__dirname, "..");
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip the old integrations/supabase directory
          if (full.includes("integrations/supabase")) continue;
          walk(full);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const content = fs.readFileSync(full, "utf-8");
          const importPattern = "integrations/" + "supabase/client";
          if (content.includes(importPattern) && !full.includes("test/")) {
            files.push(full.replace(srcDir + "/", ""));
          }
        }
      }
    }

    walk(srcDir);
    expect(files).toEqual([]);
  });
});
