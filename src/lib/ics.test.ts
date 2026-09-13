import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsDate, icsText } from "./ics";

describe("ics", () => {
  it("formats UTC dates", () => {
    expect(icsDate(new Date("2026-09-14T22:45:00Z"))).toBe("20260914T224500Z");
  });
  it("escapes text", () => {
    expect(icsText("a, b; c\\ d\nline")).toBe("a\\, b\; c\\\\ d\\nline");
  });
  it("folds long lines at 75 octets without splitting characters", () => {
    const folded = foldLine("SUMMARY:" + "é".repeat(60));
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toContain("é".repeat(60));
  });
  it("writes a calendar with events", () => {
    const ics = buildIcs({
      name: "Easy STEM School",
      now: new Date("2026-09-12T00:00:00Z"),
      events: [
        { uid: "a@resolventum", start: new Date("2026-09-14T22:45:00Z"), end: new Date("2026-09-14T23:45:00Z"), summary: "Victoria Li, SAT math", location: "Remote", url: "https://zoom.us/j/1" },
        { uid: "b@resolventum", start: new Date("2026-09-15T20:00:00Z"), end: new Date("2026-09-15T21:00:00Z"), summary: "Eva Laffer", cancelled: true },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Easy STEM School");
    expect(ics).toContain("UID:a@resolventum\r\nDTSTAMP:20260912T000000Z\r\nDTSTART:20260914T224500Z\r\nDTEND:20260914T234500Z\r\nSUMMARY:Victoria Li\\, SAT math");
    expect(ics).toContain("LOCATION:Remote\r\nURL:https://zoom.us/j/1\r\nSTATUS:CONFIRMED");
    expect(ics).toContain("SUMMARY:Cancelled: Eva Laffer");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
