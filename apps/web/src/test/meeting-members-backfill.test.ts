/**
 * @vitest-environment node
 *
 * Meetings page cleanup (2026-10-18):
 *   - who joined a meeting: PUT /api/meeting/:id/members (meeting_member, 058), read back
 *     on GET /api/meeting as `attendees`;
 *   - the transcript backfill: POST /api/meeting/backfill-transcripts links Plaud corpus
 *     sources to their meeting, creates the missing ones, fills empty transcripts.
 *
 * planBackfill is pure and always runs. The live block needs a running API and, because
 * the backfill writes across the whole database, it runs ONLY against a local API, never
 * against a VITE_API_URL that points somewhere else.
 */
import { describe as describeAlways, it, expect, beforeAll, afterAll } from "vitest";
import { planBackfill, plaudKeysOf, manilaDay } from "../../../api/src/services/meeting-backfill.service";
import { API, skipWhenApiDown } from "./live-api.js";

// ─── Pure planning ───────────────────────────────────

const meetingRow = (over: Partial<Parameters<typeof planBackfill>[0][number]> = {}) => ({
  meetingId: 1,
  title: "07-10 Meeting: Fourlinq",
  recordedAt: new Date("2026-07-10T09:06:47Z"),
  transcript: "",
  summary: null,
  plaudFileId: null,
  plaudShareKey: null,
  parentMeetingId: null,
  ...over,
});

const sourceRow = (over: Partial<Parameters<typeof planBackfill>[1][number]> = {}) => ({
  corpusSourceId: 100,
  externalId: "pub_abc",
  url: "https://web.plaud.ai/s/pub_abc::tok",
  title: "07-10 Meeting: Fourlinq",
  occurredAt: new Date("2026-07-10T09:06:47Z"),
  ingestedAt: new Date("2026-09-01T00:00:00Z"),
  summary: "Summary from the corpus",
  body: "`0:00` Speaker 1 — hello",
  projectId: 3,
  ingestedBy: 3,
  meta: {},
  ...over,
});

describeAlways("plaudKeysOf", () => {
  it("reads a share key from the url and a file id from the externalId or url", () => {
    expect(plaudKeysOf({ externalId: "pub_abc", url: "https://web.plaud.ai/s/pub_abc::tok" })).toEqual({
      fileId: null,
      shareKey: "pub_abc::tok",
      sharePrefix: "pub_abc",
    });
    const hex = "b77dac5b1e012ddd33bf9c091f3127f9";
    expect(plaudKeysOf({ externalId: hex, url: `https://web.plaud.ai/file/${hex}` }).fileId).toBe(hex);
    expect(plaudKeysOf({ externalId: `of_${hex.toUpperCase()}`, url: null }).fileId).toBe(hex);
  });
});

describeAlways("manilaDay", () => {
  it("uses the Manila calendar day, not UTC", () => {
    expect(manilaDay(new Date("2026-07-10T17:30:00Z"))).toBe("2026-07-11");
    expect(manilaDay(null)).toBeNull();
  });
});

describeAlways("planBackfill", () => {
  it("links a source to its meeting by share key and fills only the empty transcript", () => {
    const plan = planBackfill(
      [meetingRow({ plaudShareKey: "pub_abc::other", summary: "keep me" })],
      [sourceRow()],
      [],
    );
    expect(plan.link).toEqual([{ corpusSourceId: 100, meetingId: 1 }]);
    expect(plan.fill).toEqual([{ meetingId: 1, transcript: "`0:00` Speaker 1 — hello", from: "corpus" }]);
    expect(plan.create).toEqual([]);
  });

  it("links by Plaud file id and never overwrites a transcript that has text", () => {
    const hex = "a9156c74b38054eddb7c81a8242bf357";
    const plan = planBackfill(
      [meetingRow({ plaudFileId: hex, transcript: "already here", summary: "s" })],
      [sourceRow({ externalId: hex, url: `https://web.plaud.ai/file/${hex}` })],
      [],
    );
    expect(plan.link).toHaveLength(1);
    expect(plan.fill).toEqual([]);
  });

  it("falls back to one meeting with the same title on the same Manila day", () => {
    const plan = planBackfill(
      [meetingRow({ meetingId: 7, title: "  07-10 meeting:   FOURLINQ " })],
      [sourceRow({ externalId: "text-1", url: null })],
      [],
    );
    expect(plan.link).toEqual([{ corpusSourceId: 100, meetingId: 7 }]);
  });

  it("creates a meeting for a source with no meeting, keeping its project and Plaud ids", () => {
    const hex = "c956221f1d8939408212e2c18613a924";
    const plan = planBackfill([], [sourceRow({ externalId: hex, url: `https://web.plaud.ai/file/${hex}` })], []);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({
      corpusSourceId: 100,
      projectId: 3,
      transcript: "`0:00` Speaker 1 — hello",
      summary: "Summary from the corpus",
      plaudFileId: hex,
    });
  });

  it("is idempotent: a linked source with a filled meeting plans nothing", () => {
    const plan = planBackfill(
      [meetingRow({ transcript: "text", summary: "s" })],
      [sourceRow({ meta: { meetingId: 1 } })],
      [],
    );
    expect(plan).toEqual({ link: [], fill: [], create: [], skip: [] });
  });

  it("never resurrects a meeting that was deleted on purpose", () => {
    const plan = planBackfill([], [sourceRow({ meta: { meetingId: 42 } })], []);
    expect(plan.create).toEqual([]);
    expect(plan.skip).toEqual([{ corpusSourceId: 100, reason: "meeting 42 was deleted" }]);
  });

  it("skips a source with no text, and does not create twice for two copies of one recording", () => {
    const empty = planBackfill([], [sourceRow({ body: null, summary: null })], []);
    expect(empty.skip[0].reason).toBe("no transcript or summary");

    const twin = planBackfill(
      [],
      [sourceRow(), sourceRow({ corpusSourceId: 101, externalId: "pub_abc-copy", url: "https://web.plaud.ai/s/pub_abc::tok" })],
      [],
    );
    expect(twin.create).toHaveLength(1);
    expect(twin.skip[0].corpusSourceId).toBe(101);
  });

  it("ignores side-project excerpt copies when matching by title", () => {
    const plan = planBackfill(
      [meetingRow({ meetingId: 9, parentMeetingId: 1 })],
      [sourceRow({ externalId: "text-2", url: null })],
      [],
    );
    expect(plan.link).toEqual([]);
    expect(plan.create).toHaveLength(1);
  });

  it("fills a pending upload transcript from its Whisper recordings, oldest first", () => {
    const plan = planBackfill(
      [meetingRow({ meetingId: 5, transcript: "(transcript pending)" })],
      [],
      [
        { meetingId: 5, transcript: "second", createdAt: new Date("2026-10-02") },
        { meetingId: 5, transcript: "first", createdAt: new Date("2026-10-01") },
      ],
    );
    expect(plan.fill).toEqual([{ meetingId: 5, transcript: "first\n\nsecond", from: "recording" }]);
  });
});

// ─── Live API (local only) ───────────────────────────

const isLocalApi = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API);
const describe = describeAlways.skipIf(skipWhenApiDown || !isLocalApi);

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function login(username: string) {
  const r = await call(null, "POST", "/api/auth/login", { username, password: "changeme" });
  return r.json?.data?.accessToken as string;
}

type Attendee = { userId: number | null; teamMemberId: number | null; name: string };

describe("Meeting members (live)", () => {
  let admin: string;
  let meetingId: number;
  let withLogin: number; // a team member who has a user account
  let withoutLogin: number; // a team member who does not

  beforeAll(async () => {
    admin = await login("admin");
    const team = await call(admin, "GET", "/api/team");
    const rows = team.json.data as Array<{ teamMemberId: number; userId: number | null; isActive: boolean }>;
    withLogin = rows.find((r) => r.userId != null && r.isActive)!.teamMemberId;
    withoutLogin = (rows.find((r) => r.userId == null) ?? rows.find((r) => r.teamMemberId !== withLogin))!.teamMemberId;
    const created = await call(admin, "POST", "/api/meeting", {
      title: `vitest members ${Date.now()}`,
      recordedAt: new Date().toISOString(),
    });
    expect(created.status).toBe(201);
    meetingId = created.json.data.meetingId;
  });

  afterAll(async () => {
    if (meetingId) await call(admin, "DELETE", `/api/meeting/${meetingId}`);
  });

  const attendeesOf = async (): Promise<Attendee[]> => {
    const list = await call(admin, "GET", "/api/meeting");
    return list.json.data.find((m: { meetingId: number }) => m.meetingId === meetingId).attendees;
  };

  it("saves members, including one with no login, and loads them back", async () => {
    const put = await call(admin, "PUT", `/api/meeting/${meetingId}/members`, {
      teamMemberIds: [withLogin, withoutLogin],
    });
    expect(put.status).toBe(200);
    const ids = (await attendeesOf()).map((a) => a.teamMemberId).sort();
    expect(ids).toEqual([withLogin, withoutLogin].sort());
  });

  it("replaces the whole set, and an empty list clears it", async () => {
    await call(admin, "PUT", `/api/meeting/${meetingId}/members`, { teamMemberIds: [withoutLogin] });
    expect((await attendeesOf()).map((a) => a.teamMemberId)).toEqual([withoutLogin]);
    await call(admin, "PUT", `/api/meeting/${meetingId}/members`, { teamMemberIds: [] });
    expect(await attendeesOf()).toEqual([]);
  });

  it("rejects an unknown member, a missing meeting, and a client", async () => {
    expect((await call(admin, "PUT", `/api/meeting/${meetingId}/members`, { teamMemberIds: [99_999_999] })).status).toBe(400);
    expect((await call(admin, "PUT", `/api/meeting/99999999/members`, { teamMemberIds: [] })).status).toBe(404);
    const client = await login("client");
    expect((await call(client, "PUT", `/api/meeting/${meetingId}/members`, { teamMemberIds: [] })).status).toBe(403);
    expect((await call(null, "PUT", `/api/meeting/${meetingId}/members`, { teamMemberIds: [] })).status).toBe(401);
  });
});

describe("Transcript backfill (live, local only)", () => {
  let admin: string;
  const stamp = Date.now();
  const hex = (stamp.toString(16) + "0".repeat(32)).slice(0, 32);
  const createdMeeting: number[] = [];
  const createdSource: number[] = [];

  const ingest = async (externalId: string, title: string, body: string, url: string | null) => {
    const r = await call(admin, "POST", "/api/corpus/ingest/json", {
      source: { kind: "plaud", externalId, url, title, occurredAt: "2026-07-10T09:00:00Z", summary: "vitest summary", body },
    });
    expect(r.status).toBe(201);
    createdSource.push(r.json.data.corpusSourceId);
    return r.json.data.corpusSourceId as number;
  };

  beforeAll(async () => {
    admin = await login("admin");
  });

  afterAll(async () => {
    for (const id of createdSource) await call(admin, "DELETE", `/api/corpus/source/${id}`);
    for (const id of createdMeeting) await call(admin, "DELETE", `/api/meeting/${id}`);
  });

  it("is admin only, and dry run (the default) writes nothing", async () => {
    const client = await login("client");
    expect((await call(client, "POST", "/api/meeting/backfill-transcripts", {})).status).toBe(403);

    const orphan = await ingest(`pub_vitest_${stamp}`, `vitest orphan ${stamp}`, "orphan transcript text", `https://web.plaud.ai/s/pub_vitest_${stamp}::tok`);
    const dry = await call(admin, "POST", "/api/meeting/backfill-transcripts", {});
    expect(dry.status).toBe(200);
    expect(dry.json.data.dryRun).toBe(true);
    expect(dry.json.data.createdCount).toBeGreaterThanOrEqual(1);
    const source = await call(admin, "GET", `/api/corpus/source/${orphan}`);
    expect(source.json.data.meta.meetingId).toBeUndefined();
  });

  it("creates the missing meeting, links an existing one, fills its empty transcript, then is idempotent", async () => {
    const existing = await call(admin, "POST", "/api/meeting", {
      title: `vitest linked ${stamp}`,
      recordedAt: "2026-07-10T09:00:00Z",
      plaudFileId: hex,
    });
    expect(existing.status).toBe(201);
    const existingId = existing.json.data.meetingId as number;
    createdMeeting.push(existingId);
    const linkedSource = await ingest(hex, `vitest linked ${stamp}`, "linked transcript text", `https://web.plaud.ai/file/${hex}`);

    const run = await call(admin, "POST", "/api/meeting/backfill-transcripts", { dryRun: false });
    expect(run.status).toBe(200);
    expect(run.json.data.filledMeetingId).toContain(existingId);
    createdMeeting.push(...(run.json.data.createdMeetingId as number[]));

    const list = (await call(admin, "GET", "/api/meeting")).json.data as Array<{
      meetingId: number;
      title: string;
      transcript: string;
      summary: string | null;
    }>;
    const orphanMeeting = list.find((m) => m.title === `vitest orphan ${stamp}`);
    expect(orphanMeeting?.transcript).toBe("orphan transcript text");
    expect(list.find((m) => m.meetingId === existingId)?.transcript).toBe("linked transcript text");
    expect((await call(admin, "GET", `/api/corpus/source/${linkedSource}`)).json.data.meta.meetingId).toBe(existingId);

    const again = await call(admin, "POST", "/api/meeting/backfill-transcripts", { dryRun: false });
    expect(again.json.data.createdMeetingId).toEqual([]);
    expect(again.json.data.filledMeetingId).not.toContain(existingId);
    const after = (await call(admin, "GET", "/api/meeting")).json.data as Array<{ title: string }>;
    expect(after.filter((m) => m.title === `vitest orphan ${stamp}`)).toHaveLength(1);
  });
});
