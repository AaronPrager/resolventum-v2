import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { formatCents, formatDate } from "@/src/lib/format";
import { listCategories, listVendors } from "@/src/services/expenses";
import { Badge, Button, Card, Empty, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { runRecurringAction, stopRecurringAction } from "../actions";
import { RecurringForm } from "./RecurringForm";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const s = await requireSession();
  const [rows, categories, vendors, sources] = await Promise.all([
    prisma.recurringExpense.findMany({ where: { organizationId: s.organizationId }, include: { vendor: true, category: true, _count: { select: { expenses: true } } }, orderBy: [{ active: "desc" }, { nextOn: "asc" }] }),
    listCategories(prisma, s.organizationId), listVendors(prisma, s.organizationId),
    prisma.paymentSource.findMany({ where: { organizationId: s.organizationId, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const due = rows.filter((r) => r.active && r.nextOn <= new Date()).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Recurring expenses" back={{ href: "/expenses", label: "Expenses" }} subtitle={`${rows.filter((r) => r.active).length} active. ${due} due to run.`}
        actions={<form action={runRecurringAction}><Button variant={due ? "primary" : "secondary"}>Run what is due</Button></form>} />
      <Card title="New recurring expense"><RecurringForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} vendors={vendors.map((v) => v.name)} sources={sources.map((x) => ({ id: x.id, name: x.name }))} /></Card>
      <Card>
        {rows.length === 0 ? <Empty>None yet.</Empty> : (
          <TableWrap><Table data-testid="recurring">
            <thead><tr><Th>Description</Th><Th className="hidden sm:table-cell">Vendor</Th><Th>Every</Th><Th>Next</Th><Th right>Amount</Th><Th right>Made</Th><Th></Th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className={`hover:bg-surface-2 ${r.active ? "" : "text-muted"}`}>
                <Td>{r.description} {!r.active && <Badge>stopped</Badge>}</Td>
                <Td className="hidden sm:table-cell">{r.vendor?.name ?? ""}</Td>
                <Td>{r.frequency === "MONTHLY" ? "month" : "year"}</Td>
                <Td num>{r.active ? formatDate(r.nextOn) : ""}</Td>
                <Td right num>{formatCents(r.amountCents)}</Td>
                <Td right num>{r._count.expenses}</Td>
                <Td right>{r.active && <form action={stopRecurringAction}><input type="hidden" name="id" value={r.id} /><Button variant="link" className="text-xs text-owed">Stop</Button></form>}</Td>
              </tr>
            ))}</tbody>
          </Table></TableWrap>
        )}
      </Card>
    </div>
  );
}
