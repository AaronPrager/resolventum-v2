import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { AGREEMENT_FIELDS, DEFAULT_AGREEMENT } from "@/src/documents/agreement";
import { studentChoices } from "@/src/services/students";
import { Card, PageHeader } from "@/src/components/ui";
import { AgreementForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutoring agreement" };

export default async function AgreementPage() {
  const s = await requireSession();
  const [org, students] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: s.organizationId }, select: { agreementTemplate: true } }),
    studentChoices(prisma, s.organizationId),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Tutoring agreement" back={{ href: "/settings", label: "Office" }} subtitle="One wording for the school. Each student's copy fills in their name, parent, and price, with lines to sign." />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card title="Wording">
          <AgreementForm template={org.agreementTemplate ?? DEFAULT_AGREEMENT} canEdit={s.role === "OWNER"} />
        </Card>
        <div className="space-y-6">
          <Card title="Fill-ins">
            <ul className="space-y-2 text-sm">
              {AGREEMENT_FIELDS.map(([k, label]) => <li key={k}><code className="rounded bg-surface-3 px-1.5 py-0.5 text-xs">{k}</code><div className="text-muted">{label}</div></li>)}
            </ul>
          </Card>
          <Card title="Make a copy">
            <form method="get" action="/api/students/agreement-redirect" className="space-y-3" data-testid="agreement-make">
              <select name="student" required defaultValue="" aria-label="Student" className="h-9 w-full rounded-lg border border-line bg-surface pl-3 text-sm shadow-xs">
                <option value="" disabled>Pick a student</option>
                {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
              <button className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-fg shadow-xs hover:bg-brand-strong">Download PDF</button>
            </form>
            <p className="mt-2 text-xs text-muted">Save the wording first. You can also download a copy from each student&apos;s page.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
