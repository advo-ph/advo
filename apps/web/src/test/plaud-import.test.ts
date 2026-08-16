import { describe, expect, it } from "vitest";
import {
  extractNote,
  extractTranscript,
  fileHasTag,
  formatTranscript,
  parseFileId,
  parseShareKey,
  payloadFromDetail,
} from "../../../api/src/services/plaud.service";
import { importSecretOk } from "../../../api/src/utils/import-secret";
import { plaudShareUrl } from "../lib/plaud";

describe("parseShareKey", () => {
  it("reads /s/ keys and bare pub_ keys", () => {
    expect(parseShareKey("https://web.plaud.ai/s/pub_abc::tok")).toBe("pub_abc::tok");
    expect(parseShareKey("pub_abc::tok")).toBe("pub_abc::tok");
    expect(parseShareKey("not-a-key")).toBeNull();
  });
});

describe("parseFileId", () => {
  it("accepts hex Plaud file ids only", () => {
    expect(parseFileId("b77dac5b1e012ddd33bf9c091f3127f9")).toBe(
      "b77dac5b1e012ddd33bf9c091f3127f9",
    );
    expect(parseFileId("pub_abc::tok")).toBeNull();
  });
});

describe("extract + format", () => {
  const detail = {
    file_id: "abc",
    file_name: "07-30 Meeting: Advo",
    start_time: 1_753_876_197_000,
    source_list: [
      {
        data_type: "transaction",
        data_content: JSON.stringify([
          { start_time: 0, speaker: "Gelo", content: "Hello from ADVO." },
        ]),
      },
    ],
    note_list: [
      {
        data_type: "auto_sum_note",
        data_content: "## Summary\n- Import meetings from Plaud.",
      },
    ],
  };

  it("strips the decorative Plaud poster from the note", () => {
    const withPoster = {
      note_list: [
        {
          data_type: "auto_sum_note",
          data_content: "![PLAUD NOTE](https://example.com/card.png)\n\n## Summary\n- Keep this.",
        },
      ],
    };
    expect(extractNote(withPoster)).toBe("## Summary\n- Keep this.");
  });

  it("pulls transcript segments and the AI note", () => {
    expect(extractTranscript(detail)[0]).toMatchObject({
      speaker: "Gelo",
      text: "Hello from ADVO.",
    });
    expect(extractNote(detail)).toContain("Import meetings from Plaud");
    expect(formatTranscript(extractTranscript(detail))).toContain("`0:00` Gelo — Hello from ADVO.");
  });

  it("builds an import payload", () => {
    const payload = payloadFromDetail(detail, "pub_abc::tok");
    expect(payload.title).toBe("07-30 Meeting: Advo");
    expect(payload.fileId).toBe("abc");
    expect(payload.summary).toContain("Import meetings");
    expect(payload.transcript).toContain("Gelo");
  });
});

describe("fileHasTag", () => {
  const tagId = "167d74e99a5f05affcd1e7ad8928edc4";
  it("matches HAR filetag_id_list", () => {
    expect(fileHasTag({ filetag_id_list: [tagId] }, tagId)).toBe(true);
    expect(fileHasTag({ filetag_id_list: ["other"] }, tagId)).toBe(false);
  });
});

describe("importSecretOk", () => {
  const secret = "advo-praud-secret";
  it("accepts a matching Bearer token", () => {
    expect(importSecretOk(`Bearer ${secret}`, secret)).toBe(true);
  });
  it("rejects missing, short, or wrong secrets", () => {
    expect(importSecretOk(undefined, secret)).toBe(false);
    expect(importSecretOk("Bearer nope", secret)).toBe(false);
    expect(importSecretOk(`Bearer ${secret}`, "")).toBe(false);
  });
});

describe("plaudShareUrl", () => {
  it("keeps full URLs and wraps pub_ keys", () => {
    expect(plaudShareUrl("https://web.plaud.ai/s/pub_x::y")).toBe(
      "https://web.plaud.ai/s/pub_x::y",
    );
    expect(plaudShareUrl("pub_x::y")).toBe("https://web.plaud.ai/s/pub_x::y");
  });
});
