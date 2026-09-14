/**
 * Emails that go out because of the calendar or the ledger: lesson reminders,
 * the day's schedule, and balance reminders. Every function can preview what
 * it would send, and nothing is sent twice for the same lesson or day.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { sendEmail, EmailError } from "../email/send";
import { formatCents, formatTime } from "../lib/format";
import { localDateStr, zonedToUtc } from "../lib/tz";
import { accountBalances } from "./balances";
import { accountDocument } from "../documents/accountDocs";

const longDay = (day: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface OrgInfo { id: string; name: string; timezone: string; replyToEmail: string | null; venmoHandle: string | null; zelleHandle: string | null; phone: string | null }
async function org(db: PrismaClient, organizationId: string): Promise<OrgInfo> {
  const o = await db.organization.findUnique({ where: { id: organizationId } });
  if (!o) throw new Error("Organization not found");
  return o;
}

/** Who hears about an account: the main contact, then whoever gets statements, then any contact with an email. */
function familyEmail(guardians: { name: string; email: string | null; isPrimary: boolean; isBilling: boolean }[]) {
  const withEmail = guardians.filter((g) => g.email);
  return withEmail.find((g) => g.isPrimary) ?? withEmail.find((g) => g.isBilling) ?? withEmail[0] ?? null;
}

// ---------------------------------------------------------------- lesson reminders

export interface ReminderLesson { lessonId: string; when: string; allDay: boolean; studentName: string; subject: string; durationMin: number; where: string; tutor: string | null; meetingLink: string | null }
export interface LessonReminder {
  accountId: string;
  accountName: string;
  to: string | null;
  toName: string | null;
  lessons: ReminderLesson[];
  /** Lessons in this group that already had a reminder. They are skipped on send. */
  alreadySent: number;
  subject: string;
  text: string;
}

export async function lessonReminders(db: PrismaClient, organizationId: string, day: string): Promise<LessonReminder[]> {
  const o = await org(db, organizationId);
  const from = zonedToUtc(day, "00:00", o.timezone);
  const to = zonedToUtc(addDays(day, 1), "00:00", o.timezone);
  const lessons = await db.lesson.findMany({
    where: { organizationId, deletedAt: null, status: "SCHEDULED", startsAt: { gte: from, lt: to } },
    include: {
      tutor: { select: { name: true } },
      students: { include: { student: { include: { account: { include: { guardians: true } } } } } },
    },
    orderBy: { startsAt: "asc" },
  });
  const sent = new Set(
    (await db.message.findMany({ where: { organizationId, kind: "LESSON_REMINDER", status: "SENT", relatedType: "lesson", relatedId: { in: lessons.map((l) => l.id) } }, select: { relatedId: true } }))
      .map((m) => m.relatedId),
  );

  const groups = new Map<string, LessonReminder>();
  for (const l of lessons) {
    for (const seat of l.students) {
      const s = seat.student;
      if (s.archivedAt || s.deletedAt) continue;
      const g = groups.get(s.accountId) ?? (() => {
        const contact = familyEmail(s.account.guardians);
        const r: LessonReminder = { accountId: s.accountId, accountName: s.account.name, to: contact?.email ?? s.email ?? null, toName: contact?.name ?? (s.email ? s.firstName : null), lessons: [], alreadySent: 0, subject: "", text: "" };
        groups.set(s.accountId, r);
        return r;
      })();
      if (g.lessons.some((x) => x.lessonId === l.id)) continue;
      if (sent.has(l.id)) g.alreadySent++;
      g.lessons.push({
        lessonId: l.id,
        when: l.allDay ? "All day" : formatTime(l.startsAt, o.timezone),
        allDay: l.allDay,
        studentName: s.firstName,
        subject: l.subject,
        durationMin: l.durationMin,
        where: l.locationType === "REMOTE" ? "Online" : "In person",
        tutor: l.tutor?.name ?? null,
        meetingLink: l.meetingLink,
      });
    }
  }
  const out = [...groups.values()];
  for (const r of out) Object.assign(r, reminderText(o, day, r));
  return out.sort((a, b) => a.accountName.localeCompare(b.accountName));
}

function reminderText(o: OrgInfo, day: string, r: LessonReminder) {
  const names = [...new Set(r.lessons.map((l) => l.studentName))];
  const subject = `${o.name}: ${names.join(" and ")}'s lesson${r.lessons.length > 1 ? "s" : ""} ${longDay(day)}`;
  const lines = r.lessons.map((l) => {
    const bits = [`${l.when}, ${l.studentName}`, l.subject || null, l.allDay ? null : `${l.durationMin} min`, l.where, l.tutor ? `with ${l.tutor}` : null].filter(Boolean).join(" · ");
    return l.meetingLink ? `${bits}\n  Join: ${l.meetingLink}` : bits;
  });
  const text = [
    `Hello${r.toName ? ` ${r.toName.split(" ")[0]}` : ""},`,
    "",
    `A reminder about ${longDay(day)}:`,
    "",
    ...lines,
    "",
    `If something changed, reply to this email${o.phone ? ` or call ${o.phone}` : ""}.`,
    "",
    "Thank you,",
    o.name,
  ].join("\n");
  return { subject, text };
}

/** Send reminders for a day. Pass accountIds to send only some. Returns counts. */
export async function sendLessonReminders(db: PrismaClient, organizationId: string, day: string, opts: { accountIds?: string[] } = {}) {
  const o = await org(db, organizationId);
  const all = await lessonReminders(db, organizationId, day);
  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];
  for (const r of all) {
    if (opts.accountIds && !opts.accountIds.includes(r.accountId)) continue;
    const fresh = r.lessons.length - r.alreadySent;
    if (!r.to || fresh === 0) { skipped++; continue; }
    try {
      // Log against every lesson in the email so none is reminded twice.
      const id = await sendEmail(db, organizationId, "LESSON_REMINDER", { to: r.to, subject: r.subject, text: r.text, replyTo: o.replyToEmail }, { type: "lesson", id: r.lessons[0].lessonId });
      const row = await db.message.findUniqueOrThrow({ where: { id } });
      for (const l of r.lessons.slice(1)) {
        await db.message.create({ data: { organizationId, kind: "LESSON_REMINDER", toEmail: r.to, subject: row.subject, relatedType: "lesson", relatedId: l.lessonId, status: "SENT", sentAt: row.sentAt, providerMessageId: row.providerMessageId, bodyText: `(Sent with the reminder for ${r.accountName}.)` } });
      }
      sent++;
    } catch (e) {
      if (!(e instanceof EmailError)) throw e;
      failed++;
      errors.push(`${r.accountName}: ${e.message}`);
    }
  }
  return { sent, skipped, failed, errors };
}

// ---------------------------------------------------------------- the day's schedule

export async function dailySchedule(db: PrismaClient, organizationId: string, day: string): Promise<{ subject: string; text: string; count: number }> {
  const o = await org(db, organizationId);
  const lessons = await db.lesson.findMany({
    where: { organizationId, deletedAt: null, status: { not: "CANCELLED" }, startsAt: { gte: zonedToUtc(day, "00:00", o.timezone), lt: zonedToUtc(addDays(day, 1), "00:00", o.timezone) } },
    include: { tutor: { select: { name: true } }, students: { include: { student: { select: { firstName: true, lastName: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  const lines = lessons.map((l) => {
    const who = l.students.map((s) => `${s.student.firstName} ${s.student.lastName}`).join(", ") || l.subject;
    return [l.allDay ? "All day" : formatTime(l.startsAt, o.timezone), who, l.students.length && l.subject ? l.subject : null, l.allDay ? null : `${l.durationMin} min`, l.locationType === "REMOTE" ? "online" : null, l.tutor?.name ?? null].filter(Boolean).join(" · ");
  });
  const minutes = lessons.filter((l) => !l.allDay).reduce((s, l) => s + l.durationMin, 0);
  return {
    count: lessons.length,
    subject: `${longDay(day)}: ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`,
    text: lessons.length === 0
      ? `Nothing on the calendar for ${longDay(day)}.`
      : [`${longDay(day)}`, `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}, ${(minutes / 60).toFixed(1)} hours`, "", ...lines].join("\n"),
  };
}

export async function sendDailySchedule(db: PrismaClient, organizationId: string, day: string, to: string): Promise<{ sent: boolean; reason?: string }> {
  const already = await db.message.findFirst({ where: { organizationId, kind: "DAILY_SCHEDULE", status: "SENT", relatedType: "day", relatedId: day, toEmail: to.trim().toLowerCase() } });
  if (already) return { sent: false, reason: "Already sent for that day" };
  const s = await dailySchedule(db, organizationId, day);
  await sendEmail(db, organizationId, "DAILY_SCHEDULE", { to: to.trim().toLowerCase(), subject: s.subject, text: s.text }, { type: "day", id: day });
  return { sent: true };
}

// ---------------------------------------------------------------- balance reminders

export interface BalanceReminder {
  accountId: string;
  accountName: string;
  balanceCents: number;
  to: string | null;
  toName: string | null;
  lastReminderAt: Date | null;
  subject: string;
  text: string;
}

export async function balanceReminders(db: PrismaClient, organizationId: string, today: Date): Promise<BalanceReminder[]> {
  const o = await org(db, organizationId);
  const owing = (await accountBalances(db, organizationId, today)).filter((b) => b.balanceCents > 0);
  const accounts = await db.account.findMany({ where: { id: { in: owing.map((b) => b.accountId) } }, include: { guardians: true, students: { where: { deletedAt: null }, select: { email: true, firstName: true } } } });
  const last = await db.message.groupBy({ by: ["relatedId"], where: { organizationId, kind: "BALANCE_REMINDER", status: "SENT", relatedType: "account", relatedId: { in: owing.map((b) => b.accountId) } }, _max: { sentAt: true } });
  const lastBy = new Map(last.map((r) => [r.relatedId, r._max.sentAt]));
  const pay = [o.venmoHandle && `Venmo ${o.venmoHandle}`, o.zelleHandle && `Zelle ${o.zelleHandle}`].filter(Boolean).join(" or ");
  return owing
    .map((b) => {
      const a = accounts.find((x) => x.id === b.accountId)!;
      const contact = familyEmail(a.guardians);
      const to = contact?.email ?? a.students.find((s) => s.email)?.email ?? null;
      const first = contact?.name.split(" ")[0] ?? null;
      return {
        accountId: b.accountId,
        accountName: b.name,
        balanceCents: b.balanceCents,
        to,
        toName: contact?.name ?? null,
        lastReminderAt: lastBy.get(b.accountId) ?? null,
        subject: `${o.name}: balance of ${formatCents(b.balanceCents)} for ${b.name}`,
        text: [
          `Hello${first ? ` ${first}` : ""},`,
          "",
          `This is a friendly reminder that the balance on the ${b.name} account is ${formatCents(b.balanceCents)} as of ${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(today)}.`,
          "The statement is attached.",
          "",
          pay ? `You can pay by ${pay}.` : null,
          "If you have already paid, thank you, and please ignore this note.",
          "",
          "Thank you,",
          o.name,
        ].filter((l) => l !== null).join("\n"),
      };
    })
    .sort((a, b) => b.balanceCents - a.balanceCents);
}

export async function sendBalanceReminders(db: PrismaClient, organizationId: string, accountIds: string[], today: Date) {
  const o = await org(db, organizationId);
  const all = await balanceReminders(db, organizationId, today);
  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];
  const yearStart = `${today.toISOString().slice(0, 4)}-01-01`;
  for (const r of all) {
    if (!accountIds.includes(r.accountId)) continue;
    if (!r.to) { skipped++; continue; }
    try {
      const pdf = await accountDocument(db, organizationId, r.accountId, { kind: "statement", from: yearStart, to: today.toISOString().slice(0, 10), today });
      await sendEmail(db, organizationId, "BALANCE_REMINDER", { to: r.to, subject: r.subject, text: r.text, replyTo: o.replyToEmail, attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.bytes) }] }, { type: "account", id: r.accountId });
      sent++;
    } catch (e) {
      if (!(e instanceof EmailError)) throw e;
      failed++;
      errors.push(`${r.accountName}: ${e.message}`);
    }
  }
  return { sent, skipped, failed, errors };
}

// ---------------------------------------------------------------- nightly

/** What the nightly job does for one school, per its settings. */
export async function nightlyEmails(db: PrismaClient, organizationId: string, now = new Date()) {
  const o = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { memberships: { where: { role: "OWNER" }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" }, take: 1 } } });
  const today = localDateStr(now, o.timezone);
  const result: { reminders?: Awaited<ReturnType<typeof sendLessonReminders>>; schedule?: { sent: boolean; reason?: string } } = {};
  if (o.lessonRemindersAuto) result.reminders = await sendLessonReminders(db, organizationId, addDays(today, 1));
  if (o.dailyScheduleAuto) {
    const to = o.dailyScheduleEmail ?? o.memberships[0]?.user.email;
    if (to) {
      try {
        result.schedule = await sendDailySchedule(db, organizationId, today, to);
      } catch (e) {
        if (!(e instanceof EmailError)) throw e;
        result.schedule = { sent: false, reason: e.message };
      }
    }
  }
  return result;
}

export { addDays as addDaysToDay };
