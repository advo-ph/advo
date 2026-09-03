/**
 * Regression tests for the calendar / availability / deliverable timezone work.
 *
 * Two halves:
 *
 *   1. Pure unit tests over src/lib/manila-time.ts. These are the ones that hold the
 *      storage convention in place: a date-only due date means the WHOLE of that day in
 *      Asia/Manila, and is not overdue until that day has ended there.
 *
 *   2. A live cross-tenant regression for GET /api/deliverables/upcoming. That route was
 *      mounted under requireAuth with no user scoping at all, so any logged-in client
 *      could read every non-completed deliverable in the database along with the joined
 *      project's totalValueCents, amountPaidCents and techStack. api-wiring.test.ts
 *      covers GET /api/deliverables but has never covered /upcoming, which is exactly how
 *      the hole stayed open.
 *
 * The live half skips itself when the dev API is not running, so the unit half still runs
 * in a bare checkout.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  daysUntil,
  formatManilaDate,
  isPastDue,
  manilaDateOf,
  manilaToday,
  minutesToTime,
  timeRangeProblem,
  timeToMinutes,
} from "@/lib/manila-time";

const API = process.env.VITE_API_URL || "http://localhost:6407";

// Manila midnight on 2 Sep 2026. This is what `<input type="date">` sending "2026-09-02"
// now stores, and it is 2026-09-01T16:00:00Z — a different DATE in UTC, which is the
// whole bug in one value.
const DUE_SEP_2 = "2026-09-01T16:00:00.000Z";

const at = (iso: string) => new Date(iso);

describe("manila-time — the storage convention", () => {
  it("reads the Manila calendar date of an instant, not the UTC one", () => {
    expect(manilaDateOf(DUE_SEP_2)).toBe("2026-09-02");
    expect(DUE_SEP_2.slice(0, 10)).toBe("2026-09-01"); // what the old prefill used
  });

  it("is null-safe rather than throwing on absent or malformed input", () => {
    expect(manilaDateOf(null)).toBeNull();
    expect(manilaDateOf(undefined)).toBeNull();
    expect(manilaDateOf("")).toBeNull();
    expect(manilaDateOf("not a date")).toBeNull();
  });

  it("resolves today in Manila regardless of the host timezone", () => {
    // 2026-09-02 15:59 UTC is already 2026-09-02 23:59 in Manila.
    expect(manilaToday(at("2026-09-02T15:59:00Z"))).toBe("2026-09-02");
    // One minute later it is the 3rd in Manila, though still the 2nd in UTC.
    expect(manilaToday(at("2026-09-02T16:01:00Z"))).toBe("2026-09-03");
  });
});

describe("isPastDue — a thing due today is not late today", () => {
  it("is NOT overdue at any point during the day it is due", () => {
    // These are the hours the old instant comparison got wrong.
    expect(isPastDue(DUE_SEP_2, at("2026-09-01T16:01:00Z"))).toBe(false); // 00:01 Manila
    expect(isPastDue(DUE_SEP_2, at("2026-09-02T00:00:00Z"))).toBe(false); // 08:00 Manila
    expect(isPastDue(DUE_SEP_2, at("2026-09-02T01:00:00Z"))).toBe(false); // 09:00 Manila
    expect(isPastDue(DUE_SEP_2, at("2026-09-02T09:00:00Z"))).toBe(false); // 17:00 Manila
    expect(isPastDue(DUE_SEP_2, at("2026-09-02T15:59:00Z"))).toBe(false); // 23:59 Manila
  });

  it("IS overdue once that Manila day has ended", () => {
    expect(isPastDue(DUE_SEP_2, at("2026-09-02T16:01:00Z"))).toBe(true); // 00:01 on the 3rd
    expect(isPastDue(DUE_SEP_2, at("2026-09-04T01:00:00Z"))).toBe(true);
  });

  it("treats a missing due date as not overdue", () => {
    expect(isPastDue(null)).toBe(false);
    expect(isPastDue(undefined)).toBe(false);
    expect(isPastDue("")).toBe(false);
  });
});

describe("daysUntil — the urgency window has a floor", () => {
  it("counts whole Manila days forward", () => {
    expect(daysUntil(DUE_SEP_2, at("2026-09-02T01:00:00Z"))).toBe(0);
    expect(daysUntil(DUE_SEP_2, at("2026-08-30T01:00:00Z"))).toBe(3);
  });

  it("goes negative once the date has passed, so 'urgent' can exclude it", () => {
    // The old test was `due - now < 3 days` with no lower bound, so a year-late item
    // satisfied it and read as urgent rather than as late.
    const yearLate = daysUntil(DUE_SEP_2, at("2027-09-02T01:00:00Z"));
    expect(yearLate).toBeLessThan(0);
    const isUrgent = (d: number | null) => d !== null && d >= 0 && d <= 3;
    expect(isUrgent(yearLate)).toBe(false);
    expect(isUrgent(daysUntil(DUE_SEP_2, at("2026-08-31T01:00:00Z")))).toBe(true);
  });
});

describe("formatManilaDate — renders ADVO's date, not the reader's", () => {
  it("shows Sep 2 for a due date stored as Manila midnight on the 2nd", () => {
    expect(formatManilaDate(DUE_SEP_2)).toBe("Sep 2");
  });

  it("renders an em dash placeholder rather than 'Invalid Date'", () => {
    expect(formatManilaDate(null)).toBe("—");
    expect(formatManilaDate("nonsense")).toBe("—");
  });
});

describe("clock times on the availability grid", () => {
  it("keeps the minutes that the hour-only grid used to discard", () => {
    expect(timeToMinutes("13:15")).toBe(795);
    expect(timeToMinutes("13:45")).toBe(825);
    expect(timeToMinutes("09:30")).toBe(570);
  });

  it("reads an END time of 00:00 as midnight at the end of the day", () => {
    // <input type="time"> cannot emit "24:00", and rows like 13:00-00:00 already exist.
    expect(timeToMinutes("00:00", true)).toBe(1440);
    expect(timeToMinutes("00:00")).toBe(0); // as a START it is still midnight
  });

  it("round-trips through minutesToTime", () => {
    expect(minutesToTime(795)).toBe("13:15");
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(1440)).toBe("24:00");
  });
});

describe("timeRangeProblem — the validation the table never had", () => {
  it("rejects an end at or before the start", () => {
    expect(timeRangeProblem("17:00", "09:00")).toMatch(/after start time/i);
    expect(timeRangeProblem("09:00", "09:00")).toMatch(/after start time/i);
  });

  it("accepts a normal range and a sub-hour range", () => {
    expect(timeRangeProblem("09:00", "17:00")).toBeNull();
    expect(timeRangeProblem("13:15", "13:45")).toBeNull();
    expect(timeRangeProblem("09:00", "09:30")).toBeNull();
  });

  it("accepts a block that runs to midnight", () => {
    expect(timeRangeProblem("13:00", "00:00")).toBeNull();
  });

  it("requires both halves", () => {
    expect(timeRangeProblem("", "17:00")).toBeTruthy();
    expect(timeRangeProblem("09:00", "")).toBeTruthy();
  });
});

// ─── Live API: the cross-tenant leak ───

async function api(path: string, token?: string, init?: RequestInit) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  return { status: res.status, body: await res.json() };
}

async function login(email: string, password = "changeme") {
  const res = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return res.body?.data?.accessToken as string | undefined;
}

describe("GET /api/deliverables/upcoming — cross-tenant scoping", () => {
  let apiUp = false;
  let adminToken: string | undefined;
  let clientToken: string | undefined;

  beforeAll(async () => {
    try {
      const health = await fetch(`${API}/api/health`);
      apiUp = health.ok;
    } catch {
      apiUp = false;
    }
    if (!apiUp) return;
    adminToken = await login("admin@advo.ph");
    clientToken = await login("client@advo.ph");
  });

  it("refuses an anonymous caller", async () => {
    if (!apiUp) return;
    const { status } = await api("/api/deliverables/upcoming");
    expect(status).toBe(401);
  });

  it("never returns a deliverable from a project the client cannot see", async () => {
    if (!apiUp || !adminToken || !clientToken) return;

    // The client's own visible set, from the route that was always scoped.
    const own = await api("/api/deliverables", clientToken);
    const ownIds = new Set<number>(
      (own.body.data?.deliverables ?? []).map((d: { deliverableId: number }) => d.deliverableId),
    );

    const upcoming = await api("/api/deliverables/upcoming", clientToken);
    expect(upcoming.status).toBe(200);

    for (const row of upcoming.body.data ?? []) {
      expect(ownIds.has(row.deliverableId)).toBe(true);
    }
  });

  it("never exposes project money or tech stack through the join", async () => {
    if (!apiUp || !adminToken) return;
    // Even for an admin, /upcoming is a deadline widget. It has no business shipping the
    // whole project row: totalValueCents, amountPaidCents and techStack all used to ride
    // along on a response that renders a title and a date.
    const { body } = await api("/api/deliverables/upcoming", adminToken);
    for (const row of body.data ?? []) {
      if (!row.project) continue;
      expect(row.project).not.toHaveProperty("totalValueCents");
      expect(row.project).not.toHaveProperty("amountPaidCents");
      expect(row.project).not.toHaveProperty("techStack");
      expect(Object.keys(row.project).sort()).toEqual(["projectId", "title"]);
    }
  });

  it("clamps a hostile limit instead of trusting it", async () => {
    if (!apiUp || !adminToken) return;
    const { status, body } = await api("/api/deliverables/upcoming?limit=99999", adminToken);
    expect(status).toBe(200);
    expect((body.data ?? []).length).toBeLessThanOrEqual(50);

    const negative = await api("/api/deliverables/upcoming?limit=-5", adminToken);
    expect(negative.status).toBe(200);
    expect(Array.isArray(negative.body.data)).toBe(true);
  });
});

describe("availability validation is enforced server-side", () => {
  let apiUp = false;
  let adminToken: string | undefined;

  beforeAll(async () => {
    try {
      apiUp = (await fetch(`${API}/api/health`)).ok;
    } catch {
      apiUp = false;
    }
    if (apiUp) adminToken = await login("admin@advo.ph");
  });

  it("rejects an inverted block with a message a person can read", async () => {
    if (!apiUp || !adminToken) return;
    const { status, body } = await api("/api/availability", adminToken, {
      method: "POST",
      body: JSON.stringify({
        teamMemberId: 100,
        dayOfWeek: 2,
        startTime: "17:00",
        endTime: "09:00",
        blockType: "work",
      }),
    });
    expect(status).toBe(400);
    // Must be a string on `error`, not a ZodError object — the web client reads
    // error.message and would otherwise show the user "HTTP 400".
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/after start time/i);
  });

  it("rejects an effective window that closes before it opens", async () => {
    if (!apiUp || !adminToken) return;
    const { status, body } = await api("/api/availability", adminToken, {
      method: "POST",
      body: JSON.stringify({
        teamMemberId: 100,
        dayOfWeek: 2,
        startTime: "09:00",
        endTime: "10:00",
        blockType: "work",
        effectiveFrom: "2026-12-01",
        effectiveTo: "2026-01-01",
      }),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/on or after/i);
  });
});
