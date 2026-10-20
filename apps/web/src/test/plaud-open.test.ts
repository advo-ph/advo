import { describe, expect, it } from "vitest";
import {
  fileFromOpenRow,
  hexFileId,
  jwtExpiryMillisecond,
  openTimeToIso,
  openTokenFilePaths,
} from "../../../api/src/services/plaud-open.service";
import {
  keywordFor,
  looksLikeClientMeeting,
  routeRecording,
  type RouteCandidate,
} from "../../../api/src/services/meeting-route.service";
import { payloadFromDetail } from "../../../api/src/services/plaud.service";

// The prod project list on 2026-10-18 (Inbox excluded, as routeCandidate does).
const PROJECT: [number, string, string][] = [
  [2, "VBE Eye Center Website", "VBE Eye Center"],
  [3, "FourlinQ", "FourLinq"],
  [6, "Felici Artisan Gelato", "Capunfuerza Family"],
  [7, "TMC Registry", "The Medical City"],
  [8, "Camps PH", "Capunfuerza Family"],
  [9, "Coffee Rush Eastridge", "Capunfuerza Family"],
  [16, "Nokohi", "Capunfuerza Family"],
  [17, "Flowers and Chocolates", "Capunfuerza Family"],
  [18, "Felici Cafe", "Capunfuerza Family"],
  [22, "ADVO Flood (venture)", "ADVO Inbox"],
  [23, "AdvoPark (venture)", "ADVO Inbox"],
  [24, "ADVO School (venture, paused)", "ADVO Inbox"],
  [25, "FunRide PH", "Myriad Entertainment Corporation"],
  [26, "PCEDM App", "PCEDM"],
  [27, "PCP App", "Philippine College of Physicians"],
];
const candidate: RouteCandidate[] = PROJECT.map(([projectId, title, company]) => ({
  projectId,
  title,
  ...keywordFor(title, company),
}));

describe("routeRecording", () => {
  it("routes a titled client meeting to its project", () => {
    const r = routeRecording({ title: "08-09 Meeting: Myriad Fun Ride — QR Check-in Dry Run" }, candidate);
    expect(r.projectId).toBe(25);
    expect(r.isAdvo).toBe(true);
  });

  it("reads the summary when the title is generic", () => {
    const r = routeRecording(
      {
        title: "2026-10-18 16:16:32",
        summary: "## Nokohi menu\nThe Nokohi owner wants online ordering. Nokohi opens in November.",
      },
      candidate,
    );
    expect(r.projectId).toBe(16);
  });

  it("knows the spoken aliases", () => {
    expect(routeRecording({ title: "08-11 Meeting: Power Mac Center Spotlight 2" }, candidate).projectId).toBe(3);
    expect(routeRecording({ title: "Flood sensor call with WATEC" }, candidate).projectId).toBe(22);
  });

  it("skips recordings that name neither ADVO nor a project", () => {
    for (const title of [
      "10-16 Lecture: Phenomenology and Metaphysics — Gabriel Marcel",
      "10-15 Meeting: Fillforms Rebranding, AI Cost/Privacy Optimization",
      "10-15 Casual Conversation: Birthday Message and Future Plans",
    ]) {
      const r = routeRecording({ title, summary: "Nothing about the company here." }, candidate);
      expect(r.isAdvo).toBe(false);
      expect(r.projectId).toBeNull();
    }
  });

  it("sends an ADVO meeting with no clear project to Inbox, not a guess", () => {
    const r = routeRecording({ title: "08-16 Weekly Meeting: Advo Website Restructuring" }, candidate);
    expect(r.isAdvo).toBe(true);
    expect(r.projectId).toBeNull();
  });

  it("ignores ordinary words unless the recording names ADVO", () => {
    const lecture = routeRecording(
      {
        title: "08-29 Lecture: Philippine Land Use and the Ridge-to-Reef Approach",
        summary: "Flood control in the city. Flood plains, school curricula, parking lots, coffee farms.",
      },
      candidate,
    );
    expect(lecture.isAdvo).toBe(false);
    const advo = routeRecording(
      { title: "10-04 Meeting: Flood Platform", summary: "ADVO's flood pilot with San Juan. Flood sensors." },
      candidate,
    );
    expect(advo.projectId).toBe(22);
  });

  it("skips a lecture that only uses ADVO as an example", () => {
    const summary = "Industry boundaries. Examples: *Saint Elizabeth Hospital*: healthcare. *ADVO*: tech/software.";
    for (const title of [
      "10-20 Lecture: Strategic Industry Boundaries and Market Scope using Porter's Framework",
      "10-19 Lektura: Mga Paraan ng Pagpawi ng Obligasyon",
    ]) {
      expect(routeRecording({ title, summary }, candidate).isAdvo).toBe(false);
    }
    expect(routeRecording({ title: "10-21 Lecture: ADVO Flood demo for the class", summary }, candidate).projectId).toBe(22);
  });

  it("flags a client meeting that names no project, so the chat can ask", () => {
    // The 10-20 ECEAS pricing talk: Plaud heard the client's name as "exce".
    const eceas = {
      title: "10-20 Pulong: Istruktura ng Pagpepresyo sa Web Development at Paghahanda sa Kontrata",
      summary:
        "Pagpepresyo para sa web development at taunang subscription. Standardized quotation template. " +
        "Naka-set ang meeting sa anak ng kliyente. Mag-engage ng abogado para sa kontrata.",
    };
    expect(routeRecording(eceas, candidate).isAdvo).toBe(false);
    expect(looksLikeClientMeeting(eceas)).toBe(true);
  });

  it("does not flag classes or meetings with no client words", () => {
    const summary = "The client pays the contract price; quotation, subscription and budget examples.";
    expect(looksLikeClientMeeting({ title: "10-19 Lektura: Batas sa Kontrata", summary })).toBe(false);
    expect(looksLikeClientMeeting({ title: "10-20 Lecture: LAW 111 – Contract Law", summary })).toBe(false);
    expect(looksLikeClientMeeting({ title: "10-19 Meeting: LAS 50 – Bazaar Booth Planning", summary })).toBe(false);
    expect(
      looksLikeClientMeeting({ title: "10-19 Weekly Meeting: Event Sponsorships", summary: "Venue, speakers, budget and website." }),
    ).toBe(false);
  });

  it("routes a clinic-billing meeting to VBE without the name", () => {
    expect(
      routeRecording({ title: "10-18 Meeting: Clinic Billing Module, PhilHealth SOA Automation, Digital Waivers" }, candidate)
        .projectId,
    ).toBe(2);
  });

  it("routes PCP meetings to the PCP App", () => {
    expect(routeRecording({ title: "10-14 Pulong: Presyo ng PCP App at Pagpapahusay ng mga Tampok" }, candidate).projectId).toBe(27);
  });

  it("knows Plaud's misspellings", () => {
    expect(routeRecording({ title: "09-04 Strategy Note: Advol Parks — Web ML Plate Recognition POC" }, candidate).projectId).toBe(23);
    expect(routeRecording({ title: "10-03 Meeting: Felichi Ordering App" }, candidate).isAdvo).toBe(true);
  });

  it("leaves a tie between two Felici sites unrouted", () => {
    const r = routeRecording({ title: "Felici call" }, candidate);
    expect(r.projectId).toBeNull();
    expect(r.isAdvo).toBe(true);
  });
});

describe("Open API mapping", () => {
  it("strips of_ to the consumer hex id", () => {
    expect(hexFileId("of_C5AD0A3948E093D25E3C4DE068118DE7")).toBe("c5ad0a3948e093d25e3c4de068118de7");
  });

  it("reads zone-less Open API times as UTC", () => {
    expect(openTimeToIso("2026-10-15T09:27:41")).toBe("2026-10-15T09:27:41.000Z");
    expect(openTimeToIso("2026-10-15T09:27:41Z")).toBe("2026-10-15T09:27:41.000Z");
    expect(openTimeToIso(undefined)).toBeNull();
  });

  it("maps a list row", () => {
    expect(
      fileFromOpenRow({ id: "of_abc123", name: " 10-15 Meeting ", start_at: "2026-10-15T09:27:41", duration: 1000 }),
    ).toEqual({
      fileId: "abc123",
      name: "10-15 Meeting",
      startAt: "2026-10-15T09:27:41.000Z",
      durationMillisecond: 1000,
      tagId: [],
    });
  });

  it("feeds payloadFromDetail the same shape the consumer API does", () => {
    const payload = payloadFromDetail(
      {
        file_id: "abc123",
        file_name: "10-15 Meeting: Nokohi",
        start_time: Date.parse("2026-10-15T09:27:41Z"),
        source_list: [
          {
            data_type: "transaction",
            data_content: JSON.stringify([{ start_time: 1610, speaker: "Speaker 1", content: "Okay." }]),
          },
        ],
        note_list: [{ data_type: "auto_sum_note", data_content: "## 1. Menu" }],
      },
      null,
    );
    expect(payload.fileId).toBe("abc123");
    expect(payload.recordedAt.toISOString()).toBe("2026-10-15T09:27:41.000Z");
    expect(payload.transcript).toContain("Speaker 1 — Okay.");
    expect(payload.summary).toBe("## 1. Menu");
  });

  it("polls every grant listed in PLAUD_OPEN_TOKEN_FILE", () => {
    const before = process.env.PLAUD_OPEN_TOKEN_FILE;
    process.env.PLAUD_OPEN_TOKEN_FILE = "/opt/a.json, /opt/prince.json,";
    expect(openTokenFilePaths()).toEqual(["/opt/a.json", "/opt/prince.json"]);
    if (before === undefined) delete process.env.PLAUD_OPEN_TOKEN_FILE;
    else process.env.PLAUD_OPEN_TOKEN_FILE = before;
  });

  it("reads a JWT expiry", () => {
    const body = Buffer.from(JSON.stringify({ exp: 1_792_398_066 })).toString("base64url");
    expect(jwtExpiryMillisecond(`x.${body}.y`)).toBe(1_792_398_066_000);
    expect(jwtExpiryMillisecond("not-a-jwt")).toBeNull();
  });
});
