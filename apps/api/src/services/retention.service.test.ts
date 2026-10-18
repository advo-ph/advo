/**
 * retentionDay() + sweepAnalyticsEvent()'s disabled-by-default short-circuit
 * (process/general-plans/active/visitor-analytics_PLAN_09-10-26.md §4.6, §5.1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.fn();
vi.mock("../db/connection.js", () => ({ db: dbMock }));

describe("retentionDay", () => {
  const originalValue = process.env.ANALYTICS_RETENTION_DAY;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.ANALYTICS_RETENTION_DAY;
    else process.env.ANALYTICS_RETENTION_DAY = originalValue;
  });

  it.each([
    [undefined, null],
    ["", null],
    ["0", null],
    ["-5", null],
    ["not-a-number", null],
    ["90", 90],
    ["30.9", 30],
  ])("ANALYTICS_RETENTION_DAY=%s -> %s", async (envValue, expected) => {
    if (envValue === undefined) delete process.env.ANALYTICS_RETENTION_DAY;
    else process.env.ANALYTICS_RETENTION_DAY = envValue;

    vi.resetModules();
    const { retentionDay } = await import("./retention.service.js");
    expect(retentionDay()).toBe(expected);
  });
});

describe("sweepAnalyticsEvent — disabled by default", () => {
  beforeEach(() => {
    dbMock.mockReset();
    delete process.env.ANALYTICS_RETENTION_DAY;
  });

  it("performs zero DB calls when ANALYTICS_RETENTION_DAY is unset", async () => {
    vi.resetModules();
    const { sweepAnalyticsEvent } = await import("./retention.service.js");

    const result = await sweepAnalyticsEvent();

    expect(result).toEqual({ deletedCount: 0, isComplete: true, refusedDay: [] });
    expect(dbMock).not.toHaveBeenCalled();
  });
});
