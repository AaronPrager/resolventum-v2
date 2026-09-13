import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { aiConfigured } from "@/src/ai/generate";
import { emailConfigured } from "@/src/email/send";
import { localDateStr } from "@/src/lib/tz";
import { Badge, Card, Empty, PageHeader } from "@/src/components/ui";
import { DraftForm, UpdateReview } from "./parts";

export const dynamic = "force-dynamic";

export default async function StudentUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const st = await prisma.student.findFirst({ where: { id, organizationId: s.organizationId }, include: { account: { include: { guardians: { where: { isPrimary: true }, take: 1 } } } } });
  if (!st) notFound();
  const drafts = await prisma.draft.findMany({ where: { organizationId: s.organizationId, kind: "PARENT_REPORT", subjectId: st.id }, orderBy: { createdAt: "desc" }, take: 10 });
  const today = localDateStr(new Date(), s.timezone);
  const monthAgo = localDateStr(new Date(Date.now() - 30 * 86400000), s.timezone);
  const parent = st.account.guardians[0];
  return (
    <div className="space-y-6">
      <PageHeader title={`Parent update for ${st.firstName}`} back={{ href: `/students/${st.id}`, label: `${st.firstName} ${st.lastName}` }}
        subtitle={parent ? `To ${parent.name}${parent.email ? ` (${parent.email})` : ""}. The model writes from your lesson notes, progress notes, and homework results. You approve it.` : "No parent on file; the update is addressed to the family."} />
      <Card title="Write a new update"><DraftForm studentId={st.id} from={monthAgo} to={today} configured={aiConfigured()} /></Card>
      {drafts.length === 0 ? <Empty>No updates yet.</Empty> : drafts.map((d) => {
        const c = d.content as Record<string, unknown>;
        return (
          <Card key={d.id} title={<span className="inline-flex items-center gap-2">{String(c.from)} to {String(c.to)} <Badge tone={d.status === "APPROVED" ? "credit" : d.status === "DISCARDED" ? "neutral" : "brand"}>{d.status.toLowerCase()}</Badge><span className="text-xs font-normal text-muted">{d.model}</span></span>}>
            <UpdateReview draft={{ id: d.id, status: d.status, subject: String(c.subject ?? ""), body: String(c.body ?? ""), highlights: Array.isArray(c.highlights) ? (c.highlights as string[]) : [], nextFocus: String(c.next_focus ?? "") }} studentId={st.id} defaultTo={parent?.email ?? ""} emailOn={emailConfigured()} />
          </Card>
        );
      })}
    </div>
  );
}
