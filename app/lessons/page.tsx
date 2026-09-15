import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { formatCents, formatDay, formatWhen } from "@/src/lib/format";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { LessonFilters } from "./LessonFilters";
import { LessonRowActions } from "./LessonRowActions";
import { RowLinks } from "@/src/components/RowLinks";

export const dynamic = "force-dynamic";

const STATUS_TONE = { SCHEDULED: "brand", COMPLETED: "credit", CANCELLED: "owed", NO_SHOW: "warn" } as const;
const STATUS_LABEL = { SCHEDULED: "scheduled", COMPLETED: "taught", CANCELLED: "cancelled", NO_SHOW: "no-show" } as const;
const LIMIT = 400;

/**
 * Every lesson this login can see, as a list. A tutor sees their own; everyone
 * else sees the school's. Narrowed by tutor and student, and by when: coming
 * up, already past, or all of them. Any column heading sorts.
 */
export default async function LessonsPage({ searchParams }: { searchParams: Promise<{ when?: string; tutor?: string; student?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const scope = tutorScope(s);
  const when = q.when === "past" || q.when === "all" ? q.when : "upcoming";
  const tutor = scope ? "" : q.tutor ?? "";
  const student = q.student ?? "";
  const now = new Date();
  const tutorWhere = scope ? { tutorId: scope } : tutor === "none" ? { tutorId: null } : tutor ? { tutorId: tutor } : {};
  const [lessons, tutors, students] = await Promise.all([
    prisma.lesson.findMany({
      where: {
        organizationId: s.organizationId,
        deletedAt: null,
        ...tutorWhere,
        ...(student ? { students: { some: { studentId: student } } } : {}),
        ...(when === "upcoming" ? { startsAt: { gte: now } } : when === "past" ? { startsAt: { lt: now } } : {}),
      },
      orderBy: { startsAt: when === "upcoming" ? "asc" : "desc" },
      take: LIMIT + 1,
      select: {
        id: true, startsAt: true, durationMin: true, allDay: true, subject: true, status: true, seriesId: true, locationType: true,
        tutor: { select: { name: true } },
        students: { select: { studentId: true, priceCents: true, student: { select: { firstName: true, lastName: true } } } },
        _count: { select: { sessionNotes: true, assignments: true } },
      },
    }),
    scope ? Promise.resolve([]) : prisma.tutor.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.student.findMany({
      where: { organizationId: s.organizationId, deletedAt: null, OR: [{ archivedAt: null }, { id: student || "" }], ...(scope ? { lessons: { some: { lesson: { tutorId: scope, deletedAt: null } } } } : {}) },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  const more = lessons.length > LIMIT;
  const rows = more ? lessons.slice(0, LIMIT) : lessons;
  const tz = s.timezone;
  const tabs: [string, string][] = [["upcoming", "Coming up"], ["past", "Past"], ["all", "All"]];
  const query = (w: string) => {
    const p = new URLSearchParams();
    if (w !== "upcoming") p.set("when", w);
    if (tutor) p.set("tutor", tutor);
    if (student) p.set("student", student);
    const str = p.toString();
    return `/lessons${str ? `?${str}` : ""}`;
  };
  const here = encodeURIComponent(query(when));
  const canWrite = s.role !== "ACCOUNTANT";
  const total = rows.reduce((sum, l) => sum + l.students.reduce((x, st) => x + st.priceCents, 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lessons"
        subtitle={`${rows.length}${more ? "+" : ""} ${when === "upcoming" ? "coming up" : when === "past" ? "past" : "in all"}${rows.length ? `, ${formatCents(total)}` : ""}${scope ? ", yours" : ""}`}
        actions={canWrite && <LinkButton href={`/lessons/new?returnTo=${here}${student ? `&student=${student}` : ""}`} variant="primary"><Plus aria-hidden />New lesson</LinkButton>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="When">
          {tabs.map(([v, label]) => (
            <Link key={v} href={query(v)} aria-current={when === v ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${when === v ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>{label}</Link>
          ))}
        </nav>
        <LessonFilters
          tutors={tutors}
          students={students.map((st) => ({ id: st.id, name: `${st.firstName} ${st.lastName}` }))}
          tutor={tutor}
          student={students.some((st) => st.id === student) ? student : ""}
          when={when}
        />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty action={canWrite && <LinkButton href={`/lessons/new?returnTo=${here}`} variant="primary"><Plus aria-hidden />New lesson</LinkButton>}>
            {when === "upcoming" ? "Nothing booked that matches." : "No lessons match."}
          </Empty>
        ) : (
          <RowLinks>
          <TableWrap>
            <Table data-testid="lessons">
              <thead>
                <tr><Th>When</Th><Th>Student</Th><Th>Subject</Th>{!scope && <Th className="hidden lg:table-cell">Tutor</Th>}<Th right>Price</Th><Th>Status</Th><Th className="hidden xl:table-cell">Note</Th><Th></Th></tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const names = l.students.map((st) => `${st.student.firstName} ${st.student.lastName}`);
                  const price = l.students.reduce((x, st) => x + st.priceCents, 0);
                  const off = l.status === "CANCELLED" || l.status === "NO_SHOW";
                  return (
                    <tr key={l.id} data-href={`/lessons/${l.id}?returnTo=${here}`} className="hover:bg-surface-2">
                      <Td num>
                        <Link href={`/lessons/${l.id}?returnTo=${here}`} className={`underline-offset-2 hover:text-brand hover:underline ${off ? "text-muted line-through" : "text-fg"}`}>{formatWhen(l.startsAt, tz)}</Link>
                        <span className="ml-1.5 text-xs text-muted">· {l.allDay ? "all day" : `${l.durationMin} min`}{l.seriesId && <span className="text-faint" title="Part of a weekly series">, weekly</span>}</span>
                      </Td>
                      <Td>
                        {names.length === 0 ? <span className="text-muted">Event</span> : names.map((n, i) => (
                          <span key={l.students[i].studentId}>{i > 0 && ", "}<Link href={`/students/${l.students[i].studentId}`} className="text-fg underline-offset-2 hover:text-brand hover:underline">{n}</Link></span>
                        ))}
                      </Td>
                      <Td><Link href={`/lessons/${l.id}?returnTo=${here}`} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{l.subject}</Link>{l.locationType === "REMOTE" && <span className="ml-1.5 text-xs text-muted">remote</span>}</Td>
                      {!scope && <Td className="hidden lg:table-cell">{l.tutor?.name ?? <span className="text-muted">none</span>}</Td>}
                      <Td right num>{names.length ? formatCents(price) : <span className="text-muted">none</span>}</Td>
                      <Td><Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge></Td>
                      <Td className="hidden xl:table-cell" data-sort={names.length === 0 ? "" : l._count.sessionNotes >= l.students.length ? "2 written" : l._count.sessionNotes > 0 ? "1 partly" : "0 none"}>
                        {names.length > 0 && (l._count.sessionNotes >= l.students.length ? <span className="text-credit">written</span> : l._count.sessionNotes > 0 ? <span className="text-warn">partly</span> : l.status === "COMPLETED" ? <Link href={`/notes/new?lesson=${l.id}&student=${l.students[0].studentId}&returnTo=${here}`} className="text-brand hover:underline">write</Link> : <span className="text-faint">none</span>)}
                      </Td>
                      <Td right className="whitespace-nowrap">
                        <LessonRowActions id={l.id} what={`${names[0] ?? l.subject}, ${formatDay(l.startsAt, tz)}`} studentId={l.students[0]?.studentId ?? ""} inSeries={l.seriesId !== null} cancelled={off} canWrite={canWrite} here={here} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
          </RowLinks>
        )}
        {more && <p className="mt-3 text-xs text-muted">Showing the first {LIMIT}. Narrow by tutor or student to see the rest.</p>}
      </Card>
    </div>
  );
}
