import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatDay, formatWhen } from "@/src/lib/format";
import { LEAD_LABEL, type LeadStatus } from "@/src/services/leads";
import { Badge, Card } from "@/src/components/ui";
import { Fact, RecordScreen } from "@/src/components/RecordScreen";
import { EnrollForm, LeadForm, MoveLeadForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead" };

const TONE: Record<LeadStatus, "brand" | "warn" | "credit" | "neutral" | "owed"> = { INQUIRY: "brand", CONSULT_BOOKED: "warn", TRIAL: "warn", ENROLLED: "credit", LOST: "neutral" };

/** One lead. Opens read-only; Edit shows the form. Move and enroll sit under it. */
export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string; edit?: string }> }) {
  const s = await requireMoney();
  const { id } = await params;
  const q = await searchParams;
  const [l, accounts] = await Promise.all([
    prisma.lead.findFirst({ where: { id, organizationId: s.organizationId } }),
    prisma.account.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!l) notFound();
  const back = q.returnTo?.startsWith("/") ? q.returnTo : "/leads";
  const canEdit = s.role !== "ACCOUNTANT";
  const name = `${l.studentFirstName} ${l.studentLastName}`;
  const none = <span className="text-muted">None</span>;

  const overview = (
    <Card>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Student">{name}{l.grade && <span className="text-muted">, grade {l.grade}</span>}</Fact>
        <Fact label="School">{l.schoolName || none}</Fact>
        <Fact label="Student email">{l.studentEmail || none}</Fact>
        <Fact label="How they found you">{l.source || none}</Fact>
        <Fact label="Parent">{l.parentName}</Fact>
        <Fact label="Parent email">{l.parentEmail ? <a href={`mailto:${l.parentEmail}`} className="text-brand hover:underline">{l.parentEmail}</a> : none}</Fact>
        <Fact label="Parent phone">{l.parentPhone ? <a href={`tel:${l.parentPhone}`} className="text-brand hover:underline">{l.parentPhone}</a> : none}</Fact>
        <Fact label="Added">{formatDay(l.createdAt, s.timezone)}</Fact>
        <Fact label="Wants help with" className="sm:col-span-2">{l.subjects || none}</Fact>
        {l.consultAt && <Fact label={l.status === "TRIAL" ? "Trial lesson" : "Consult"} className="sm:col-span-2">{formatWhen(l.consultAt, s.timezone)}</Fact>}
        {l.lostReason && <Fact label="Why lost" className="sm:col-span-2">{l.lostReason}</Fact>}
        {l.studentId && <Fact label="Enrolled as" className="sm:col-span-2"><Link href={`/students/${l.studentId}`} className="text-brand hover:underline">Open the student</Link></Fact>}
        <Fact label="Goals" className="sm:col-span-2 lg:col-span-4"><p className="whitespace-pre-line">{l.goals || none}</p></Fact>
        <Fact label="Notes" className="sm:col-span-2 lg:col-span-4"><p className="whitespace-pre-line">{l.notes || none}</p></Fact>
      </div>
    </Card>
  );

  return (
    <RecordScreen
      title={name}
      editTitle={`Edit ${name}`}
      back={{ href: back, label: "Back" }}
      subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={TONE[l.status]}>{LEAD_LABEL[l.status].toLowerCase()}</Badge><span>{l.parentName}</span>{l.source && <span className="text-muted">via {l.source}</span>}</span>}
      canEdit={canEdit && l.status !== "ENROLLED"}
      defaultEditing={q.edit === "1"}
      overview={overview}
      form={
        <Card>
          <LeadForm returnTo={back} lead={{ id: l.id, studentFirstName: l.studentFirstName, studentLastName: l.studentLastName, grade: l.grade ?? "", schoolName: l.schoolName ?? "", studentEmail: l.studentEmail ?? "", studentPhone: l.studentPhone ?? "", parentName: l.parentName, parentEmail: l.parentEmail ?? "", parentPhone: l.parentPhone ?? "", subjects: l.subjects ?? "", goals: l.goals ?? "", source: l.source ?? "", notes: l.notes ?? "" }} />
        </Card>
      }
    >
      {canEdit && l.status !== "ENROLLED" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Move along" description="Book the consult or trial, or mark it lost with a reason."><MoveLeadForm leadId={l.id} status={l.status} /></Card>
          <Card title="Enroll" description="Makes the student and, unless you pick a family, a new account."><EnrollForm leadId={l.id} accounts={accounts} /></Card>
        </div>
      )}
    </RecordScreen>
  );
}
