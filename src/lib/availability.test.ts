import { describe, expect, it } from "vitest";
import { AvailabilityError, describeAvailability, parseAvailability, suggestedPriceCents, weekdayOf, withinAvailability } from "./availability";

describe("availability", () => {
  it("parses day ranges and times, 24-hour or am/pm", () => {
    const w = parseAvailability("Mon-Thu 16:00-20:00, Sat 9am-1pm")!;
    expect(w).toHaveLength(5);
    expect(w[0]).toEqual({ day: 0, from: 960, to: 1200 });
    expect(w[4]).toEqual({ day: 5, from: 540, to: 780 });
    expect(parseAvailability("  ")).toBeNull();
    expect(parseAvailability("Sun-Tue 10:00-12:00")!.map((x) => x.day)).toEqual([6, 0, 1]);
  });

  it("refuses what it cannot read", () => {
    expect(() => parseAvailability("after school")).toThrow(AvailabilityError);
    expect(() => parseAvailability("Mon 20:00-16:00")).toThrow(/end is not after/);
    expect(() => parseAvailability("Funday 1-2")).toThrow(/not a day/);
    expect(() => parseAvailability("Mon 25:00-26:00")).toThrow(/not a time/);
  });

  it("checks a lesson against the windows", () => {
    const w = parseAvailability("Mon-Thu 16:00-20:00");
    expect(withinAvailability(w, 0, 16 * 60, 60)).toBe(true);
    expect(withinAvailability(w, 0, 19 * 60 + 30, 60)).toBe(false); // runs past 8pm
    expect(withinAvailability(w, 5, 16 * 60, 60)).toBe(false); // Saturday
    expect(withinAvailability(null, 5, 0, 60)).toBe(true);
    expect(weekdayOf("2026-09-14")).toBe(0); // a Monday
    expect(weekdayOf("2026-09-20")).toBe(6);
  });

  it("describes the windows in plain words", () => {
    expect(describeAvailability(parseAvailability("Mon-Thu 16:00-20:00, Sat 9:00-13:30")!)).toBe("Mon-Thu 4 PM to 8 PM, Sat 9 AM to 1:30 PM");
  });

  it("suggests a price from the client rate", () => {
    expect(suggestedPriceCents(9000, 60)).toBe(9000);
    expect(suggestedPriceCents(9000, 45)).toBe(6750);
    expect(suggestedPriceCents(null, 60)).toBeNull();
  });
});
