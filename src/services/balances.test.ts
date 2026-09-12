/**
 * Runs against the local resolventum_v2 database after `npm run import`.
 * The expected numbers are facts of the 2026-09-10 production dump plus the post-import fixes.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import { accountBalances } from "./balances";

const asOf = new Date("2026-09-11T00:00:00Z");

describe("accountBalances (imported data)", () => {
  it("returns one row per account", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const rows = await accountBalances(prisma, org.id, asOf);
    expect(rows.length).toBe(94);
  });

  it("knows who has credit and who owes", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const rows = await accountBalances(prisma, org.id, asOf);
    const by = (name: string) => rows.find((r) => r.name === name)!;
    expect(by("Estella Urman").balanceCents).toBe(-13000);
    expect(by("Lina Vernik").balanceCents).toBe(-26000);
    expect(by("Marriott family").balanceCents).toBe(0);
    expect(by("Marriott family").studentNames).toEqual(["Nina Marriott", "Timothy Marriott"]);
    expect(by("Zahar Lazarevich").balanceCents).toBe(0);
    expect(by("Michail Shulkin").balanceCents).toBe(0);
  });

  it("does not count future lessons", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const today = await accountBalances(prisma, org.id, asOf);
    const nextYear = await accountBalances(prisma, org.id, new Date("2027-12-31T00:00:00Z"));
    const sum = (rows: typeof today) => rows.reduce((s, r) => s + r.chargedCents, 0);
    expect(sum(nextYear)).toBeGreaterThan(sum(today));
  });
});
