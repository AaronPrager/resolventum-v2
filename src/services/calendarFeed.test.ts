/** Runs against the local resolventum_v2 database after `npm run import`. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { feedForToken, feedStatus, issueFeedToken, revokeFeedToken } from "./calendarFeed";

let membershipId: string;

beforeAll(async () => {
  membershipId = (await prisma.membership.findFirstOrThrow({ where: { user: { email: { not: { contains: "e2e@" } } } } })).id;
});
afterAll(async () => {
  await prisma.token.deleteMany({ where: { kind: "CALENDAR_FEED", subjectId: membershipId } });
});

describe("calendar feed", () => {
  it("issues a token, serves the feed, and stops after revoke", async () => {
    expect((await feedStatus(prisma, membershipId)).enabled).toBe(false);
    const raw = await issueFeedToken(prisma, membershipId);
    expect((await feedStatus(prisma, membershipId)).enabled).toBe(true);

    const feed = await feedForToken(prisma, raw, new Date("2026-09-12T00:00:00Z"));
    expect(feed?.organizationName).toBe("Easy STEM School");
    const ics = feed!.ics;
    expect(ics).toContain("X-WR-CALNAME:Easy STEM School lessons");
    expect(ics).toContain("SUMMARY:Victoria Li\r\n");
    expect(ics).toContain("DTSTART:20260914T184500Z");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBeGreaterThan(500);

    const second = await issueFeedToken(prisma, membershipId);
    expect(await feedForToken(prisma, raw)).toBeNull();
    expect(await feedForToken(prisma, second)).not.toBeNull();

    await revokeFeedToken(prisma, membershipId);
    expect(await feedForToken(prisma, second)).toBeNull();
    expect((await feedStatus(prisma, membershipId)).enabled).toBe(false);
  });

  it("rejects unknown tokens", async () => {
    expect(await feedForToken(prisma, "nope")).toBeNull();
  });
});
