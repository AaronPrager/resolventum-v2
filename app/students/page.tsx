import Link from "next/link";
import { FileDown, Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { listStudents } from "@/src/services/students";
import { Empty, LinkButton, PageHeader } from "@/src/components/ui";
import { StudentPanel } from "./StudentPanel";
import { StudentPicker } from "./StudentPicker";

export const dynamic = "force-dynamic";

/**
 * One page for working with students: pick one from the drop-down and the
 * page shows their lessons, notes, homework, and contacts. ?s= is the pick.
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ archived?: string; status?: string; s?: string }> }) {
  const q = await searchParams;
  const includeArchived = q.archived === "1";
  const session = await requireSession();
  const all = await listStudents(prisma, session.organizationId, localDateOnly(new Date(), session.organizationTimezone), { includeArchived, tutorId: tutorScope(session) });
  const status = q.status === "PAUSED" || q.status === "GRADUATED" || q.status === "ACTIVE" ? q.status : null;
  // The picker reads by first name; the list service sorts by last name for the tables elsewhere.
  const rows = (status ? all.filter((r) => r.status === status) : all).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const counts = { ACTIVE: all.filter((r) => r.status === "ACTIVE" && !r.archived).length, PAUSED: all.filter((r) => r.status === "PAUSED").length, GRADUATED: all.filter((r) => r.status === "GRADUATED").length };
  const mine = session.role === "TUTOR" && session.tutorId;
  const money = session.role !== "TUTOR";
  const selected = rows.find((r) => r.id === q.s)?.id ?? rows[0]?.id ?? null;
  const keep = [includeArchived ? "archived=1" : "", status ? `status=${status}` : ""].filter(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title={mine ? "My students" : "Students"}
        subtitle={`${counts.ACTIVE} active${counts.PAUSED ? `, ${counts.PAUSED} paused` : ""}${counts.GRADUATED ? `, ${counts.GRADUATED} graduated` : ""}${money ? ". Balance is the account's, so siblings share one." : ""}`}
        actions={<>
          {(counts.PAUSED > 0 || counts.GRADUATED > 0 || status) && (
            <div className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-surface-3 p-0.5" role="group" aria-label="Status">
              {([["", "All"], ["ACTIVE", "Active"], ["PAUSED", "Paused"], ["GRADUATED", "Graduated"]] as const).map(([v, label]) => (
                <Link key={v} href={`/students?${[includeArchived ? "archived=1" : "", v ? `status=${v}` : ""].filter(Boolean).join("&")}`} aria-current={(status ?? "") === v ? "page" : undefined} className={`inline-flex h-8 items-center rounded-md px-3 text-sm ${(status ?? "") === v ? "bg-surface font-medium text-fg shadow-xs" : "text-muted hover:text-fg"}`}>{label}</Link>
              ))}
            </div>
          )}
          <LinkButton href={includeArchived ? "/students" : "/students?archived=1"} variant="secondary">{includeArchived ? "Hide archived" : "Show archived"}</LinkButton>
          {!mine && <a href="/api/export?what=students" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every student as a spreadsheet"><FileDown className="size-4" aria-hidden />CSV</a>}
          {session.role !== "ACCOUNTANT" && <LinkButton href="/students/new" variant="primary"><Plus aria-hidden />Add student</LinkButton>}
        </>}
      />

      {rows.length === 0 ? <Empty>No students here.</Empty> : (
        <>
          <StudentPicker
            selected={selected}
            keep={keep.join("&")}
            students={rows.map((s) => ({ id: s.id, label: [s.name, s.status !== "ACTIVE" && `(${s.status.toLowerCase()})`, s.archived && "(archived)"].filter(Boolean).join(" ") }))}
          />
          {selected && <StudentPanel id={selected} session={session} />}
        </>
      )}
    </div>
  );
}
