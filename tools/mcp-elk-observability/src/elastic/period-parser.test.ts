import { describe, expect, it } from "vitest";
import { parsePeriod, InvalidPeriodError, VALID_PERIODS } from "./period-parser.js";

describe("parsePeriod", () => {
  it.each(VALID_PERIODS)("accepts valid period %s and returns now-%s", (period) => {
    expect(parsePeriod(period)).toBe(`now-${period}`);
  });

  it.each([
    "1 hour",
    "1H",
    "60m",
    "1d",
    "8d",
    "0m",
    "",
    " ",
    "1h; DROP",
    "' OR 1=1",
    "1h ",
    " 1h",
    "1h\n",
    "<script>1h</script>",
    "1h; --",
    "$(rm -rf /)",
    "1hh",
    "15",
    "m15",
    "null",
    "undefined",
  ])("rejects invalid/adversarial period %j with INVALID_PERIOD", (period) => {
    expect(() => parsePeriod(period)).toThrow(InvalidPeriodError);
    try {
      parsePeriod(period);
    } catch (err) {
      expect((err as InvalidPeriodError).code).toBe("INVALID_PERIOD");
    }
  });

  it("rejects null-ish input with INVALID_PERIOD", () => {
    // @ts-expect-error - deliberately testing runtime guard against non-string input
    expect(() => parsePeriod(null)).toThrow(InvalidPeriodError);
    // @ts-expect-error - deliberately testing runtime guard against non-string input
    expect(() => parsePeriod(undefined)).toThrow(InvalidPeriodError);
  });
});
