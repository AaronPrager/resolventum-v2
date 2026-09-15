import Link from "next/link";
import { FileDown, Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { archiveCandidates, listStudents } from "@/src/services/students";
import { Empty, LinkButton, PageHeader } from "@/src/components/ui";
import { StudentPanel } from "./StudentPanel";
import { StudentPicker } from "./StudentPicker";

export const dynamic = "force-dynamic";

/**
 * One page for working with students: pick one from the drop-down and the
 * page shows their lessons, notes, homework, and contacts. ?s= is the pick.
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ status?: string; quiet?: string; s?: string }> }) {
  const q = await searchParams;
  const session = await requireSession();
  const [all, quietRows] = await Promise.all([
    listStudents(prisma, session.organizationId, localDateOnly(new Date(), session.organizationTimezone), { includeArchived: true, tutorId: tutorScope(session) }),
    archiveCandidates(prisma, session.organizationId),
  ]);
  // Quiet: active students with no lesson in 60 days and nothing booked, the dashboard's "nothing going on".
  const quietIds = new Set(quietRows.map((r) => r.id));
  const quiet = q.quiet === "1";
  const status = !quiet && (q.status === "PAUSED" || q.status === "ACTIVE" || q.status === "ARCHIVED") ? q.status : null;
  const state = (r: (typeof all)[number]) => (r.archived ? "ARCHIVED" : r.status);
  // All means everyone still on the books; archived students have their own tab.
  // The picker reads by first name; the list service sorts by last name for the tables elsewhere.
  const rows = (quiet ? all.filter((r) => quietIds.has(r.id)) : status ? all.filter((r) => state(r) === status) : all.filter((r) => !r.archived)).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const counts = { ACTIVE: all.filter((r) => state(r) === "ACTIVE").length, PAUSED: all.filter((r) => state(r) === "PAUSED").length, ARCHIVED: all.filter((r) => r.archived).length };
  const mine = session.role === "TUTOR" && session.tutorId;
  const money = session.role !== "TUTOR";
  const selected = rows.find((r) => r.id === q.s)?.id ?? rows[0]?.id ?? null;
  const keep = [quiet ? "quiet=1" : status ? `status=${status}` : ""].filter(Boolean);
  const current = quiet ? "QUIET" : status ?? "";
  const tabs: [string, string][] = [["", "All"], ["ACTIVE", "Active"], ["PAUSED", "Paused"], ["ARCHIVED", "Archived"], ...(quietIds.size > 0 || quiet ? [["QUIET", `Quiet (${quietIds.size})`] as [string, string]] : [])];

  return (
    <div className="space-y-5">
      <PageHeader
        title={mine ? "My students" : "Students"}
        subtitle={`${counts.ACTIVE} active${counts.PAUSED ? `, ${counts.PAUSED} paused` : ""}${counts.ARCHIVED ? `, ${counts.ARCHIVED} archived` : ""}${money ? ". Balance is the account's, so siblings share one." : ""}`}
        actions={<>
          <div className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-surface-3 p-0.5" role="group" aria-label="Status">
            {tabs.map(([v, label]) => (
              <Link key={v} href={`/students${v === "QUIET" ? "?quiet=1" : v ? `?status=${v}` : ""}`} aria-current={current === v ? "page" : undefined} className={`inline-flex h-8 items-center rounded-md px-3 text-sm ${current === v ? "bg-surface font-medium text-fg shadow-xs" : "text-muted hover:text-fg"}`}>{label}</Link>
            ))}
          </div>
          {!mine && <a href="/api/export?what=students" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2" title="Every student as a spreadsheet"><FileDown className="size-4" aria-hidden />CSV</a>}
          {session.role !== "ACCOUNTANT" && <LinkButton href="/students/new" variant="primary"><Plus aria-hidden />Add student</LinkButton>}
        </>}
      />

      {rows.length === 0 ? <Empty>{quiet ? "Nobody is quiet. Every active student has had a lesson lately or has one booked." : "No students here."}</Empty> : (
        <>
          <StudentPicker
            selected={selected}
            keep={keep.join("&")}
            students={rows.map((s) => ({ id: s.id, label: state(s) !== "ACTIVE" ? `${s.name} (${state(s).toLowerCase()})` : s.name }))}
          />
          {selected && <StudentPanel id={selected} session={session} />}
        </>
      )}
    </div>
  );
}
