import { describe, expect, it } from "vitest";
import { dateOnlyFromStr, dateOnlyStr, localDateOnly, localDateStr, localTimeStr, offsetMinutes, zonedToUtc } from "./tz";

const NY = "America/New_York";

describe("tz", () => {
  it("knows New York offsets in winter and summer", () => {
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), NY)).toBe(-300);
    expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), NY)).toBe(-240);
  });

  it("turns a New York wall-clock time into the right instant", () => {
    expect(zonedToUtc("2026-03-20", "16:00", NY).toISOString()).toBe("2026-03-20T20:00:00.000Z");
    expect(zonedToUtc("2026-01-20", "16:00", NY).toISOString()).toBe("2026-01-20T21:00:00.000Z");
  });

  it("round-trips through local date and time", () => {
    const t = zonedToUtc("2026-11-01", "20:30", NY); // the day DST ends
    expect(localDateStr(t, NY)).toBe("2026-11-01");
    expect(localTimeStr(t, NY)).toBe("20:30");
  });

  it("gives the local calendar date for a late-evening lesson stored after UTC midnight", () => {
    const t = new Date("2026-05-01T00:30:00Z"); // 8:30 pm on April 30 in New York
    expect(localDateStr(t, NY)).toBe("2026-04-30");
    expect(dateOnlyStr(localDateOnly(t, NY))).toBe("2026-04-30");
  });

  it("handles @db.Date strings", () => {
    expect(dateOnlyStr(dateOnlyFromStr("2026-02-03"))).toBe("2026-02-03");
  });
});
