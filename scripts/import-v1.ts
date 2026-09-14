/**
 * Import a v1 Resolventum database into the v2 schema.
 *
 *   SOURCE_DATABASE_URL  v1 copy to read   (default: resolventum_prod_copy on localhost)
 *   DATABASE_URL         v2 database to write (from .env)
 *
 * Safe to run repeatedly: it wipes every v2 table first. It never writes to
 * the source. Mapping rules are in docs/schema-plan.md, sections 2 and 4.
 *
 *   npx tsx scripts/import-v1.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { prisma } from "../src/db.js";
import { rebuildOrganizationAllocations } from "../src/services/allocation.js";

const SOURCE_URL =
  process.env.SOURCE_DATABASE_URL ?? "postgresql://faina@localhost:5432/resolventum_prod_copy";
const TIMEZONE = "America/New_York";
const CHUNK = 500;

// v1 columns are "timestamp without time zone" holding UTC (the v1 client sent
// toISOString()). node-postgres would parse them in the machine's zone, which
// shifted every lesson by the local offset. Parse them as UTC, whatever the zone.
pg.types.setTypeParser(1114, (s: string) => new Date(s.replace(" ", "T") + "Z"));
const src = new pg.Pool({ connectionString: SOURCE_URL });
const warnings: string[] = [];
const notes: string[] = [];

function warn(msg: string) {
  warnings.push(msg);
}
function fail(msg: string): never {
  throw new Error(msg);
}
function cents(n: number | null | undefined): number {
  return Math.round((Number(n) || 0) * 100);
}
function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}
/** UTC midnight for a calendar date. Avoids Date.UTC treating years 0 to 99 as 1900 to 1999. */
function mkDate(y: number, m0: number, d: number): Date {
  const out = new Date(0);
  out.setUTCFullYear(y, m0, d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
const nyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** Calendar date of a timestamp as seen in New York. For lesson times. */
function nyDate(ts: Date): Date {
  const [y, m, d] = nyFormat.format(ts).split("-").map(Number);
  return mkDate(y, m - 1, d);
}
/**
 * Calendar date of a v1 date-only column. Two eras exist: rows saved as New
 * York midnight (04:00 or 05:00 UTC, the majority) and rows saved as UTC
 * midnight (00:00). The first kind is read as a New York date, the second as
 * written, so both give the day the user typed.
 */
function utcDate(ts: Date): Date {
  return ts.getUTCHours() < 4 ? mkDate(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()) : nyDate(ts);
}
/** v1 saved some upload names with UTF-8 bytes read as Latin-1 ("Coulombâ€™s"). Undo that when it decodes cleanly. */
function fixName(s: string): string {
  if (!/[\u00c2\u00c3\u00e2]/.test(s)) return s;
  const back = Buffer.from(s, "latin1").toString("utf8");
  return back.includes("\ufffd") ? s : back;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function dataUriToBuffer(uri: string): { buf: Buffer; mime: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(uri);
  if (!m) return null;
  return { buf: Buffer.from(m[2], "base64"), mime: m[1] };
}
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await src.query(sql, params);
  return r.rows as T[];
}
async function inChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
}

// ------------------------------------------------------------ file helper

/** (org, sha256, name) is unique on File. Reuse an existing row when the same bytes and name come around again. */
const fileKeys = new Map<string, string>();
async function createFile(opts: {
  id?: string;
  organizationId: string;
  name: string;
  mimeType: string;
  data: Buffer;
  uploadedById?: string | null;
  createdAt?: Date;
}): Promise<string> {
  const hash = sha256(opts.data);
  const key = `${opts.organizationId}|${hash}|${opts.name}`;
  const existing = fileKeys.get(key);
  if (existing) return existing;
  const id = opts.id ?? randomUUID();
  await prisma.file.create({
    data: {
      id,
      organizationId: opts.organizationId,
      name: opts.name,
      mimeType: opts.mimeType,
      sizeBytes: opts.data.length,
      sha256: hash,
      storage: "DATABASE",
      data: new Uint8Array(opts.data),
      uploadedById: opts.uploadedById ?? null,
      createdAt: opts.createdAt,
    },
  });
  fileKeys.set(key, id);
  return id;
}

// ------------------------------------------------------------ main

async function main() {
  const startedAt = Date.now();
  const today = nyDate(new Date());

  // 0. Wipe v2.
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name not like '_prisma%'`;
  const names = tables.map((t) => `"${t.table_name}"`).join(", ");
  await prisma.$executeRawUnsafe(`truncate ${names} restart identity cascade`);
  console.log(`wiped ${tables.length} v2 tables`);

  // 1. Organization and owner.
  const orgs = await q<{ id: string; name: string; students: string }>(`
    select o.*, (select count(*) from "Student" s where s."organizationId" = o.id) as students
    from "Organization" o`);
  const realOrgs = orgs.filter((o) => Number(o.students) > 0);
  if (realOrgs.length !== 1) {
    fail(`expected exactly one organization with students, found ${realOrgs.length}`);
  }
  const v1Org = realOrgs[0] as Record<string, any>;
  const orgId = v1Org.id as string;
  notes.push(`skipped organizations: ${orgs.filter((o) => o.id !== orgId).map((o) => o.name).join(", ")}`);

  const members = await q<Record<string, any>>(
    `select * from "OrganizationMember" where "organizationId" = $1 order by "createdAt"`,
    [orgId],
  );
  const ownerMember = members.find((m) => m.role === "OWNER") ?? fail("organization has no OWNER member");
  const users = await q<Record<string, any>>(
    `select * from "User" where id = any($1::text[])`,
    [members.map((m) => m.userId)],
  );
  const owner = users.find((u) => u.id === ownerMember.userId) ?? fail("owner user missing");

  await prisma.organization.create({
    data: {
      id: orgId,
      name: v1Org.name,
      slug: slugify(v1Org.name),
      timezone: TIMEZONE,
      legalName: owner.companyName ?? null,
      address: owner.address ?? null,
      phone: owner.phone ?? null,
      replyToEmail: owner.academicEmail ?? null,
      venmoHandle: owner.venmo ?? null,
      zelleHandle: owner.zelle ?? null,
      onboardingCompletedAt: v1Org.onboardingCompletedAt ?? null,
      studentIntakeEnabled: Boolean(v1Org.studentIntakeEnabled),
      createdAt: v1Org.createdAt,
    },
  });

  for (const u of users) {
    await prisma.user.create({
      data: {
        id: u.id,
        email: u.email,
        passwordHash: u.password,
        name: u.name,
        emailVerifiedAt: u.verified ? u.createdAt : null,
        deletedAt: u.deletedAt ?? null,
        createdAt: u.createdAt,
      },
    });
  }
  for (const m of members) {
    await prisma.membership.create({
      data: { userId: m.userId, organizationId: orgId, role: m.role, createdAt: m.createdAt },
    });
    if (m.calendarFeedTokenHash) {
      await prisma.token.create({
        data: { organizationId: orgId, kind: "CALENDAR_FEED", tokenHash: m.calendarFeedTokenHash, subjectId: m.id },
      });
    }
  }
  if (v1Org.studentIntakeTokenHash) {
    await prisma.token.create({
      data: { organizationId: orgId, kind: "STUDENT_INTAKE", tokenHash: v1Org.studentIntakeTokenHash, subjectId: orgId },
    });
  }
  if (owner.logoData) {
    const parsed = dataUriToBuffer(owner.logoData);
    if (parsed) {
      const logoFileId = await createFile({
        organizationId: orgId,
        name: "logo",
        mimeType: parsed.mime,
        data: parsed.buf,
        uploadedById: owner.id,
      });
      await prisma.organization.update({ where: { id: orgId }, data: { logoFileId } });
    } else {
      warn("owner logoData is not a data URI; logo skipped");
    }
  }
  console.log(`organization ${v1Org.name}: ${users.length} users, ${members.length} memberships`);

  // 2. Tutors.
  const tutors = await q<Record<string, any>>(`select * from "Tutor" where "organizationId" = $1`, [orgId]);
  for (const t of tutors) {
    let photoFileId: string | null = null;
    if (t.photoData) {
      const parsed = dataUriToBuffer(t.photoData);
      if (parsed) {
        photoFileId = await createFile({ organizationId: orgId, name: `tutor-${t.id}.jpg`, mimeType: parsed.mime, data: parsed.buf });
      }
    }
    await prisma.tutor.create({
      data: {
        id: t.id,
        organizationId: orgId,
        name: t.name,
        email: t.email,
        phone: t.phone,
        photoFileId,
        color: t.color,
        hourlyPayRateCents: t.hourlyPayRate == null ? null : cents(t.hourlyPayRate),
        notes: t.notes,
        archivedAt: t.archived ? t.updatedAt : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      },
    });
  }
  console.log(`tutors: ${tutors.length}`);

  // 3. Students, accounts, guardians. Account id = student id (one account per student; v1 has no families).
  const students = await q<Record<string, any>>(`select * from "Student" where "organizationId" = $1 order by "createdAt"`, [orgId]);
  const familyIds = new Set(students.map((s) => s.familyId).filter(Boolean));
  if (familyIds.size > 0) {
    fail(`v1 has ${familyIds.size} familyIds; the one-account-per-student rule in this script does not cover them`);
  }
  const storedCredits: string[] = [];
  for (const s of students) {
    const name = `${s.firstName} ${s.lastName}`.trim();
    await prisma.account.create({
      data: { id: s.id, organizationId: orgId, name, archivedAt: s.archived ? s.updatedAt : null, createdAt: s.createdAt, updatedAt: s.updatedAt },
    });
    if (s.parentFullName || s.parentEmail || s.parentPhone) {
      await prisma.guardian.create({
        data: {
          accountId: s.id,
          name: s.parentFullName || "Parent",
          email: s.parentEmail,
          phone: s.parentPhone,
          address: s.parentAddress,
          isPrimary: true,
          isBilling: true,
          createdAt: s.createdAt,
        },
      });
    }
    if (s.emergencyContactInfo) {
      await prisma.guardian.create({
        data: { accountId: s.id, name: s.emergencyContactInfo, isEmergency: true, createdAt: s.createdAt },
      });
    }
    let photoFileId: string | null = null;
    if (s.photoData) {
      const parsed = dataUriToBuffer(s.photoData);
      if (parsed) {
        photoFileId = await createFile({ organizationId: orgId, name: `student-${s.id}.jpg`, mimeType: parsed.mime, data: parsed.buf });
      }
    }
    await prisma.student.create({
      data: {
        id: s.id,
        organizationId: orgId,
        accountId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phone: s.phone,
        dateOfBirth: s.dateOfBirth ? utcDate(s.dateOfBirth) : null,
        photoFileId,
        schoolName: s.schoolName,
        grade: s.grade,
        defaultSubject: s.subject,
        defaultPriceCents: s.pricePerLesson == null ? null : cents(s.pricePerLesson),
        difficulties: s.difficulties,
        notes: s.notes,
        archivedAt: s.archived ? s.updatedAt : null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
    if (Number(s.credit) !== 0) {
      storedCredits.push(`${name}: ${Number(s.credit).toFixed(2)}`);
    }
  }
  const studentIds = new Set(students.map((s) => s.id));
  const studentById = new Map(students.map((s) => [s.id, s] as const));
  if (storedCredits.length) {
    notes.push(
      `Student.credit column ignored (Aaron confirmed 2026-09-11 the ledger is right and this column is stale): ${storedCredits.join("; ")}`,
    );
  }
  console.log(`students: ${students.length}`);

  // 4. Library files.
  const resources = await q<Record<string, any>>(`select * from "UserResource" where "userId" = $1 order by "createdAt"`, [owner.id]);
  const resourceToFile = new Map<string, string>();
  const resourceByName = new Map<string, string>();
  for (const r of resources) {
    const fileId = await createFile({
      id: r.id,
      organizationId: orgId,
      name: fixName(r.originalName),
      mimeType: r.mimeType ?? "application/octet-stream",
      data: r.data,
      uploadedById: r.userId,
      createdAt: r.createdAt,
    });
    resourceToFile.set(r.id, fileId);
    resourceByName.set(r.originalName, fileId);
    resourceByName.set(fixName(r.originalName), fileId);
    if (fileId === r.id) {
      await prisma.libraryItem.create({ data: { fileId, createdAt: r.createdAt, updatedAt: r.updatedAt } });
    }
  }
  console.log(`library files: ${resources.length}`);

  // 5. Lesson series.
  const lessons = await q<Record<string, any>>(
    `select * from "Lesson" where "studentId" = any($1::text[]) or ("studentId" is null and "userId" = $2) order by "dateTime"`,
    [[...studentIds], owner.id],
  );
  const shells = lessons.filter((l) => !l.studentId);
  if (shells.length) warn(`${shells.length} lessons with no student were skipped`);
  const series = new Map<string, { startsAt: Date; endsOn: Date | null; frequency: string }>();
  for (const l of lessons) {
    if (!l.recurringGroupId) continue;
    const cur = series.get(l.recurringGroupId);
    const end = l.recurringEndDate ? nyDate(l.recurringEndDate) : null;
    if (!cur) {
      series.set(l.recurringGroupId, { startsAt: l.dateTime, endsOn: end, frequency: l.recurringFrequency ?? "weekly" });
    } else {
      if (l.dateTime < cur.startsAt) cur.startsAt = l.dateTime;
      if (end && (!cur.endsOn || end > cur.endsOn)) cur.endsOn = end;
    }
  }
  const rruleFor: Record<string, string> = { daily: "FREQ=DAILY", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY" };
  await prisma.lessonSeries.createMany({
    data: [...series].map(([id, s]) => ({
      id,
      organizationId: orgId,
      rrule: rruleFor[s.frequency] ?? fail(`unknown recurringFrequency ${s.frequency}`),
      startsAt: s.startsAt,
      endsOn: s.endsOn,
    })),
  });

  // 6. Lessons, seats, charges. All three rows share the v1 lesson id.
  const categoryFor: Record<string, "TUTORING" | "COLLEGE_COUNSELING"> = { Tutoring: "TUTORING", "College Counseling": "COLLEGE_COUNSELING" };
  const now = new Date();
  const lessonRows = [];
  const seatRows = [];
  const chargeRows = [];
  for (const l of lessons) {
    if (!l.studentId) continue;
    if (l.category && !categoryFor[l.category]) fail(`unknown lesson category ${l.category}`);
    let lessonNotes: string | null = l.notes ?? null;
    if (l.notesFiles) {
      try {
        const files = JSON.parse(l.notesFiles) as { fileName?: string; webViewLink?: string }[];
        const links = files.map((f) => `${f.fileName ?? "file"}: ${f.webViewLink ?? "(no link)"}`);
        if (links.length) {
          lessonNotes = [lessonNotes, `Notes files (Google Drive, from v1): ${links.join("; ")}`].filter(Boolean).join("\n");
          notes.push(`lesson ${l.id}: ${links.length} Google Drive note file link(s) kept as text`);
        }
      } catch {
        warn(`lesson ${l.id}: notesFiles is not JSON`);
      }
    }
    const status = l.dateTime <= now ? "COMPLETED" : "SCHEDULED";
    // v1 often put the student's own name in "subject"; that says nothing, so it becomes blank.
    const subjectFor = (row: Record<string, any>): string => {
      const st = row.studentId ? studentById.get(row.studentId) : null;
      const s = String(row.subject ?? "").trim();
      return st && s.toLowerCase() === `${st.firstName} ${st.lastName}`.trim().toLowerCase() ? "" : s;
    };
    lessonRows.push({
      id: l.id,
      organizationId: orgId,
      tutorId: l.tutorId ?? null,
      seriesId: l.recurringGroupId ?? null,
      startsAt: l.dateTime,
      durationMin: l.duration,
      allDay: Boolean(l.allDay),
      subject: subjectFor(l),
      category: l.category ? categoryFor[l.category] : null,
      locationType: l.locationType === "remote" ? ("REMOTE" as const) : ("IN_PERSON" as const),
      meetingLink: l.link ?? null,
      notes: lessonNotes,
      status: status as "COMPLETED" | "SCHEDULED",
      homeworkText: l.homeworkDescription ?? null,
      homeworkDueOn: l.homeworkDueDate ? utcDate(l.homeworkDueDate) : null,
      createdById: l.userId,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    });
    seatRows.push({
      id: l.id,
      lessonId: l.id,
      studentId: l.studentId,
      priceCents: cents(l.price),
      status: status as "COMPLETED" | "SCHEDULED",
      academicNotes: l.academicNotes ?? null,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    });
    chargeRows.push({
      id: l.id,
      organizationId: orgId,
      accountId: l.studentId,
      studentId: l.studentId,
      lessonStudentId: l.id,
      kind: "LESSON" as const,
      amountCents: cents(l.price),
      chargedOn: nyDate(l.dateTime),
      description: `${l.subject}, ${l.duration} min`,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    });
  }
  await inChunks(lessonRows, (c) => prisma.lesson.createMany({ data: c }));
  await inChunks(seatRows, (c) => prisma.lessonStudent.createMany({ data: c }));
  await inChunks(chargeRows, (c) => prisma.charge.createMany({ data: c }));
  const lessonIds = new Set(lessonRows.map((l) => l.id));
  console.log(`lessons: ${lessonRows.length} (${series.size} series)`);

  // 7. Payments. ADJUSTMENT rows become charges with the opposite sign.
  const payments = await q<Record<string, any>>(
    `select * from "Payment" where "studentId" = any($1::text[]) order by date, "createdAt"`,
    [[...studentIds]],
  );
  const methodFor: Record<string, string> = {
    venmo: "VENMO", zelle: "ZELLE", cash: "CASH", card: "CARD", check: "CHECK",
    bank_transfer: "BANK_TRANSFER", other: "OTHER",
  };
  const paymentRows = [];
  const adjustmentCharges = [];
  for (const p of payments) {
    if (p.familyId) fail(`payment ${p.id} has familyId; not handled`);
    if (p.type === "ADJUSTMENT") {
      adjustmentCharges.push({
        id: p.id,
        organizationId: orgId,
        accountId: p.studentId,
        studentId: p.studentId,
        kind: "ADJUSTMENT" as const,
        amountCents: -cents(p.amount),
        chargedOn: utcDate(p.date),
        description: p.notes || "Adjustment (from v1)",
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
      continue;
    }
    const raw = String(p.method ?? "other").toLowerCase();
    const method = methodFor[raw] ?? "OTHER";
    paymentRows.push({
      id: p.id,
      organizationId: orgId,
      accountId: p.studentId,
      kind: p.type as "PAYMENT" | "REFUND",
      amountCents: cents(p.amount),
      paidOn: utcDate(p.date),
      method: method as "VENMO" | "ZELLE" | "CASH" | "CARD" | "CHECK" | "BANK_TRANSFER" | "OTHER",
      reference: method === "OTHER" && raw !== "other" ? raw : null,
      notes: p.notes ?? null,
      refundReason: p.refundReason ?? null,
      taxReportedAt: p.taxReturnReportedAt ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
    if (p.type === "PAYMENT" && Number(p.amount) < 0) warn(`payment ${p.id} is a PAYMENT with a negative amount`);
    if (p.type === "REFUND" && Number(p.amount) > 0) warn(`payment ${p.id} is a REFUND with a positive amount`);
  }
  await inChunks(paymentRows, (c) => prisma.payment.createMany({ data: c }));
  await prisma.charge.createMany({ data: adjustmentCharges });
  console.log(`payments: ${paymentRows.length}, adjustments as charges: ${adjustmentCharges.length}`);

  // 8. Allocations are not copied. v1's rows carry known over-allocations, so the v2 FIFO
  //    service rebuilds them from charges and payments at the end of the import (step 18).
  const v1Links = await q<{ n: string }>(`select count(*)::text n from "LessonPayment"`);
  notes.push(`v1 had ${v1Links[0].n} LessonPayment rows; v2 allocations are rebuilt by the FIFO service instead`);

  // 9. Progress notes.
  const progress = await q<Record<string, any>>(`select * from "LessonProgress" where "studentId" = any($1::text[])`, [[...studentIds]]);
  await prisma.progressNote.createMany({
    data: progress.map((p) => ({
      id: p.id,
      studentId: p.studentId,
      lessonId: p.lessonId && lessonIds.has(p.lessonId) ? p.lessonId : null,
      notedOn: nyDate(p.lessonDate),
      note: p.progressNote ?? "",
      createdAt: p.createdAt,
    })),
  });
  const sp = await q<Record<string, any>>(`select * from "StudentProgress" where "studentId" = any($1::text[])`, [[...studentIds]]);
  for (const row of sp) {
    await prisma.student.update({ where: { id: row.studentId }, data: { lastStopNote: row.lastLessonStop, nextStartNote: row.nextLessonStart } });
  }
  console.log(`progress notes: ${progress.length}`);

  // 10. Assignments, tokens, attachments, submissions.
  const assignments = await q<Record<string, any>>(`select * from "Assignment" where "studentId" = any($1::text[]) order by "createdAt"`, [[...studentIds]]);
  const assignmentFileRows: { assignmentId: string; fileId: string }[] = [];
  const seenAF = new Set<string>();
  function addAttachment(assignmentId: string, fileId: string) {
    const k = `${assignmentId}|${fileId}`;
    if (seenAF.has(k)) return;
    seenAF.add(k);
    assignmentFileRows.push({ assignmentId, fileId });
  }
  for (const a of assignments) {
    await prisma.assignment.create({
      data: {
        id: a.id,
        organizationId: orgId,
        studentId: a.studentId,
        lessonId: a.lessonId && lessonIds.has(a.lessonId) ? a.lessonId : null,
        title: a.title,
        description: a.description,
        dueOn: a.dueDate ? utcDate(a.dueDate) : null,
        status: a.status,
        inviteSentAt: a.inviteSentAt,
        createdById: a.tutorId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      },
    });
    if (a.publicSubmissionToken) {
      await prisma.token.create({
        data: { organizationId: orgId, kind: "HOMEWORK_UPLOAD", tokenHash: sha256(Buffer.from(a.publicSubmissionToken)), subjectId: a.id, createdAt: a.createdAt },
      });
    }
    let attachments: unknown = a.libraryAttachments;
    if (typeof attachments === "string") {
      try { attachments = JSON.parse(attachments); } catch { warn(`assignment ${a.id}: libraryAttachments is not JSON`); attachments = null; }
    }
    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        let fileId: string | undefined;
        let label = "";
        if (att && typeof att === "object") {
          const o = att as { resourceId?: string; fileName?: string };
          label = o.resourceId ?? o.fileName ?? "?";
          fileId = (o.resourceId && resourceToFile.get(o.resourceId)) || (o.fileName && resourceByName.get(o.fileName)) || undefined;
        } else if (typeof att === "string") {
          label = att;
          fileId = resourceToFile.get(att) ?? resourceByName.get(att);
        }
        if (fileId) addAttachment(a.id, fileId);
        else warn(`assignment ${a.id}: attachment "${label}" does not resolve to a library file`);
      }
    }
  }
  const submissions = await q<Record<string, any>>(`select * from "Submission" where "assignmentId" = any($1::text[]) order by "submittedAt"`, [assignments.map((a) => a.id)]);
  for (const s of submissions) {
    let fileId: string | null = null;
    if (s.fileData) {
      fileId = await createFile({
        organizationId: orgId,
        name: s.fileName ?? `submission-${s.id}`,
        mimeType: s.mimeType ?? "application/octet-stream",
        data: s.fileData,
        createdAt: s.submittedAt,
      });
    } else if (s.fileUrl) {
      warn(`submission ${s.id}: only a legacy fileUrl, no bytes`);
    }
    await prisma.submission.create({
      data: { id: s.id, assignmentId: s.assignmentId, fileId, note: s.studentNote, source: s.source, submittedAt: s.submittedAt },
    });
  }
  const feedback = await q<Record<string, any>>(`select * from "Feedback" where "submissionId" = any($1::text[])`, [submissions.map((s) => s.id)]);
  for (const f of feedback) {
    await prisma.feedback.create({ data: { id: f.id, submissionId: f.submissionId, comment: f.tutorComment, score: f.score, reviewedAt: f.reviewedAt } });
  }
  const mastery = await q<Record<string, any>>(`select * from "Mastery" where "studentId" = any($1::text[])`, [[...studentIds]]);
  for (const m of mastery) {
    await prisma.mastery.create({ data: { id: m.id, studentId: m.studentId, topic: m.topic, score: m.score, notedById: m.tutorId, notedAt: m.notedAt } });
  }
  // Library files shared with a student outside any assignment become an ASSIGNED assignment named after the file.
  const shared = await q<Record<string, any>>(`select sar.*, r."originalName" from "StudentAssignedResource" sar join "UserResource" r on r.id = sar."resourceId" where sar."studentId" = any($1::text[])`, [[...studentIds]]);
  for (const s of shared) {
    const fileId = resourceToFile.get(s.resourceId);
    if (!fileId) { warn(`shared resource ${s.id}: file ${s.resourceId} not imported`); continue; }
    await prisma.assignment.create({
      data: {
        id: s.id,
        organizationId: orgId,
        studentId: s.studentId,
        title: s.fileNameSnapshot ?? s.originalName,
        description: "Shared from the library (imported from v1 without an assignment)",
        status: "ASSIGNED",
        createdById: s.tutorId,
        createdAt: s.assignedAt,
        updatedAt: s.assignedAt,
      },
    });
    addAttachment(s.id, fileId);
  }
  await prisma.assignmentFile.createMany({ data: assignmentFileRows });
  console.log(`assignments: ${assignments.length} + ${shared.length} shared files, submissions: ${submissions.length}, attachments: ${assignmentFileRows.length}`);

  // 11. Expense categories. System rows keep organizationId null.
  const categories = await q<Record<string, any>>(`select * from "Category" where "userId" is null or "userId" = $1 order by "userId" nulls first, name`, [owner.id]);
  const legacyEnumToCategory = new Map<string, string>();
  for (const c of categories) {
    await prisma.expenseCategory.create({
      data: {
        id: c.id,
        organizationId: c.userId ? orgId : null,
        name: c.name,
        defaultTaxTreatment: c.defaultTaxTreatment,
        defaultBusinessPercent: c.defaultBusinessPercent,
        scheduleCLine: c.irsLineMapping,
        archivedAt: c.deletedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      },
    });
    if (c.legacyEnum && !legacyEnumToCategory.has(c.legacyEnum)) legacyEnumToCategory.set(c.legacyEnum, c.id);
  }
  console.log(`expense categories: ${categories.length}`);

  // 12. Vendors: Vendor + FrequentVendor + names used on transactions, merged case-insensitively.
  const vendorRows = await q<Record<string, any>>(`select * from "Vendor" where "userId" = $1`, [owner.id]);
  const frequent = await q<Record<string, any>>(`select * from "FrequentVendor" where "userId" = $1`, [owner.id]);
  const txVendorNames = await q<{ vendor: string }>(`select distinct vendor from "Transaction" where "organizationId" = $1 and vendor is not null`, [orgId]);
  const vendorIdByKey = new Map<string, string>();
  const vendorData = new Map<string, Record<string, any>>();
  function vendorKey(name: string) { return name.trim().toLowerCase(); }
  for (const v of vendorRows) vendorData.set(vendorKey(v.name), { name: v.name.trim(), createdAt: v.createdAt });
  for (const f of frequent) {
    const k = vendorKey(f.vendorName);
    const cur = vendorData.get(k) ?? { name: f.vendorName.trim() };
    cur.defaultCategoryId = f.lastCategory ? legacyEnumToCategory.get(f.lastCategory) ?? null : null;
    cur.defaultTaxTreatment = f.lastTaxTreatment ?? null;
    cur.useCount = f.useCount ?? 0;
    cur.lastUsedAt = f.updatedAt;
    vendorData.set(k, cur);
  }
  for (const t of txVendorNames) {
    const k = vendorKey(t.vendor);
    if (!vendorData.has(k)) vendorData.set(k, { name: t.vendor.trim() });
  }
  for (const [k, v] of vendorData) {
    const created = await prisma.vendor.create({
      data: {
        organizationId: orgId,
        name: v.name,
        defaultCategoryId: v.defaultCategoryId ?? null,
        defaultTaxTreatment: v.defaultTaxTreatment ?? null,
        useCount: v.useCount ?? 0,
        lastUsedAt: v.lastUsedAt ?? null,
        createdAt: v.createdAt,
      },
    });
    vendorIdByKey.set(k, created.id);
  }
  console.log(`vendors: ${vendorData.size}`);

  // 13. Payment sources.
  const pms = await q<Record<string, any>>(`select * from "PaymentMethod" where "userId" = $1`, [owner.id]);
  for (const pm of pms) {
    await prisma.paymentSource.create({
      data: { id: pm.id, organizationId: orgId, name: pm.name, type: pm.type, isDefault: pm.isDefault, notes: pm.notes, createdAt: pm.createdAt, updatedAt: pm.updatedAt },
    });
  }

  // 14. Expenses. v1 kept recurring costs loosely: a new "template" row most months, instances
  // pre-generated years ahead, and for some series plain rows with no link at all. v2 has one
  // series per description and makes each instance when its day comes (runRecurring), so rows
  // dated after today are dropped and each series resumes from the first dropped date.
  const txsRaw = await q<Record<string, any>>(`select * from "Transaction" where "organizationId" = $1 order by date`, [orgId]);
  const txs: Record<string, any>[] = txsRaw.map((t) => {
    let spentOn = utcDate(t.date);
    if (spentOn.getUTCFullYear() < 100) {
      const fixed = mkDate(spentOn.getUTCFullYear() + 2000, spentOn.getUTCMonth(), spentOn.getUTCDate());
      notes.push(`expense ${t.id} (${t.description}) date ${spentOn.toISOString().slice(0, 10)} corrected to ${fixed.toISOString().slice(0, 10)}`);
      spentOn = fixed;
    }
    if (spentOn.getUTCFullYear() < 2020) fail(`expense ${t.id} has date ${spentOn.toISOString()}`);
    return { ...t, spentOn };
  });
  const seriesKey = (t: Record<string, any>) => String(t.description ?? "").trim().toLowerCase();
  const future = txs.filter((t) => t.spentOn > today);
  const seriesKeys = new Set<string>();
  for (const t of txs) if (t.isRecurring || t.recurringTemplateId || t.spentOn > today) seriesKeys.add(seriesKey(t));
  const freqFor: Record<string, "MONTHLY" | "YEARLY"> = { MONTHLY: "MONTHLY", YEARLY: "YEARLY" };
  const addPeriod = (d: Date, f: "MONTHLY" | "YEARLY") => {
    const out = new Date(d);
    if (f === "MONTHLY") out.setUTCMonth(out.getUTCMonth() + 1); else out.setUTCFullYear(out.getUTCFullYear() + 1);
    return out;
  };
  const seriesIdByKey = new Map<string, string>();
  const stopped: string[] = [];
  for (const key of seriesKeys) {
    const rows = txs.filter((t) => seriesKey(t) === key).sort((a, b) => a.spentOn.getTime() - b.spentOn.getTime());
    const past = rows.filter((t) => t.spentOn <= today);
    const ahead = rows.filter((t) => t.spentOn > today);
    const latest = past[past.length - 1] ?? rows[0];
    const template = rows.find((t) => t.isRecurring) ?? latest;
    const frequency = freqFor[template.recurringFrequency] ?? "MONTHLY";
    const endsOn = rows.map((t) => t.recurringEndDate).filter(Boolean).sort().pop();
    const recent = latest.spentOn.getTime() > today.getTime() - (frequency === "MONTHLY" ? 45 : 400) * 86400000;
    // Active only if v1 was still producing rows for it; a stale series with an old "next" date would otherwise backfill months of duplicates on the first run.
    const active = ahead.length > 0 || (recent && !(endsOn && endsOn <= now));
    if (!active) stopped.push(`${latest.description} (last ${latest.spentOn.toISOString().slice(0, 10)})`);
    await prisma.recurringExpense.create({
      data: {
        id: template.id,
        organizationId: orgId,
        description: latest.description,
        vendorId: latest.vendor ? vendorIdByKey.get(vendorKey(latest.vendor)) ?? null : null,
        categoryId: latest.categoryId ?? fail(`expense ${latest.id} has no categoryId`),
        amountCents: cents(latest.grossAmount),
        taxTreatment: latest.taxTreatment,
        businessPercent: latest.businessPercent ?? null,
        paymentSourceId: latest.paymentMethodId ?? null,
        frequency,
        nextOn: ahead[0]?.spentOn ?? addPeriod(latest.spentOn, frequency),
        endsOn: endsOn && !(ahead.length > 0 && endsOn <= now) ? utcDate(endsOn) : null,
        active,
        createdAt: template.createdAt,
        updatedAt: latest.updatedAt,
      },
    });
    seriesIdByKey.set(key, template.id);
  }
  if (future.length) notes.push(`${future.length} pre-generated future expense rows (v1 made them through ${future[future.length - 1].spentOn.toISOString().slice(0, 10)}) not imported; v2 creates each on its date`);
  notes.push(`${seriesKeys.size} recurring expense series from ${txs.filter((t) => t.isRecurring).length} v1 template rows${stopped.length ? `; marked stopped: ${stopped.join(", ")}` : ""}`);
  const expenseRows = [];
  for (const t of txs) {
    if (t.spentOn > today) continue;
    expenseRows.push({
      id: t.id,
      organizationId: orgId,
      spentOn: t.spentOn,
      description: t.description,
      vendorId: t.vendor ? vendorIdByKey.get(vendorKey(t.vendor)) ?? null : null,
      amountCents: cents(t.grossAmount),
      categoryId: t.categoryId ?? fail(`expense ${t.id} has no categoryId`),
      taxTreatment: t.taxTreatment as "BUSINESS_DIRECT" | "HOME_OFFICE_INDIRECT" | "PARTIAL_USE" | "PERSONAL",
      businessPercent: t.businessPercent ?? null,
      paymentSourceId: t.paymentMethodId ?? null,
      recurringExpenseId: seriesIdByKey.get(seriesKey(t)) ?? null,
      notes: t.notes ?? null,
      taxReportedAt: t.taxReturnReportedAt ?? null,
      createdById: t.userId,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    });
  }
  await inChunks(expenseRows, (c) => prisma.expense.createMany({ data: c }));
  console.log(`expenses: ${expenseRows.length} (${seriesKeys.size} recurring series)`);

  // 15. Tax years, one per year that has money in it.
  const years = new Set<number>();
  for (const e of expenseRows) years.add(e.spentOn.getUTCFullYear());
  for (const p of paymentRows) years.add(p.paidOn.getUTCFullYear());
  const bps = owner.homeOfficePercentage == null ? null : Math.round(Number(owner.homeOfficePercentage) * 100);
  await prisma.taxYear.createMany({
    data: [...years].sort().map((year) => ({
      organizationId: orgId,
      year,
      homeSqft: owner.homeSqft ?? null,
      officeSqft: owner.homeOfficeSqft ?? null,
      homeOfficeBasisPoints: bps,
    })),
  });

  // 16. Post-import fixes: facts v1 could not record. Kept here so every run applies them.
  //     Amounts in dollars. Descriptions carry the "[v2 fix]" marker so the verify script can
  //     tell them apart from imported rows.
  const fixes: { studentId: string; who: string; on: string; kind: "TIP" | "ADJUSTMENT"; amount: number; why: string }[] = [
    { studentId: "3d5f30d3-3196-4566-8d5a-db5e1232794b", who: "Zahar Lazarevich", on: "2026-05-19", kind: "TIP", amount: 50, why: "Tip" },
    { studentId: "46726d27-7ff7-477c-a0ce-6d2c4c1753fb", who: "Jack Weltman", on: "2026-06-23", kind: "TIP", amount: 70, why: "Tip" },
    // TEMPORARY: v1 records his 2026-06-09 refund as 80; it was 130. Fix the payment in v1, then delete this line.
    { studentId: "d2c349ac-5452-435d-b963-5730c04c5820", who: "Michail Shulkin", on: "2026-06-09", kind: "ADJUSTMENT", amount: 50, why: "Placeholder until the v1 refund of 2026-06-09 is corrected from 80 to 130" },
  ];
  for (const f of fixes) {
    if (!studentIds.has(f.studentId)) fail(`post-import fix for ${f.who}: student ${f.studentId} not found`);
    const [y, m, d] = f.on.split("-").map(Number);
    await prisma.charge.create({
      data: {
        organizationId: orgId,
        accountId: f.studentId,
        studentId: f.studentId,
        kind: f.kind,
        amountCents: cents(f.amount),
        chargedOn: mkDate(y, m - 1, d),
        description: `[v2 fix] ${f.why}`,
      },
    });
    notes.push(`post-import fix: ${f.who} ${f.kind} ${f.amount.toFixed(2)} on ${f.on} (${f.why})`);
  }

  // 16b. Account merges: siblings v1 kept apart, with the family's payments on one of them.
  //      Every student's charges and payments move into one account named for the family.
  const merges: { name: string; into: string; from: string[]; why: string }[] = [
    {
      name: "Marriott family",
      into: "85e10aae-5eab-429a-b824-6c0ccdf986d8", // Timothy
      from: ["da69d2f1-5d44-4542-bda3-46224ff59f59"], // Nina
      why: "family payments were all recorded on Timothy after Nina was split off",
    },
  ];
  for (const m of merges) {
    for (const id of [m.into, ...m.from]) {
      if (!studentIds.has(id)) fail(`account merge ${m.name}: student ${id} not found`);
    }
    await prisma.student.updateMany({ where: { id: { in: m.from } }, data: { accountId: m.into } });
    await prisma.charge.updateMany({ where: { accountId: { in: m.from } }, data: { accountId: m.into } });
    await prisma.payment.updateMany({ where: { accountId: { in: m.from } }, data: { accountId: m.into } });
    await prisma.guardian.updateMany({ where: { accountId: { in: m.from } }, data: { accountId: m.into } });
    await prisma.account.deleteMany({ where: { id: { in: m.from } } });
    await prisma.account.update({ where: { id: m.into }, data: { name: m.name, notes: `[v2 fix] merged ${m.from.length + 1} students: ${m.why}` } });
    notes.push(`post-import fix: merged ${m.from.length + 1} students into account "${m.name}" (${m.why})`);
  }

  // 17. Legacy tables: report only.
  const legacy = await q<{ t: string; n: string }>(`
    select 'HomeOfficeDeduction' t, count(*)::text n from "HomeOfficeDeduction" union all
    select 'HomeOfficeExpense', count(*)::text from "HomeOfficeExpense" union all
    select 'Deduction', count(*)::text from "Deduction" union all
    select 'HomeworkHistory', count(*)::text from "HomeworkHistory" union all
    select 'HomeworkLog', count(*)::text from "HomeworkLog" union all
    select 'EmailLog', count(*)::text from "EmailLog" union all
    select 'Settings', count(*)::text from "Settings"`);
  for (const row of legacy) {
    if (Number(row.n) > 0) notes.push(`legacy table ${row.t} has ${row.n} row(s), not imported`);
  }

  // 18. Rebuild allocations with the v2 FIFO service, after every fix and merge is in.
  const rebuilt = await rebuildOrganizationAllocations(prisma, orgId);
  const allocCount = rebuilt.reduce((s, r) => s + r.allocations, 0);
  const unallocated = rebuilt.reduce((s, r) => s + r.unallocatedCents, 0);
  console.log(`allocations rebuilt: ${allocCount} rows over ${rebuilt.length} accounts, ${(unallocated / 100).toFixed(2)} unallocated`);

  // Report.
  console.log("\n== v2 row counts");
  const counts = await prisma.$queryRawUnsafe<{ table_name: string; n: bigint }[]>(
    tables.map((t) => `select '${t.table_name}' as table_name, count(*)::bigint as n from "${t.table_name}"`).join(" union all ") + " order by 2 desc",
  );
  for (const c of counts) if (c.n > 0n) console.log(`${String(c.table_name).padEnd(18)} ${c.n}`);
  if (notes.length) { console.log("\n== notes"); for (const n of notes) console.log(`- ${n}`); }
  if (warnings.length) { console.log("\n== warnings"); for (const w of warnings) console.log(`- ${w}`); }
  console.log(`\ndone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, cutoff date ${today.toISOString().slice(0, 10)}`);
}

main()
  .catch((e) => { console.error("\nIMPORT FAILED:", e.message ?? e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await src.end(); });
