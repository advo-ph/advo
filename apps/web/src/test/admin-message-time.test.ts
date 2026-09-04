/**
 * The two admin surfaces that make the README true.
 *
 * These exist because of a mistake worth recording: the connector work landed the
 * message and time-entry APIs, and the same commit added "Messages" and "Time" to the
 * README's admin feature list — which was false. The APIs existed; the screens did not.
 * That is precisely the stale-doc failure the surrounding commits were correcting, so
 * the fix was to build the screens rather than soften the sentence.
 *
 * Behavioural coverage for the one pure function these surfaces add (`hourToMinute`),
 * plus source-reading for the presentation decisions that get quietly regressed.
 */
import { describe, it, expect } from "vitest";
import { readCode, readSource } from "./read-source.js";
import { formatDuration, hourToMinute } from "../hooks/useTimeEntry";

const MESSAGES = "apps/web/src/components/admin/AdminMessages.tsx";
const TIME = "apps/web/src/components/admin/AdminTime.tsx";
const MESSAGE_HOOK = "apps/web/src/hooks/useMessage.ts";
const TIME_HOOK = "apps/web/src/hooks/useTimeEntry.ts";
const SIDEBAR = "apps/web/src/components/admin/AdminSidebar.tsx";
const ADMIN_PAGE = "apps/web/src/pages/Admin.tsx";
const PALETTE = "apps/web/src/components/admin/AdminCommandPalette.tsx";
const README = "README.md";

// ─── hourToMinute ────────────────────────────────────

describe("hourToMinute", () => {
  it("converts the decimals people actually type", () => {
    expect(hourToMinute("1")).toBe(60);
    expect(hourToMinute("1.5")).toBe(90);
    expect(hourToMinute("0.25")).toBe(15);
    expect(hourToMinute("8")).toBe(480);
    expect(hourToMinute("7.75")).toBe(465);
  });

  it("rounds to a whole minute rather than carrying a float forward", () => {
    // This is the ONE place a float is allowed near this number, and it terminates
    // here. A float in the cache gets re-summed on every render of every summary, and
    // this feeds a pricing argument.
    expect(hourToMinute("0.333")).toBe(20);
    expect(Number.isInteger(hourToMinute("1.234")!)).toBe(true);
  });

  it("returns null — not NaN — for anything unparseable", () => {
    // NaN would reach the API as `null` and fail validation with a message about a
    // missing field, sending someone to look at the wrong input.
    expect(hourToMinute("")).toBeNull();
    expect(hourToMinute("abc")).toBeNull();
    expect(hourToMinute("0")).toBeNull();
    expect(hourToMinute("-3")).toBeNull();
    expect(hourToMinute("Infinity")).toBeNull();
  });

  it("round-trips through formatDuration for the common cases", () => {
    expect(formatDuration(hourToMinute("1.5")!)).toBe("1h 30m");
    expect(formatDuration(hourToMinute("8")!)).toBe("8h");
    expect(formatDuration(hourToMinute("0.25")!)).toBe("15m");
  });
});

// ─── AdminMessages ───────────────────────────────────

describe("AdminMessages", () => {
  const source = readSource(MESSAGES);
  const code = readCode(MESSAGES);

  it("LABELS an unverified message instead of rendering it as client speech", () => {
    // 023 stores unverified inbound deliberately — dropping a real client message costs
    // more than storing a forgery. But a forged row rendered plainly would be a
    // FABRICATED PAPER TRAIL, and this screen is where change-order evidence is read.
    expect(code).toContain("!one.signatureVerified");
    expect(code).toContain("unverified signature");
  });

  it("separates FAILED from REFUSED, because they need different responses", () => {
    // A failed row is a broken transport; a refused row is the consent gate working.
    // Conflating them teaches people to ignore both.
    expect(code).toContain('one.status === "failed"');
    expect(code).toContain('one.status === "refused"');
    expect(source).toContain("A refusal is not a failure");
  });

  it("shows consent state on every channel row, not behind a detail view", () => {
    expect(code).toContain("consentOf(one)");
    expect(code).toContain("no consent");
    expect(code).toContain("withdrawn");
  });

  it("treats consent as three states, not a boolean", () => {
    // "Never given" and "withdrawn" are different facts about a person.
    expect(code).toContain("if (row.revokedAt)");
    expect(code).toContain("if (!row.consentAt)");
  });

  it("cannot grant consent without a source", () => {
    // "We have consent" without provenance is not a defence, so there is no one-click
    // grant anywhere on this screen.
    expect(code).toContain("!consentSource.trim() || isMutating");
    expect(code).toContain("if (!consentSource.trim()) return;");
  });

  it("states the RA 10173 rule on the screen an operator is looking at", () => {
    expect(code).toContain("RA 10173");
    expect(code).toContain("setting a");
  });

  it("has a real empty state for the queue rather than a blank panel", () => {
    expect(code).toContain("Nothing waiting");
  });
});

// ─── AdminTime ───────────────────────────────────────

describe("AdminTime", () => {
  const source = readSource(TIME);
  const code = readCode(TIME);

  it("shows NO money anywhere", () => {
    // The moment effort carries a peso figure per person, a timesheet becomes a
    // performance review.
    expect(code).not.toMatch(/formatCurrency|amountCents|rate|₱|cost/i);
  });

  it("takes hours and converts once, storing minutes", () => {
    expect(code).toContain("hourToMinute(hour)");
    expect(code).toContain("minuteCount,");
  });

  it("previews the conversion before the person commits", () => {
    // Somebody typing 3.5 should see 3h 30m now, not discover the rounding later in a
    // summary they are pricing from.
    expect(code).toMatch(/minuteCount !== null \? formatDuration\(minuteCount\)/);
  });

  it("blocks a future date in the input, not only at the API", () => {
    expect(code).toContain("max={todayOn()}");
  });

  it("keeps project / person / date after a save", () => {
    // Logging a week is several entries against the same three; re-picking them every
    // time is what makes people stop logging.
    expect(source).toContain("Project, person and date persist deliberately");
  });

  it("calls the load bar a measurement, on the screen", () => {
    // Under nominal usually means under-recorded. Leaving people to infer a judgement
    // from a half-empty bar is how a capacity view becomes a stick.
    expect(code).toContain("A measurement, not a verdict");
    expect(code).toContain("under-recorded");
  });

  it("caps the bar width but not the number", () => {
    expect(code).toContain("Math.min(100, Math.round(member.loadRatio * 100))");
  });

  it("names people rather than printing member ids", () => {
    // "Member 7 is over capacity" is a line nobody acts on.
    expect(code).toContain("memberNameOf");
  });

  it("deletes rather than offering a negative correction", () => {
    // 024 CHECKs minute_count positive precisely so an anti-entry cannot exist.
    expect(code).toContain("deleteTimeEntry");
    expect(code).not.toMatch(/negativeEntry|adjustment/);
  });
});

// ─── Hooks ───────────────────────────────────────────

describe("hooks", () => {
  const messageHook = readCode(MESSAGE_HOOK);
  const timeHook = readCode(TIME_HOOK);

  it("keeps the three message reads as separate queries", () => {
    // An empty undelivered list is the HEALTHY case; folded into one fetch it would be
    // indistinguishable from a loading state.
    expect(messageHook).toContain("UNTRIAGED_KEY");
    expect(messageHook).toContain("UNDELIVERED_KEY");
    expect(messageHook).toContain("CONTACT_KEY");
  });

  it("tells the operator that revoking KEEPS the row", () => {
    expect(messageHook).toContain("deleting it would lose the evidence");
  });

  it("requires a consent source in the mutation signature", () => {
    expect(messageHook).toContain("consentSource: string");
  });

  it("carries no rate or cost through the time boundary", () => {
    expect(timeHook).not.toMatch(/rateCents|costCents|amountCents/);
  });
});

// ─── Wiring, and the README claim that started this ──

describe("wiring", () => {
  it("both sections exist in the sidebar type and its nav list", () => {
    const sidebar = readCode(SIDEBAR);
    expect(sidebar).toContain('| "messages"');
    expect(sidebar).toContain('| "time"');
    expect(sidebar).toContain('id: "messages"');
    expect(sidebar).toContain('id: "time"');
  });

  it("both are mounted on the admin page", () => {
    const page = readCode(ADMIN_PAGE);
    expect(page).toContain("<AdminMessages />");
    expect(page).toContain("<AdminTime");
  });

  it("the time view is given only ACTIVE team members", () => {
    // A capacity view listing people who have left reads as an under-loaded team, which
    // is the opposite of the truth.
    expect(readCode(ADMIN_PAGE)).toContain("team={activeMembers}");
  });

  it("both are reachable from ⌘K, with the words people type", () => {
    const palette = readCode(PALETTE);
    expect(palette).toMatch(/id: "messages"[\s\S]{0,200}sms/);
    expect(palette).toMatch(/id: "time"[\s\S]{0,200}timesheet/);
  });

  it("the README's admin list is now TRUE for both claims", () => {
    // The assertion that closes the loop. README claimed these before they existed.
    const readme = readSource(README);
    expect(readme).toContain("- **Messages**");
    expect(readme).toContain("- **Time**");
    // …and the components those bullets describe are on disk.
    expect(readCode(MESSAGES).length).toBeGreaterThan(0);
    expect(readCode(TIME).length).toBeGreaterThan(0);
  });
});

// ─── The payment-link button ─────────────────────────

describe("invoice payment link", () => {
  const LINK = "apps/web/src/components/admin/InvoicePaymentLink.tsx";
  const FINANCE = "apps/web/src/components/admin/AdminFinance.tsx";
  const source = readSource(LINK);
  const code = readCode(LINK);

  it("treats a missing checkout URL as SUCCESS, not an error", () => {
    // The default manual rail returns no URL. That is the business's actual process,
    // and a button that showed an error there would be lying about a working path.
    expect(code).toContain('title: "Collectable recorded"');

    // Exactly ONE destructive toast in the file, and it belongs to the `res.error`
    // branch — a genuine API failure. Counting rather than pattern-matching around
    // the no-URL path, because a loose regex here catches that legitimate branch and
    // asserts the opposite of what is meant.
    expect(code.match(/variant: "destructive"/g) ?? []).toHaveLength(1);
    const destructiveAt = code.indexOf('variant: "destructive"');
    const errorBranchAt = code.indexOf("if (res.error)");
    const successAt = code.indexOf('title: "Collectable recorded"');
    expect(errorBranchAt).toBeGreaterThan(-1);
    expect(destructiveAt).toBeGreaterThan(errorBranchAt);
    expect(destructiveAt).toBeLessThan(successAt);
  });

  it("names a fallback rather than swallowing it", () => {
    // Swallowing it lets an operator believe PayMongo is live while every invoice
    // quietly becomes a manual row — the exact shape of the mail outage.
    expect(code).toContain("res.data?.fellBack");
  });

  it("renders nothing on an already-paid invoice", () => {
    // The API refuses with 409; a button that exists only to fail is one people press.
    expect(code).toContain('if (status === "paid") return null;');
  });

  it("copies the link — it never auto-opens it", () => {
    // This is a payment URL for a CLIENT. Opening it in the operator's browser is at
    // best funnel noise and at worst a real payment attempt from the wrong person.
    expect(code).toContain("navigator.clipboard.writeText");
    expect(code).not.toContain("window.open");
  });

  it("reverts the copied state so it can report the NEXT press", () => {
    expect(code).toContain("setIsCopied(false)");
  });

  // PENDING (reconcile/revised, 2026-09-04): Prince's finance rework uses uploaded
  // invoice FILES, not the invoice records InvoicePaymentLink attaches to. The
  // component and /api/payment still exist; re-homing the payment-link UI needs a
  // decision on which invoice model the finance screen uses. See RECONCILE-REVISED.md.
  it.skip("is wired into the Finance invoice row", () => {
    const finance = readCode(FINANCE);
    expect(finance).toContain("<InvoicePaymentLink");
    expect(finance).toContain("invoiceId={inv.invoice_id}");
  });

  it.skip("closes the second README claim from the same commit", () => {
    expect(readSource(README)).toContain("**payment links**");
    expect(source.length).toBeGreaterThan(0);
  });
});
