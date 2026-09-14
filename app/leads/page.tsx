import Link from "next/link";
import { FileDown } from "lucide-react";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatWhen } from "@/src/lib/format";
import { LEAD_LABEL, type LeadStatus, listLeads } from "@/src/services/leads";
import { Badge, Button, Card, Empty, LinkButton, PageHeader } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { deleteLeadAction } from "./actions";
import { EnrollForm, LeadForm, MoveLeadForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

const OPEN: LeadStatus[] = ["INQUIRY", "CONSULT_BOOKED", "TRIAL"];
const TONE: Record<LeadStatus, "brand" | "warn" | "credit" | "neutral" | "owed"> = { INQUIRY: "brand", CONSULT_BOOKED: "warn", TRIAL: "warn", ENROLLED: "credit", LOST: "neutral" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const s = await requireMoney();
  const q = await searchParams;
  const closed = q.closed === "1";
  const [leads, accounts] = await Promise.all([
    listLeads(prisma, s.organizationId, { includeClosed: closed }),
    prisma.account.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const canEdit = s.role !== "ACCOUNTANT";
  const byStage = (st: LeadStatus) => leads.filter((l) => l.status === st);
  const stages: LeadStatus[] = closed ? [...OPEN, "ENROLLED", "LOST"] : OPEN;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle={`${OPEN.reduce((n, st) => n + byStage(st).length, 0)} open. Inquiry, consult, trial, then enroll or say why not. The sign-up link under Office lands here.`}
        actions={<><LinkButton href={closed ? "/leads" : "/leads?closed=1"} variant="secondary">{closed ? "Open only" : "Show enrolled and lost"}</LinkButton><a href="/api/export?what=leads" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2"><FileDown className="size-4" aria-hidden />CSV</a></>}
      />
      {canEdit && (
        <details className="group rounded-xl border border-line bg-surface shadow-xs [&[open]>summary]:border-b [&[open]>summary]:border-line">
          <summary className="cursor-pointer list-none px-4 py-3 text-[15px] font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">+ New lead</summary>
          <div className="p-4 sm:p-5"><LeadForm /></div>
        </details>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {stages.map((st) => (
          <Card key={st} title={<span className="inline-flex items-center gap-2">{LEAD_LABEL[st]}<span className="text-xs font-normal text-muted">{byStage(st).length}</span></span>} className={OPEN.includes(st) ? "" : "lg:col-span-3"}>
            {byStage(st).length === 0 ? <Empty>None.</Empty> : (
              <ul className="space-y-3" data-testid={`stage-${st}`}>
                {byStage(st).map((l) => (
                  <li key={l.id} className="rounded-lg border border-line bg-surface-2/50 p-3 text-sm">
                    <details className="group">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{l.studentFirstName} {l.studentLastName}</span>
                          {l.grade && <span className="text-muted">grade {l.grade}</span>}
                          <Badge tone={TONE[l.status]}>{LEAD_LABEL[l.status].toLowerCase()}</Badge>
                          {l.source && <span className="text-xs text-muted">via {l.source}</span>}
                        </div>
                        <div className="mt-1 text-muted">{l.parentName}{l.parentEmail && ` · ${l.parentEmail}`}{l.parentPhone && ` · ${l.parentPhone}`}</div>
                        {l.subjects && <div className="mt-1">{l.subjects}</div>}
                        {l.consultAt && (l.status === "CONSULT_BOOKED" || l.status === "TRIAL") && <div className="mt-1 text-xs text-brand">{formatWhen(l.consultAt, s.timezone)}</div>}
                        {l.lostReason && <div className="mt-1 text-xs text-muted">Lost: {l.lostReason}</div>}
                        {l.studentId && <div className="mt-1 text-xs"><Link href={`/students/${l.studentId}`} className="text-brand hover:underline">Open the student</Link></div>}
                        <div className="mt-1 text-xs text-muted group-open:hidden">{canEdit ? "Open to move, enroll, or edit" : ""}</div>
                      </summary>
                      {canEdit && (
                        <div className="mt-3 space-y-4 border-t border-line pt-3">
                          {l.status !== "ENROLLED" && <MoveLeadForm leadId={l.id} status={l.status} />}
                          {l.status !== "ENROLLED" && <EnrollForm leadId={l.id} accounts={accounts} />}
                          <details>
                            <summary className="cursor-pointer text-xs text-brand">Edit details</summary>
                            <div className="mt-2"><LeadForm lead={{ id: l.id, studentFirstName: l.studentFirstName, studentLastName: l.studentLastName, grade: l.grade ?? "", schoolName: l.schoolName ?? "", studentEmail: l.studentEmail ?? "", studentPhone: l.studentPhone ?? "", parentName: l.parentName, parentEmail: l.parentEmail ?? "", parentPhone: l.parentPhone ?? "", subjects: l.subjects ?? "", goals: l.goals ?? "", source: l.source ?? "", notes: l.notes ?? "" }} /></div>
                          </details>
                          <ConfirmForm action={deleteLeadAction} message={`Delete the lead for ${l.studentFirstName} ${l.studentLastName}? This cannot be undone.`}>
                            <input type="hidden" name="leadId" value={l.id} />
                            <Button variant="link" className="text-xs text-owed">Delete lead</Button>
                          </ConfirmForm>
                        </div>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
