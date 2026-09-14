import { describe, expect, it } from "vitest";
import { money, toCsv } from "./csv";

describe("csv", () => {
  it("quotes what needs quoting and writes dates as days", () => {
    const out = toCsv(["Name", "Note", "When", "Amount"], [["Smith, Jo", 'He said "hi"\nthen left', new Date("2026-09-14T15:00:00Z"), money(12345)], [null, undefined, 3, true]]);
    expect(out).toBe('﻿Name,Note,When,Amount\r\n"Smith, Jo","He said ""hi"" then left",2026-09-14,123.45\r\n,,3,true\r\n');
  });
});
