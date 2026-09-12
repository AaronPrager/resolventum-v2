import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { balanceClass, balanceText, formatCents, formatDay, formatWhen, localDateStr, localTimeStr } from "@/src/lib/format";
import { studentDetail } from "@/src/services/students";
import { accountBalances } from "@/src/services/balances";
import { LessonForm } from "@/app/lessons/LessonForm";
import { cancelLessonAction, createLessonAction, restoreLessonAction } from "@/app/lessons/actions";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await studentDetail(prisma, id);
  if (!detail) notFound();
  const { student, tutors } = detail;
  const tz = student.organization.timezone;
  const balances = await accountBalances(prisma, student.organization.id, new Date());
  const balance = balances.find((b) => b.accountId === student.accountId)?.balanceCents ?? 0;
  const now = new Date();
  const upcoming = student.lessons.filter((l) => l.lesson.startsAt > now).reverse();
  const past = student.lessons.filter((l) => l.lesson.startsAt <= now);
  const nextSlot = new Date(now.getTime() + 24 * 3600 * 1000);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/students" className="text-sm text-blue-700 hover:underline">Students</Link>
        <h1 className="mt-1 text-xl font-semibold">{student.firstName} {student.lastName}{student.archivedAt && <span className="ml-2 text-sm font-normal text-gray-500">archived</span>}</h1>
        <p className="text-sm text-gray-600">
          {[student.grade && `Grade ${student.grade}`, student.schoolName, student.defaultSubject].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <h2 className="font-semibold">Account</h2>
          <p><Link href={`/accounts/${student.accountId}`} className="text-blue-700 hover:underline">{student.account.name}</Link>
            {student.account.students.length > 1 && <span className="text-gray-500"> · {student.account.students.map((s) => s.firstName).join(", ")}</span>}
          </p>
          <p className={`tabular-nums ${balanceClass(balance)}`}>{balanceText(balance)}</p>
          {student.defaultPriceCents != null && <p className="text-gray-600">Usual price {formatCents(student.defaultPriceCents)}</p>}
        </div>
        <div className="space-y-1 text-sm">
          <h2 className="font-semibold">Contacts</h2>
          {student.email && <p>{student.email}{student.phone && ` · ${student.phone}`}</p>}
          {student.account.guardians.map((g) => (
            <p key={g.id}>
              <span className="text-gray-500">{g.isEmergency ? "Emergency: " : g.isPrimary ? "Parent: " : ""}</span>
              {g.name}{g.email && ` · ${g.email}`}{g.phone && ` · ${g.phone}`}
            </p>
          ))}
          {student.account.guardians.length === 0 && !student.email && <p className="text-gray-500">None on file.</p>}
        </div>
      </section>

      {(student.lastStopNote || student.nextStartNote || student.difficulties || student.notes) && (
        <section className="space-y-1 text-sm">
          <h2 className="font-semibold">Notes</h2>
          {student.lastStopNote && <p><span className="text-gray-500">Stopped at: </span>{student.lastStopNote}</p>}
          {student.nextStartNote && <p><span className="text-gray-500">Start next: </span>{student.nextStartNote}</p>}
          {student.difficulties && <p><span className="text-gray-500">Difficulties: </span>{student.difficulties}</p>}
          {student.notes && <p className="whitespace-pre-line">{student.notes}</p>}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">New lesson</h2>
        <LessonForm
          action={createLessonAction}
          studentId={student.id}
          tutors={tutors}
          submitLabel="Add lesson"
          initial={{
            date: localDateStr(nextSlot, tz),
            time: "16:00",
            durationMin: 60,
            subject: student.defaultSubject ?? "",
            price: student.defaultPriceCents != null ? (student.defaultPriceCents / 100).toFixed(2) : "",
            tutorId: tutors.length === 1 ? tutors[0].id : "",
            locationType: "IN_PERSON",
            meetingLink: "",
            notes: "",
            category: "",
          }}
        />
      </section>

      <LessonTable title={`Upcoming (${upcoming.length})`} rows={upcoming} tz={tz} studentId={student.id} testId="upcoming" />
      <LessonTable title={`Past (${past.length})`} rows={past} tz={tz} studentId={student.id} testId="past" />

      {student.progressNotes.length > 0 && (
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold">Progress notes</h2>
          {student.progressNotes.map((n) => (
            <p key={n.id}><span className="text-gray-500 tabular-nums">{n.notedOn.toISOString().slice(0, 10)}</span> {n.note}</p>
          ))}
        </section>
      )}

      {student.assignments.length > 0 && (
        <section className="space-y-2 text-sm">
          <h2 className="font-semibold">Homework</h2>
          {student.assignments.map((a) => (
            <p key={a.id}>
              <span className="text-gray-500 tabular-nums">{a.dueOn ? a.dueOn.toISOString().slice(0, 10) : "no due date"}</span> {a.title}
              <span className="ml-2 rounded bg-gray-100 px-1.5 text-xs">{a.status.toLowerCase()}</span>
              {a._count.submissions > 0 && <span className="ml-2 text-xs text-gray-500">{a._count.submissions} submitted</span>}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

type Seat = NonNullable<Awaited<ReturnType<typeof studentDetail>>>["student"]["lessons"][number];

function LessonTable({ title, rows, tz, studentId, testId }: { title: string; rows: Seat[]; tz: string; studentId: string; testId: string }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
        <table className="w-full text-sm" data-testid={testId}>
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Subject</th>
              <th className="py-2 pr-4 font-medium">Tutor</th>
              <th className="py-2 pr-4 text-right font-medium">Price</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const cancelled = s.lesson.status === "CANCELLED";
              return (
                <tr key={s.id} className={`border-b border-gray-100 align-top ${cancelled ? "text-gray-400 line-through" : ""}`}>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatWhen(s.lesson.startsAt, tz)}<span className="text-gray-500"> · {s.lesson.durationMin} min</span></td>
                  <td className="py-2 pr-4">{s.lesson.subject}{s.lesson.locationType === "REMOTE" && <span className="ml-1 text-xs text-gray-500">remote</span>}</td>
                  <td className="py-2 pr-4">{s.lesson.tutor?.name ?? ""}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatCents(s.priceCents)}{s.charge?.voidedAt && <span className="ml-1 text-xs no-underline">not charged</span>}</td>
                  <td className="py-2 pr-4">{s.lesson.status.toLowerCase()}</td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <span className="inline-flex gap-2 no-underline">
                      <Link href={`/lessons/${s.lesson.id}`} className="text-blue-700 hover:underline">Edit</Link>
                      {cancelled ? (
                        <form action={restoreLessonAction} className="inline">
                          <input type="hidden" name="lessonId" value={s.lesson.id} />
                          <input type="hidden" name="studentId" value={studentId} />
                          <button className="text-blue-700 hover:underline">Restore</button>
                        </form>
                      ) : (
                        <form action={cancelLessonAction} className="inline">
                          <input type="hidden" name="lessonId" value={s.lesson.id} />
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="reason" value="Cancelled" />
                          <button className="text-red-700 hover:underline">Cancel</button>
                        </form>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
