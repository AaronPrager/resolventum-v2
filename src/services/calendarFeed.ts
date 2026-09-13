/**
 * Private ICS feed. One secret token per membership; the raw token is shown
 * once and only its SHA-256 is stored (Token kind CALENDAR_FEED).
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { buildIcs, type IcsEvent } from "../lib/ics";
import { localTimeStr } from "../lib/tz";

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}

/** Revoke any existing feed token for the membership and issue a new one. Returns the raw token. */
export async function issueFeedToken(db: PrismaClient, membershipId: string): Promise<string> {
  const m = await db.membership.findUniqueOrThrow({ where: { id: membershipId }, select: { organizationId: true } });
  const raw = randomBytes(24).toString("base64url");
  await db.$transaction([
    db.token.updateMany({ where: { kind: "CALENDAR_FEED", subjectId: membershipId, revokedAt: null }, data: { revokedAt: new Date() } }),
    db.token.create({ data: { organizationId: m.organizationId, kind: "CALENDAR_FEED", tokenHash: hashToken(raw), subjectId: membershipId } }),
  ]);
  return raw;
}

export async function revokeFeedToken(db: PrismaClient, membershipId: string): Promise<void> {
  await db.token.updateMany({ where: { kind: "CALENDAR_FEED", subjectId: membershipId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function feedStatus(db: PrismaClient, membershipId: string): Promise<{ enabled: boolean; since: Date | null }> {
  const t = await db.token.findFirst({ where: { kind: "CALENDAR_FEED", subjectId: membershipId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return { enabled: !!t, since: t?.createdAt ?? null };
}

/** The ICS text for a raw token, or null when the token is unknown or revoked. */
export async function feedForToken(db: PrismaClient, raw: string, now = new Date()): Promise<{ ics: string; organizationName: string } | null> {
  const t = await db.token.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!t || t.kind !== "CALENDAR_FEED" || t.revokedAt || (t.expiresAt && t.expiresAt < now)) return null;
  const m = await db.membership.findUnique({ where: { id: t.subjectId }, include: { organization: true } });
  if (!m) return null;
  const org = m.organization;
  const from = new Date(now.getTime() - 90 * 86400000);
  const to = new Date(now.getTime() + 400 * 86400000);
  const lessons = await db.lesson.findMany({
    where: { organizationId: org.id, deletedAt: null, startsAt: { gte: from, lte: to } },
    include: { tutor: { select: { name: true } }, students: { include: { student: { select: { firstName: true, lastName: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  const events: IcsEvent[] = lessons.map((l) => {
    const names = l.students.map((s) => `${s.student.firstName} ${s.student.lastName}`).join(", ") || "No student";
    const desc = [
      `${l.durationMin} min at ${localTimeStr(l.startsAt, org.timezone)}`,
      l.tutor ? `Tutor: ${l.tutor.name}` : null,
      l.seriesId ? "Weekly series" : null,
      l.notes ?? null,
    ].filter(Boolean).join("\n");
    return {
      uid: `${l.id}@resolventum`,
      start: l.startsAt,
      end: new Date(l.startsAt.getTime() + l.durationMin * 60000),
      summary: `${names}, ${l.subject}`,
      description: desc,
      location: l.locationType === "REMOTE" ? "Remote" : undefined,
      url: l.meetingLink ?? undefined,
      cancelled: l.status === "CANCELLED",
      updatedAt: l.updatedAt,
    };
  });
  return { ics: buildIcs({ name: `${org.name} lessons`, events, now }), organizationName: org.name };
}
