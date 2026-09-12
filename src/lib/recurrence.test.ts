import { describe, expect, it } from "vitest";
import { formatRule, parseRule, weeklyOccurrences, weeklyOccurrencesAfter } from "./recurrence";

const NY = "America/New_York";

describe("recurrence", () => {
  it("parses and formats weekly rules", () => {
    expect(parseRule("FREQ=WEEKLY")).toEqual({ intervalWeeks: 1 });
    expect(parseRule("FREQ=WEEKLY;INTERVAL=2")).toEqual({ intervalWeeks: 2 });
    expect(formatRule({ intervalWeeks: 1 })).toBe("FREQ=WEEKLY");
    expect(formatRule({ intervalWeeks: 3 })).toBe("FREQ=WEEKLY;INTERVAL=3");
    expect(() => parseRule("FREQ=DAILY")).toThrow();
  });

  it("keeps the local time across the DST switch", () => {
    // 4:00 pm New York on Oct 27 2026 is 20:00Z; a week later DST has ended and 4:00 pm is 21:00Z.
    const out = weeklyOccurrences({ firstStartsAt: new Date("2026-10-27T20:00:00Z"), timeZone: NY, intervalWeeks: 1, count: 3 });
    expect(out.map((d) => d.toISOString())).toEqual([
      "2026-10-27T20:00:00.000Z",
      "2026-11-03T21:00:00.000Z",
      "2026-11-10T21:00:00.000Z",
    ]);
  });

  it("stops at the until date, inclusive", () => {
    const out = weeklyOccurrences({ firstStartsAt: new Date("2026-09-15T20:00:00Z"), timeZone: NY, intervalWeeks: 1, until: "2026-09-29" });
    expect(out.length).toBe(3);
    expect(out[2].toISOString()).toBe("2026-09-29T20:00:00.000Z");
  });

  it("honours the interval", () => {
    const out = weeklyOccurrences({ firstStartsAt: new Date("2026-09-15T20:00:00Z"), timeZone: NY, intervalWeeks: 2, count: 3 });
    expect(out[1].toISOString()).toBe("2026-09-29T20:00:00.000Z");
    expect(out[2].toISOString()).toBe("2026-10-13T20:00:00.000Z");
  });

  it("extends only after a given instant", () => {
    const out = weeklyOccurrencesAfter({
      firstStartsAt: new Date("2026-09-15T20:00:00Z"), timeZone: NY, intervalWeeks: 1,
      after: new Date("2026-09-29T20:00:00Z"), until: "2026-10-13",
    });
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-10-06", "2026-10-13"]);
  });

  it("never runs away without an end", () => {
    const out = weeklyOccurrences({ firstStartsAt: new Date("2026-09-15T20:00:00Z"), timeZone: NY, intervalWeeks: 1 });
    expect(out.length).toBe(520);
  });
});
