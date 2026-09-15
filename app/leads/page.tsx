import Link from "next/link";
import { FileDown, Plus } from "lucide-react";
import { prisma } from "@/src/db";
import { requireMoney } from "@/src/auth/current";
import { formatDay, formatWhen } from "@/src/lib/format";
import { LEAD_LABEL, type LeadStatus, listLeads } from "@/src/services/leads";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { RowLinks } from "@/src/components/RowLinks";
import { LeadRowActions } from "./LeadRowActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

const OPEN: LeadStatus[] = ["INQUIRY", "CONSULT_BOOKED", "TRIAL"];
const TONE: Record<LeadStatus, "brand" | "warn" | "credit" | "neutral" | "owed"> = { INQUIRY: "brand", CONSULT_BOOKED: "warn", TRIAL: "warn", ENROLLED: "credit", LOST: "neutral" };

/**
 * Every family who asked about lessons, one line each. Open ones by default;
 * the tabs narrow to a stage or show the enrolled and lost too. A row opens
 * the lead, where it is moved along or enrolled.
 */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ show?: string; closed?: string }> }) {
  const s = await requireMoney();
  const q = await searchParams;
  const show = q.closed === "1" ? "all" : (["all", ...OPEN, "ENROLLED", "LOST"] as string[]).includes(q.show ?? "") ? (q.show as string) : "open";
  const leads = await listLeads(prisma, s.organizationId, { includeClosed: true });
  const rows = show === "open" ? leads.filter((l) => OPEN.includes(l.status)) : show === "all" ? leads : leads.filter((l) => l.status === show);
  const count = (st: LeadStatus) => leads.filter((l) => l.status === st).length;
  const openCount = OPEN.reduce((n, st) => n + count(st), 0);
  const tabs: [string, string][] = [["open", `Open (${openCount})`], ...OPEN.map((st): [string, string] => [st, `${LEAD_LABEL[st]} (${count(st)})`]), ["ENROLLED", `Enrolled (${count("ENROLLED")})`], ["LOST", `Lost (${count("LOST")})`], ["all", `All (${leads.length})`]];
  const listHref = show === "open" ? "/leads" : `/leads?show=${show}`;
  const here = encodeURIComponent(listHref);
  const canEdit = s.role !== "ACCOUNTANT";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle={`${openCount} open. Inquiry, consult, trial, then enroll or say why not. The sign-up link under Office lands here.`}
        actions={<>
          <a href="/api/export?what=leads" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2"><FileDown className="size-4" aria-hidden />CSV</a>
          {canEdit && <LinkButton href={`/leads/new?returnTo=${here}`} variant="primary"><Plus aria-hidden />New lead</LinkButton>}
        </>}
      />
      <nav className="flex flex-wrap gap-1 text-sm" aria-label="Stage">
        {tabs.map(([v, label]) => (
          <Link key={v} href={v === "open" ? "/leads" : `/leads?show=${v}`} aria-current={show === v ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${show === v ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>{label}</Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <Empty action={canEdit && show === "open" && <LinkButton href={`/leads/new?returnTo=${here}`} variant="primary"><Plus aria-hidden />New lead</LinkButton>}>{show === "open" ? "No open leads." : "None."}</Empty>
        ) : (
          <RowLinks>
            <TableWrap>
              <Table data-testid="leads">
                <thead><tr><Th>Student</Th><Th>Parent</Th><Th>Stage</Th><Th className="hidden md:table-cell">Wants help with</Th><Th className="hidden lg:table-cell">Source</Th><Th className="hidden sm:table-cell">Next</Th><Th className="hidden lg:table-cell">Added</Th><Th></Th></tr></thead>
                <tbody>
                  {rows.map((l) => {
                    const name = `${l.studentFirstName} ${l.studentLastName}`;
                    const href = `/leads/${l.id}?returnTo=${here}`;
                    return (
                      <tr key={l.id} data-href={href} className="hover:bg-surface-2">
                        <Td className="whitespace-nowrap"><Link href={href} className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline">{name}</Link>{l.grade && <span className="ml-1.5 text-xs text-muted">grade {l.grade}</span>}</Td>
                        <Td>{l.parentName}{(l.parentEmail || l.parentPhone) && <div className="text-xs text-muted">{l.parentEmail ?? l.parentPhone}</div>}</Td>
                        <Td><Badge tone={TONE[l.status]}>{LEAD_LABEL[l.status].toLowerCase()}</Badge>{l.lostReason && <div className="text-xs text-muted">{l.lostReason}</div>}</Td>
                        <Td className="hidden max-w-xs truncate md:table-cell" title={l.subjects ?? ""}>{l.subjects ?? ""}</Td>
                        <Td className="hidden text-muted lg:table-cell">{l.source ?? ""}</Td>
                        <Td num className="hidden whitespace-nowrap sm:table-cell">{l.consultAt && (l.status === "CONSULT_BOOKED" || l.status === "TRIAL") ? formatWhen(l.consultAt, s.timezone) : l.studentId ? <Link href={`/students/${l.studentId}`} className="text-brand hover:underline">student</Link> : ""}</Td>
                        <Td num className="hidden whitespace-nowrap lg:table-cell">{formatDay(l.createdAt, s.timezone)}</Td>
                        <Td right className="whitespace-nowrap"><LeadRowActions id={l.id} what={name} canWrite={canEdit} here={here} /></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </RowLinks>
        )}
      </Card>
    </div>
  );
}
