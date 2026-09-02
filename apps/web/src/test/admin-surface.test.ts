/**
 * The three admin surfaces added alongside the connector work: the risk panel, the ⌘K
 * palette, and the revision burndown.
 *
 * Source-reading, in the style of the other invariant suites. These are presentation
 * decisions rather than pure functions, and the decisions are what matter — a component
 * that renders is easy, a component that renders the RIGHT THING when there is nothing to
 * say, or refuses to steal a keystroke, is the part that gets quietly regressed.
 */
import { describe, it, expect } from "vitest";
import { readCode, readSource } from "./read-source.js";

const RISK_PANEL = "apps/web/src/components/admin/AdminRiskPanel.tsx";
const PALETTE = "apps/web/src/components/admin/AdminCommandPalette.tsx";
const BURNDOWN = "apps/web/src/components/hub/RevisionBurndown.tsx";
const ADMIN_PAGE = "apps/web/src/pages/Admin.tsx";
const SIGNOFF_CARD = "apps/web/src/components/hub/SignoffCard.tsx";

describe("risk panel", () => {
  const source = readSource(RISK_PANEL);
  const code = readCode(RISK_PANEL);

  it("renders NOTHING when there is nothing to report", () => {
    // A permanent "0 issues" tile is furniture, and furniture is invisible by the time
    // it finally has something on it.
    expect(code).toContain("if (projectAtRisk.length === 0 && stale.length === 0) return null;");
  });

  it("stays absent when a read FAILS rather than showing a reassuring zero", () => {
    // Reporting "nothing at risk" because a request failed is the one wrong answer here.
    expect(code).toContain("if (riskRes.data) setRisk(riskRes.data);");
    expect(source).toContain("A failed read leaves the panel absent");
  });

  it("names a reason in words on every row", () => {
    // "₱60,000 at risk" prompts "why?", and a number whose explanation lives in
    // somebody's head gets argued with rather than acted on.
    expect(code).toContain("REASON_TEXT");
    expect(code).toContain("in progress with no signed contract");
    expect(code).toContain("invoice past due");
  });

  it("distinguishes 'never contacted' from 'contacted today'", () => {
    // null is NOT zero days ago. Rendering it as 0 states the opposite of the truth.
    expect(code).toContain("no contact on record");
    expect(code).toContain("one.dayCountSinceContact === null");
  });

  it("carries severity by ORDER and words, not by a wall of red", () => {
    // Colour as the only signal is decoration within a week; the API already sorts
    // worst-first, so the panel does not re-sort or re-colour.
    expect(code).not.toMatch(/text-red-|bg-red-|text-destructive/);
  });

  it("cleans up its async state on unmount", () => {
    // Two awaited fetches in one effect: without the guard, a fast navigation sets state
    // on an unmounted component.
    expect(code).toContain("isMounted = false");
  });

  it("is mounted on the dashboard, above the pipeline", () => {
    const page = readCode(ADMIN_PAGE);
    expect(page).toContain("<AdminRiskPanel");
    expect(page.indexOf("<AdminRiskPanel")).toBeLessThan(page.indexOf("<AdminDashboard"));
  });
});

describe("command palette", () => {
  const source = readSource(PALETTE);
  const code = readCode(PALETTE);

  it("does NOT swallow the shortcut while somebody is typing", () => {
    // ⌘K inside a project description would otherwise open the palette and eat the
    // keystroke, losing the person's place in a half-finished form.
    expect(code).toContain("if (isTypingTarget(event.target)) return;");
    expect(code).toContain('tag === "INPUT" || tag === "TEXTAREA"');
    expect(code).toContain("target.isContentEditable");
  });

  it("accepts both Cmd and Ctrl", () => {
    expect(code).toContain("event.metaKey || event.ctrlKey");
  });

  it("removes its listener on unmount", () => {
    expect(code).toContain('window.removeEventListener("keydown", onKey)');
  });

  it("carries the synonyms people actually type", () => {
    // Nobody navigates to "Finance" looking for an invoice.
    expect(code).toMatch(/id: "finance"[\s\S]{0,300}invoice/);
    expect(code).toMatch(/id: "availability"[\s\S]{0,200}capacity/);
    expect(code).toMatch(/id: "contracts"[\s\S]{0,200}moa/);
  });

  it("offers actions, not only destinations", () => {
    expect(code).toContain('CommandGroup heading="Go to"');
    expect(code).toContain("exportSheet");
  });

  it("states the export period rather than picking one silently", () => {
    // A finance export whose range you have to guess is one nobody can check.
    expect(code).toContain("Export — ${fromOn} to ${toOn}");
    expect(code).toContain("month to date");
  });

  it("downloads through an authenticated fetch, not a bare navigation", () => {
    // A plain window.open carries no Authorization header and would save a 401 body as
    // a .csv — which looks like a corrupt export rather than an auth problem.
    expect(code).toContain("getAccessToken()");
    expect(code).toContain("Authorization");
    expect(code).not.toContain("window.open(");
  });

  it("surfaces a failed export instead of silently doing nothing", () => {
    // A silent no-op on a download is indistinguishable from a blocked popup, and
    // people retry forever.
    expect(code).toMatch(/if \(!res\.ok\)[\s\S]{0,200}alert/);
  });

  it("revokes the object URL it creates", () => {
    expect(code).toContain("URL.revokeObjectURL(url)");
  });

  it("is mounted once at page level, not inside a section", () => {
    const page = readCode(ADMIN_PAGE);
    expect(page.match(/<AdminCommandPalette/g) ?? []).toHaveLength(1);
  });

  it("explains why a palette earns its place here", () => {
    expect(source).toContain("twenty-odd admin sections");
  });
});

describe("revision burndown", () => {
  const source = readSource(BURNDOWN);
  const code = readCode(BURNDOWN);

  it("clamps rather than trusting its inputs", () => {
    // The write path legitimately permits a chargeable round past the free five, so
    // used can exceed total. A negative remainder would render as an empty row that
    // reads like "no data".
    expect(code).toContain("Math.max(0, safeTotal - safeUsed)");
    expect(code).toContain("Math.max(0, totalCount)");
  });

  it("draws countable pips, not a percentage bar", () => {
    // Five discrete rounds are five discrete things. A bar at 60% invites "a bit more
    // than half" when the true statement is "two".
    expect(code).toContain("Array.from({ length: safeTotal }");
    expect(source).toContain("Countability is the entire point");
  });

  it("falls back to a fraction when there are too many pips to count", () => {
    expect(code).toContain("MAX_PIP");
    expect(code).toContain("{safeUsed}/{safeTotal}");
  });

  it("does NOT colour the last round as an error", () => {
    // "One revision left" is the agreement working, not a fault. A UI that panics gets
    // ignored.
    expect(code).not.toMatch(/text-red-|bg-red-|text-destructive|amber/);
  });

  it("changes only the sentence between audiences, never the numbers", () => {
    expect(code).toContain('audience === "client" ? "You have" : "The client has"');
  });

  it("gives the pips one accessible label instead of announcing the count twice", () => {
    expect(code).toContain('role="img"');
    expect(code).toContain("aria-label={label}");
    expect(code).toContain('aria-hidden="true"');
  });

  it("is rendered by the client Hub sign-off card", () => {
    const card = readCode(SIGNOFF_CARD);
    expect(card).toContain("<RevisionBurndown");
    expect(card).toContain('audience="client"');
  });

  it("is one shared component so the two sides cannot disagree", () => {
    // The FourlinQ revision dispute was two parties holding different counts.
    expect(source).toContain("never disagree");
  });
});
