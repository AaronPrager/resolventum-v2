/** Runs against the local resolventum_v2 database after `npm run import`. */
import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import { accountStatement } from "./statement";

async function accountId(name: string) {
  return (await prisma.account.findFirstOrThrow({ where: { name } })).id;
}

describe("accountStatement (imported data)", () => {
  it("runs the balance forward entry by entry to the same closing number", async () => {
    const st = (await accountStatement(prisma, await accountId("Michail Shulkin")))!;
    expect(st.entries.length).toBe(10 + 3 + 1); // 10 lessons, 3 payments, 1 settling adjustment
    let running = 0;
    for (const e of st.entries) {
      running += e.deltaCents;
      expect(e.runningBalanceCents).toBe(running);
    }
    expect(st.closingBalanceCents).toBe(0);
    expect(st.chargedCents - st.paidCents).toBe(0);
  });

  it("puts entries in date order and shows which payment covered a lesson", async () => {
    const st = (await accountStatement(prisma, await accountId("Michail Shulkin")))!;
    for (let i = 1; i < st.entries.length; i++) {
      expect(st.entries[i].date.getTime()).toBeGreaterThanOrEqual(st.entries[i - 1].date.getTime());
    }
    const lesson = st.entries.find((e) => e.kind === "charge" && e.date.toISOString().startsWith("2026-03-20"))!;
    expect(lesson.deltaCents).toBe(13000);
    expect(lesson.appliedPayments.map((a) => a.amountCents)).toEqual([13000]);
  });

  it("carries an opening balance when a period is given", async () => {
    const id = await accountId("Michail Shulkin");
    const all = (await accountStatement(prisma, id))!;
    const may = (await accountStatement(prisma, id, { from: new Date("2026-05-01T00:00:00Z"), to: new Date("2026-05-31T00:00:00Z") }))!;
    const before = all.entries.filter((e) => e.date < new Date("2026-05-01T00:00:00Z")).reduce((s, e) => s + e.deltaCents, 0);
    expect(may.openingBalanceCents).toBe(before);
    expect(may.entries.every((e) => e.date >= may.from! && e.date <= may.to!)).toBe(true);
  });

  it("merges siblings into one statement", async () => {
    const st = (await accountStatement(prisma, await accountId("Marriott family")))!;
    expect(st.studentNames).toEqual(["Nina Marriott", "Timothy Marriott"]);
    expect(st.entries.some((e) => e.studentName === "Nina Marriott")).toBe(true);
  });

  it("returns null for an unknown account", async () => {
    expect(await accountStatement(prisma, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
