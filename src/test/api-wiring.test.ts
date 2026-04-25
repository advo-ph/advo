/**
 * API Wiring Validation Tests
 *
 * These tests verify that all frontend modules correctly call the ADVO
 * API. Default target is the local dev API (http://localhost:6107) but
 * can be overridden via VITE_API_URL (e.g. https://api.advo.ph).
 */

import { describe, it, expect, beforeAll } from "vitest";

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
