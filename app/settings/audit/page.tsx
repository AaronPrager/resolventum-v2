import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatWhen } from "@/src/lib/format";
import { listAudit } from "@/src/services/audit";
import { Badge, Card, Empty, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const rows = await listAudit(prisma, s.organizationId, { take: 300, subjectType: q.type, subjectId: q.id });
  return (
    <div className="space-y-6">
      <PageHeader title="Audit trail" back={{ href: "/settings", label: "Office" }} subtitle="Who did what to lessons, money, and credit, newest first. Written by the app as changes are made; nobody can edit it." />
      <Card>
        {rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <TableWrap>
            <Table data-testid="audit">
              <thead><tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th className="hidden sm:table-cell">Details</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <Td num className="text-muted">{formatWhen(r.createdAt, s.timezone)}</Td>
                    <Td>{r.actorName ?? <span className="text-muted">system</span>}</Td>
                    <Td><Badge tone={r.action.includes("cancel") || r.action.includes("void") || r.action.includes("delete") ? "owed" : r.action.includes("credit") || r.action.includes("payment") ? "credit" : "neutral"}>{r.action}</Badge></Td>
                    <Td className="hidden max-w-xl sm:table-cell">{r.summary}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
