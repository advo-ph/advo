/**
 * Bookkeeping export — the CSV a bookkeeper actually opens.
 *
 * No live API, no database. Every behavioural test drives the PURE exports of
 * bookkeeping.service.ts: the CSV primitives, the cents formatter, and the period
 * boundary. Those three are where every bug in an export lives.
 *
 * The escaping tests carry more weight than they look like they should. Expense purposes
 * are free text typed by humans; one unescaped comma shifts every subsequent column in
 * that row, and the result reads as a DATA problem rather than a formatting one — so
 * somebody goes looking in the wrong place. And a cell beginning `=` is executed as a
 * formula by Excel on open, which is a real injection route into the machine of the one
 * person outside the company who receives this file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMISSION_HEADER,
  EXPENSE_HEADER,
  EXPORT_SHEET,
  REVENUE_HEADER,
  SUMMARY_HEADER,
  centsToDecimal,
  csvCell,
  csvRow,
  periodBound,
  toCsv,
} from "../../../api/src/services/bookkeeping.service.js";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) => readFileSync(join(monorepoRoot, path), "utf-8");

// ─── CSV escaping ────────────────────────────────────

describe("csvCell", () => {
  it("passes ordinary text through untouched", () => {
    expect(csvCell("Felici Gelato")).toBe("Felici Gelato");
    expect(csvCell(42)).toBe("42");
  });

  it("quotes and doubles embedded quotes", () => {
    expect(csvCell('He said "urgent"')).toBe('"He said ""urgent"""');
  });

  it("quotes a cell containing a comma", () => {
    // One unescaped comma shifts every later column and reads as a data problem.
    expect(csvCell("Grab, Makati to BGC")).toBe('"Grab, Makati to BGC"');
  });

  it("quotes a cell containing a newline", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("NEUTERS formula injection on every leading character Excel executes", () => {
    // `=cmd|'/c calc'!A1` in an expense purpose runs on open in Excel.
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+44 900")).toBe("'+44 900");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tinjected")).toContain("'");
  });

  it("still quotes a neutered cell that also contains a comma", () => {
    expect(csvCell("=A1,B2")).toBe(`"'=A1,B2"`);
  });

  it("renders null and undefined as an EMPTY cell, never the text 'null'", () => {
    // A bookkeeper summing a column of "null" gets an error; one reading it gets a
    // wrong answer, which is worse.
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe("");
  });

  it("does not mangle a legitimate negative number in a NUMBER cell", () => {
    // The guard prefixes it, which is correct for safety — this pins the behaviour so a
    // future "fix" that removes the guard has to argue with a test rather than a comment.
    expect(csvCell(-500)).toBe("'-500");
  });
});

describe("csvRow / toCsv", () => {
  it("joins cells with commas", () => {
    expect(csvRow(["a", "b", 1])).toBe("a,b,1");
  });

  it("emits CRLF line endings, per RFC 4180 and per Excel on Windows", () => {
    const csv = toCsv(["a", "b"], [[1, 2]]);
    expect(csv).toBe("a,b\r\n1,2\r\n");
  });

  it("ends with a trailing newline so the last row is not truncated on append", () => {
    expect(toCsv(["a"], [[1]]).endsWith("\r\n")).toBe(true);
  });

  it("emits a header-only document when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
  });
});

// ─── Money formatting ────────────────────────────────

describe("centsToDecimal", () => {
  it("renders cents as a plain two-place decimal", () => {
    expect(centsToDecimal(300_000)).toBe("3000.00");
    expect(centsToDecimal(1_200_000)).toBe("12000.00");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(50)).toBe("0.50");
    expect(centsToDecimal(0)).toBe("0.00");
  });

  it("handles negatives without losing the sign or the padding", () => {
    expect(centsToDecimal(-5)).toBe("-0.05");
    expect(centsToDecimal(-300_000)).toBe("-3000.00");
  });

  it("emits NO thousands separator and NO currency symbol", () => {
    // A separator makes the cell text in Excel; a symbol makes it text in every
    // accounting import that exists.
    const rendered = centsToDecimal(123_456_789);
    expect(rendered).toBe("1234567.89");
    expect(rendered).not.toContain(",");
    expect(rendered).not.toMatch(/[₱P]/);
  });

  it("never produces a float artefact", () => {
    // The whole reason storage is integer cents.
    for (const cents of [1, 7, 99, 101, 999_999, 100_000_007]) {
      expect(centsToDecimal(cents)).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});

// ─── Period boundary ─────────────────────────────────

describe("periodBound", () => {
  it("starts at midnight Manila on the from date", () => {
    const { fromAt } = periodBound({ fromOn: "2026-09-01", toOn: "2026-09-30" });
    // Midnight in Manila is 16:00 UTC the previous day.
    expect(fromAt.toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });

  it("ends at the START of the following day, not 23:59:59", () => {
    // A row filed at 23:59:59.400 on the last day of the month belongs in that month.
    // An inclusive-second boundary drops it, and it then appears in NEITHER period.
    const { toAt } = periodBound({ fromOn: "2026-09-01", toOn: "2026-09-30" });
    expect(toAt.toISOString()).toBe("2026-09-30T16:00:00.000Z");

    const lastMoment = new Date("2026-09-30T15:59:59.400Z");
    expect(lastMoment.getTime()).toBeLessThan(toAt.getTime());
  });

  it("crosses a month and a year boundary correctly", () => {
    expect(periodBound({ fromOn: "2026-12-31", toOn: "2026-12-31" }).toAt.toISOString()).toBe(
      "2026-12-31T16:00:00.000Z",
    );
    expect(periodBound({ fromOn: "2026-02-28", toOn: "2026-02-28" }).toAt.toISOString()).toBe(
      "2026-02-28T16:00:00.000Z",
    );
  });

  it("handles a single-day period without inverting the bounds", () => {
    const { fromAt, toAt } = periodBound({ fromOn: "2026-09-02", toOn: "2026-09-02" });
    expect(toAt.getTime()).toBeGreaterThan(fromAt.getTime());
    expect((toAt.getTime() - fromAt.getTime()) / 3_600_000).toBe(24);
  });
});

// ─── Sheet contracts ─────────────────────────────────

describe("sheet contracts", () => {
  const service = readSource("apps/api/src/services/bookkeeping.service.ts");
  const route = readSource("apps/api/src/routes/insight.routes.ts");

  it("exposes exactly the four sheets", () => {
    expect([...EXPORT_SHEET]).toEqual(["revenue", "expense", "commission", "summary"]);
  });

  it("the revenue sheet MARKS recurring invoices rather than excluding them", () => {
    // 017 excludes them from project contract-value maths; a bookkeeper still needs them.
    expect(REVENUE_HEADER).toContain("is_recurring");
    expect(service).toContain("Marked, not excluded");
  });

  it("the revenue sheet records HOW an invoice was settled, including out-of-band", () => {
    expect(REVENUE_HEADER).toContain("settled_via");
    expect(service).toContain('"out_of_band"');
  });

  it("the expense sheet carries no receipt or reimbursable column", () => {
    // Migration 039 (Prince's rework) removed receipt_url and the reimbursable
    // flag from the expense model, so the sheet no longer exports them.
    expect(EXPENSE_HEADER).not.toContain("is_reimbursable");
    expect(EXPENSE_HEADER).not.toContain("receipt_reference");
    expect(service).not.toContain("receiptUrl");
  });

  it("the commission sheet covers FINALIZED plans only", () => {
    // A draft plan's amounts are derived on read and can still change — the definition
    // of a figure nobody should file.
    expect(service).toContain("finalizedAt} IS NOT NULL");
    expect(service).toContain("FINALIZED plans only");
  });

  it("the commission sheet names the company reserve rather than leaving it blank", () => {
    // The 15% reserve is a real share row with a NULL team member (018), not a leftover.
    // Naming it is what makes the column sum to the basis.
    expect(service).toContain("ADVO (company reserve)");
    expect(COMMISSION_HEADER).toContain("amount_php");
  });

  it("the summary sheet REFUSES to compute a tax figure, and says so in the file", () => {
    // Every tax figure depends on ADVO's registration type, which is still open. A
    // figure computed against a guess is worse than none, because it gets filed.
    expect(SUMMARY_HEADER).toEqual(["metric", "value", "note"]);
    expect(service).toContain("NOT COMPUTED");
    expect(service).toContain("bookkeeper's call");
  });

  it("computes no VAT or withholding anywhere", () => {
    expect(service).not.toMatch(/vatCents|withholdingCents|computeTax/);
  });

  it("the export endpoint is admin-only", () => {
    // The only endpoint that emits every client's money in one document, and an export
    // is the easiest thing in any system to walk out of the door with.
    expect(route).toMatch(/get\("\/export\/:sheet", requireAdmin/);
  });

  it("the export is served as a no-store attachment", () => {
    expect(route).toContain("Content-Disposition");
    expect(route).toContain("attachment; filename=");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("the export carries a BOM so Excel on Windows reads UTF-8", () => {
    expect(route).toContain("BYTE_ORDER_MARK");
    expect(route).toContain("String.fromCharCode(0xfeff)");
  });

  it("refuses an inverted period rather than silently returning nothing", () => {
    expect(route).toContain("fromOn must not be after toOn");
  });
});
