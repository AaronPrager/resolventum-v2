import Link from "next/link";
import { formatCents, formatWhen } from "@/src/lib/format";
import type { studentDetail } from "@/src/services/students";
import { Badge, Button, Empty, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { cancelLessonAction, restoreLessonAction } from "@/app/lessons/actions";

export type Seat = NonNullable<Awaited<ReturnType<typeof studentDetail>>>["student"]["lessons"][number];

/** Every lesson of one student as a table: when, subject, tutor, price, status, and Edit, Cancel, or Restore. `back` is where those return to; `more` shows every row. */
export function LessonTable({ title, rows, hidden, tz, studentId, testId, noted, back, more }: { title: string; rows: Seat[]; hidden: number; tz: string; studentId: string; testId: string; noted: Set<string>; back: string; more: string }) {
  const returnTo = encodeURIComponent(back);
  return (
    <section className="min-w-0">
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{title}</h3>
        {hidden > 0 && <Link href={more} className="text-xs text-brand hover:underline">Show all ({hidden} more)</Link>}
      </header>
      {rows.length === 0 ? <Empty>None.</Empty> : (
        <TableWrap>
          <Table data-testid={testId}>
            <thead><tr><Th>When</Th><Th className="hidden sm:table-cell">Subject</Th><Th className="hidden md:table-cell">Tutor</Th><Th right>Price</Th><Th className="hidden sm:table-cell">Status</Th><Th></Th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const cancelled = s.lesson.status === "CANCELLED" || s.lesson.status === "NO_SHOW";
                const needsNote = s.lesson.status === "COMPLETED" && !noted.has(s.lesson.id);
                return (
                  <tr key={s.id} className={`hover:bg-surface-2 ${cancelled ? "text-muted line-through" : ""}`}>
                    <Td num><Link href={`/lessons/${s.lesson.id}?returnTo=${returnTo}`} className="underline-offset-2 hover:text-brand hover:underline">{formatWhen(s.lesson.startsAt, tz)}</Link><span className="hidden text-muted sm:inline"> · {s.lesson.durationMin} min</span></Td>
                    <Td className="hidden sm:table-cell">{s.lesson.subject}{s.lesson.locationType === "REMOTE" && <span className="ml-1 text-xs text-muted">remote</span>}{s.lesson.seriesId && <span className="ml-1 text-xs text-muted">weekly</span>}</Td>
                    <Td className="hidden md:table-cell">{s.lesson.tutor?.name ?? ""}</Td>
                    <Td right num>{formatCents(s.priceCents)}{s.charge?.voidedAt && <span className="ml-1 text-xs no-underline">not charged</span>}</Td>
                    <Td className="hidden sm:table-cell"><span className="no-underline"><Badge tone={s.lesson.status === "CANCELLED" ? "owed" : s.lesson.status === "NO_SHOW" ? "warn" : s.lesson.status === "COMPLETED" ? "neutral" : "brand"}>{s.lesson.status.toLowerCase().replace("_", " ")}</Badge></span></Td>
                    <Td right>
                      <span className="inline-flex gap-3 no-underline">
                        {needsNote && <Link href={`/notes/new?lesson=${s.lesson.id}&student=${studentId}&returnTo=${returnTo}`} className="text-warn hover:underline">Note</Link>}
                        <Link href={`/lessons/${s.lesson.id}?returnTo=${returnTo}`} className="hidden text-brand hover:underline sm:inline">Edit</Link>
                        {cancelled ? (
                          <form action={restoreLessonAction} className="inline">
                            <input type="hidden" name="lessonId" value={s.lesson.id} /><input type="hidden" name="studentId" value={studentId} />
                            <Button variant="link">Restore</Button>
                          </form>
                        ) : (
                          <ConfirmForm action={cancelLessonAction} className="inline" message="Cancel this lesson? The charge is voided and the balance changes. You can restore it later.">
                            <input type="hidden" name="lessonId" value={s.lesson.id} /><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="reason" value="Cancelled" /><input type="hidden" name="chargeMode" value="waive" /><input type="hidden" name="returnTo" value={back} />
                            <Button variant="link" className="text-owed">Cancel</Button>
                          </ConfirmForm>
                        )}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}
