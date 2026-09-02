/**
 * External connectors — Figma, Drive, Calendar.
 *
 * No live API, no network. Every behavioural test drives the PURE exports: the three URL
 * parsers, the service-account credential parser, and the calendar event normalizer.
 * Those are where every bug in a read-through integration actually lives — the fetch is
 * the easy part.
 *
 * Two of these tests exist because of bugs that already shipped in this repo or would
 * have:
 *
 *   * The VITE_ prefix check. Audit item S4 was VITE_GITHUB_TOKEN and
 *     VITE_CLOUDFLARE_TOKEN compiled into the browser bundle, readable in devtools, in
 *     production. A Figma PAT or a Google service-account key is a strictly worse version
 *     of that, so the absence of the prefix is asserted rather than assumed.
 *
 *   * The all-day calendar event. Google reports an all-day block as `{ date }` and a
 *     timed one as `{ dateTime }`. Reading a date as a dateTime places it at midnight
 *     UTC, which is 8am in Manila — so a member's WHOLE DAY of unavailability silently
 *     becomes a morning meeting, on the exact feature built to stop that.
 */
import { describe, it, expect } from "vitest";
import { readCode, readSource } from "./read-source.js";

import {
  CONNECTOR_NAME,
  normalizeCalendarEvent,
  parseDriveFolderId,
  parseFigmaFileKey,
  parseGoogleCredential,
} from "../../../api/src/services/connector.service.js";


// ─── Figma URL parsing ───────────────────────────────

describe("parseFigmaFileKey", () => {
  it("reads all three URL shapes Figma has used", () => {
    // /file/ is the old one and is still all over old links; a parser that knows only
    // /design/ returns null for a URL someone pasted two years ago.
    expect(parseFigmaFileKey("https://www.figma.com/file/abc123XYZ/Felici-Gelato")).toBe("abc123XYZ");
    expect(parseFigmaFileKey("https://www.figma.com/design/abc123XYZ/Felici-Gelato")).toBe("abc123XYZ");
    expect(parseFigmaFileKey("https://www.figma.com/proto/abc123XYZ/Felici")).toBe("abc123XYZ");
  });

  it("survives the query tail a browser bar always carries", () => {
    expect(
      parseFigmaFileKey("https://www.figma.com/design/abc123XYZ/Felici?node-id=1-2&t=xyz"),
    ).toBe("abc123XYZ");
  });

  it("works without the www subdomain", () => {
    expect(parseFigmaFileKey("https://figma.com/file/abc123XYZ/x")).toBe("abc123XYZ");
  });

  it("returns null for a non-Figma URL rather than guessing", () => {
    expect(parseFigmaFileKey("https://example.com/file/abc123")).toBeNull();
    expect(parseFigmaFileKey("")).toBeNull();
    expect(parseFigmaFileKey("not a url")).toBeNull();
  });
});

// ─── Drive URL parsing ───────────────────────────────

describe("parseDriveFolderId", () => {
  it("reads a folder URL, including the account-scoped form", () => {
    expect(parseDriveFolderId("https://drive.google.com/drive/folders/1AbC_dEf-123")).toBe("1AbC_dEf-123");
    expect(parseDriveFolderId("https://drive.google.com/drive/u/0/folders/1AbC_dEf-123")).toBe("1AbC_dEf-123");
  });

  it("survives the ?usp=sharing tail that is on every shared link", () => {
    expect(
      parseDriveFolderId("https://drive.google.com/drive/folders/1AbC_dEf-123?usp=sharing"),
    ).toBe("1AbC_dEf-123");
  });

  it("reads the legacy open?id= form", () => {
    expect(parseDriveFolderId("https://drive.google.com/open?id=1AbC_dEf-123")).toBe("1AbC_dEf-123");
  });

  it("accepts a bare id, which is what a technical user will paste", () => {
    expect(parseDriveFolderId("1AbC_dEf-1234567890")).toBe("1AbC_dEf-1234567890");
    expect(parseDriveFolderId("  1AbC_dEf-1234567890  ")).toBe("1AbC_dEf-1234567890");
  });

  it("rejects something too short to be an id rather than fetching nonsense", () => {
    expect(parseDriveFolderId("abc")).toBeNull();
    expect(parseDriveFolderId("")).toBeNull();
  });
});

// ─── Google credential parsing ───────────────────────

describe("parseGoogleCredential", () => {
  const KEY_BODY = "-----BEGIN PRIVATE KEY-----\\nMIIabc\\nMIIdef\\n-----END PRIVATE KEY-----\\n";

  it("un-escapes the newlines every env-var transport introduces", () => {
    // A service-account private key is multi-line. .env files, PM2 ecosystem configs and
    // CI secret stores all escape the newlines, and without this the JSON parses fine and
    // then the signature fails with an error that says nothing useful.
    const parsed = parseGoogleCredential(
      JSON.stringify({ client_email: "svc@advo.iam.gserviceaccount.com", private_key: KEY_BODY }),
    );
    expect(parsed?.clientEmail).toBe("svc@advo.iam.gserviceaccount.com");
    expect(parsed?.privateKey).toContain("\n");
    expect(parsed?.privateKey).not.toContain("\\n");
    expect(parsed?.privateKey.split("\n").length).toBeGreaterThan(3);
  });

  it("leaves a key that already has real newlines alone", () => {
    const real = "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----\n";
    const parsed = parseGoogleCredential(
      JSON.stringify({ client_email: "a@b.com", private_key: real }),
    );
    expect(parsed?.privateKey).toBe(real);
  });

  it("returns null — never throws — on anything malformed", () => {
    // A bad key must degrade the connector to "not configured", not crash whichever
    // request happened to touch it.
    expect(parseGoogleCredential(undefined)).toBeNull();
    expect(parseGoogleCredential("")).toBeNull();
    expect(parseGoogleCredential("not json")).toBeNull();
    expect(parseGoogleCredential("{}")).toBeNull();
    expect(parseGoogleCredential(JSON.stringify({ client_email: "a@b.com" }))).toBeNull();
    expect(parseGoogleCredential(JSON.stringify({ private_key: "x" }))).toBeNull();
  });
});

// ─── Calendar normalization ──────────────────────────

describe("normalizeCalendarEvent", () => {
  it("distinguishes an ALL-DAY event from a timed one", () => {
    // Reading a `date` as a `dateTime` puts an all-day block at midnight UTC = 8am
    // Manila, turning a whole day of unavailability into a morning meeting.
    const allDay = normalizeCalendarEvent({
      id: "e1",
      summary: "Finals week",
      start: { date: "2026-09-02" },
      end: { date: "2026-09-07" },
    });
    expect(allDay?.isAllDay).toBe(true);
    expect(allDay?.startAt).toBe("2026-09-02");

    const timed = normalizeCalendarEvent({
      id: "e2",
      summary: "Client call",
      start: { dateTime: "2026-09-02T09:00:00+08:00" },
      end: { dateTime: "2026-09-02T10:00:00+08:00" },
    });
    expect(timed?.isAllDay).toBe(false);
    expect(timed?.startAt).toBe("2026-09-02T09:00:00+08:00");
  });

  it("names an untitled event rather than rendering an empty row", () => {
    const parsed = normalizeCalendarEvent({ id: "e3", start: { date: "2026-09-02" } });
    expect(parsed?.summary).toBe("(no title)");
  });

  it("returns null without an id, and does not throw on junk", () => {
    expect(normalizeCalendarEvent({ summary: "orphan" })).toBeNull();
    expect(normalizeCalendarEvent(null)).toBeNull();
    expect(normalizeCalendarEvent("nope")).toBeNull();
    expect(normalizeCalendarEvent(undefined)).toBeNull();
  });

  it("tolerates a missing end", () => {
    const parsed = normalizeCalendarEvent({ id: "e4", start: { date: "2026-09-02" } });
    expect(parsed?.endAt).toBeNull();
  });
});

// ─── Source-level invariants ─────────────────────────

describe("connector invariants, read from the source", () => {
  const service = readSource("apps/api/src/services/connector.service.ts");
  const route = readSource("apps/api/src/routes/connector.routes.ts");
  const envSource = readSource("apps/api/src/utils/env.ts");

  it("registers exactly the three connectors", () => {
    expect([...CONNECTOR_NAME]).toEqual(["figma", "drive", "calendar"]);
  });

  it("NO connector token is exposed to the browser bundle", () => {
    // Audit item S4: VITE_GITHUB_TOKEN and VITE_CLOUDFLARE_TOKEN were compiled into the
    // bundle and readable in devtools, in production. A Figma PAT or a Google
    // service-account key is a strictly worse version of the same bug.
    expect(readCode("apps/api/src/utils/env.ts")).not.toMatch(/VITE_FIGMA|VITE_GOOGLE/);
    expect(readCode("apps/api/src/services/connector.service.ts")).not.toMatch(/VITE_/);
    expect(envSource).toContain("SERVER-SIDE ONLY");
  });

  it("is read-through — it writes to no local table and to no remote", () => {
    const code = readCode("apps/api/src/services/connector.service.ts");
    // It never reaches the database at all: no db() handle, so there is nothing to
    // insert into. Asserting on the handle rather than on `.insert(`/`.update(` — the
    // latter also matches `signer.update()`, which is a crypto call and entirely fine.
    expect(code).not.toMatch(/\bdb\(\)/);
    expect(code).not.toMatch(/from "\.\.\/db\//);
    // The prose must still SAY so — an absence with no stated reason gets "fixed" later.
    expect(service).toContain("READ-THROUGH ONLY");
    // Every outbound call is a GET or the token exchange; nothing mutates a remote.
    expect(code).not.toMatch(/method: "PUT"|method: "PATCH"|method: "DELETE"/);
    // The one POST is the Google token exchange, and nothing else.
    expect(code.match(/method: "POST"/g) ?? []).toHaveLength(1);
  });

  it("degrades to an EMPTY LIST with a reason, never a throw or sample data", () => {
    expect(service).toContain("item: []");
    expect(service).toContain("isConfigured: false");
    expect(readCode("apps/api/src/services/connector.service.ts")).not.toMatch(
      /sampleData|mockFrame|placeholderFile/,
    );
  });

  it("item is always an array so a UI never has to distinguish null from empty", () => {
    expect(service).toContain("`item` is ALWAYS an array");
  });

  it("names the share-with-service-account mistake explicitly on a 404", () => {
    // The single most common setup failure, and a bare "404" sends someone to check the
    // wrong thing.
    expect(service).toContain("not shared with the service account");
  });

  it("expands recurring calendar events into instances", () => {
    // Without singleEvents a weekly class arrives as ONE event with a recurrence rule,
    // and the blackout calendar shows a single block instead of a term of them.
    expect(service).toContain('singleEvents: "true"');
  });

  it("batches Figma renders into one call rather than one per frame", () => {
    expect(service).toContain("One batched render call, not one per frame");
  });

  it("records that Figma render URLs expire, and stores none of them", () => {
    expect(service).toContain("FIGMA_RENDER_URL_IS_EPHEMERAL");
    expect(service).toContain("expire");
  });

  it("reports a Google-native doc's size as null, not zero", () => {
    // Zero renders as an empty file in any UI that shows sizes.
    expect(service).toContain("one.size ? Number(one.size) : null");
  });

  it("refuses an inverted calendar window instead of returning an empty list", () => {
    // Google answers an inverted window with [], which reads as "this person has nothing
    // scheduled" — the most dangerous possible wrong answer here.
    expect(route).toContain("fromAt must be before toAt");
  });

  it("is team-only", () => {
    expect(route).toContain('connectorRoutes.use("*", requireAuth, requireTeam)');
  });

  it("declares its credentials unverified rather than implying they were tested", () => {
    expect(service).toContain("Credential status");
    expect(service).toContain("has NOT been exercised against a live account");
  });
});
