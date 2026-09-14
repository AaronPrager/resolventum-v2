import Link from "next/link";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { emailConfigured } from "@/src/email/send";
import { formatCents, formatDay, formatWhen } from "@/src/lib/format";
import { localDateOnly, localDateStr } from "@/src/lib/tz";
import { addDaysToDay, balanceReminders, dailySchedule, lessonReminders } from "@/src/services/reminders";
import { Badge, Card, Empty, Input, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { AutoSettingsForm, PickAndSend, ScheduleForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emails" };

const TABS = [["lessons", "Lesson reminders"], ["balances", "Balance reminders"], ["schedule", "Daily schedule"], ["sent", "Sent"]] as const;
type Tab = (typeof TABS)[number][0];

function Preview({ subject, text }: { subject: string; text: string }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-brand">Preview</summary>
      <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-[13px]">
        <div className="mb-2 font-medium">{subject}</div>
        <pre className="whitespace-pre-wrap font-sans text-muted">{text}</pre>
      </div>
    </details>
  );
}

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ tab?: string; day?: string }> }) {
  const q = await searchParams;
  const s = await requireSession();
  const tab: Tab = (TABS.map((t) => t[0]) as string[]).includes(q.tab ?? "") ? (q.tab as Tab) : "lessons";
  const configured = emailConfigured();
  const canEdit = s.role !== "ACCOUNTANT";
  const today = localDateStr(new Date(), s.timezone);
  const tomorrow = addDaysToDay(today, 1);
  const day = q.day && /^\d{4}-\d{2}-\d{2}$/.test(q.day) ? q.day : tab === "schedule" ? today : tomorrow;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: s.organizationId } });

  return (
    <div className="space-y-6">
      <PageHeader title="Emails" subtitle="Reminders for families and your own daily schedule. Nothing goes out until you send it, unless you turn on the morning emails." />
      {!configured && (
        <p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          Email is off on this server, so you can preview everything here but not send. It turns on when RESEND_API_KEY and EMAIL_FROM are set.
        </p>
      )}
      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Email sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/emails?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}>{label}</Link>
        ))}
      </nav>

      {tab === "lessons" && <LessonsTab orgId={s.organizationId} day={day} configured={configured && canEdit} />}
      {tab === "balances" && <BalancesTab orgId={s.organizationId} today={localDateOnly(new Date(), s.timezone)} configured={configured && canEdit} />}
      {tab === "schedule" && (
        <ScheduleTab orgId={s.organizationId} day={day} defaultTo={org.dailyScheduleEmail ?? s.email} configured={configured && canEdit}>
          <AutoSettingsForm lessonRemindersAuto={org.lessonRemindersAuto} dailyScheduleAuto={org.dailyScheduleAuto} dailyScheduleEmail={org.dailyScheduleEmail ?? ""} ownerEmail={s.email} canEdit={canEdit} />
        </ScheduleTab>
      )}
      {tab === "sent" && <SentTab orgId={s.organizationId} tz={s.timezone} />}
    </div>
  );
}

function DayPicker({ tab, day }: { tab: string; day: string }) {
  return (
    <form method="get" className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      <Input type="date" name="day" defaultValue={day} aria-label="Day" className="w-44" />
      <button className="h-9 rounded-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-surface-2">Show</button>
    </form>
  );
}

async function LessonsTab({ orgId, day, configured }: { orgId: string; day: string; configured: boolean }) {
  const list = await lessonReminders(prisma, orgId, day);
  const ready = list.filter((r) => r.to && r.alreadySent < r.lessons.length);
  return (
    <Card title={`Lessons on ${formatDay(new Date(`${day}T12:00:00Z`), "UTC")}`} actions={<DayPicker tab="lessons" day={day} />}>
      {list.length === 0 ? <Empty>No scheduled lessons with students that day.</Empty> : (
        <PickAndSend which="lesson" day={day} disabled={!configured || ready.length === 0} label={`Send ${ready.length} reminder${ready.length === 1 ? "" : "s"}`} testId="lesson-reminders">
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((r) => {
              const done = r.alreadySent >= r.lessons.length;
              return (
                <li key={r.accountId} className="flex items-start gap-3 px-4 py-3">
                  <input type="checkbox" name="accountId" value={r.accountId} defaultChecked={!!r.to && !done} disabled={!r.to || done} className="mt-1 size-4 accent-brand" aria-label={`Send to ${r.accountName}`} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.accountName}</span>
                      {r.to ? <span className="text-muted">{r.to}</span> : <Badge tone="warn">no email on file</Badge>}
                      {done && <Badge tone="credit">sent</Badge>}
                    </div>
                    <div className="mt-0.5 text-muted">{r.lessons.map((l) => `${l.when} ${l.studentName}${l.subject ? `, ${l.subject}` : ""}`).join(" · ")}</div>
                    <Preview subject={r.subject} text={r.text} />
                  </div>
                </li>
              );
            })}
          </ul>
        </PickAndSend>
      )}
    </Card>
  );
}

async function BalancesTab({ orgId, today, configured }: { orgId: string; today: Date; configured: boolean }) {
  const list = await balanceReminders(prisma, orgId, today);
  const weekAgo = today.getTime() - 7 * 86400000;
  const total = list.reduce((s, r) => s + r.balanceCents, 0);
  return (
    <Card title={`${list.length} families owe ${formatCents(total)}`} actions={<span className="text-xs text-muted">Each email carries this year&apos;s statement as a PDF</span>}>
      {list.length === 0 ? <Empty>Nobody owes anything today.</Empty> : (
        <PickAndSend which="balance" disabled={!configured} label="Send selected" testId="balance-reminders">
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((r) => {
              const recent = r.lastReminderAt && r.lastReminderAt.getTime() > weekAgo;
              return (
                <li key={r.accountId} className="flex items-start gap-3 px-4 py-3">
                  <input type="checkbox" name="accountId" value={r.accountId} defaultChecked={!!r.to && !recent} disabled={!r.to} className="mt-1 size-4 accent-brand" aria-label={`Send to ${r.accountName}`} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/accounts/${r.accountId}`} className="font-medium underline-offset-2 hover:text-brand hover:underline">{r.accountName}</Link>
                      <span className="font-medium tabular-nums text-owed">{formatCents(r.balanceCents)}</span>
                      {r.to ? <span className="text-muted">{r.to}</span> : <Badge tone="warn">no email on file</Badge>}
                      {r.lastReminderAt && <Badge tone={recent ? "warn" : "neutral"}>reminded {formatDay(r.lastReminderAt, "UTC")}</Badge>}
                    </div>
                    <Preview subject={r.subject} text={r.text} />
                  </div>
                </li>
              );
            })}
          </ul>
        </PickAndSend>
      )}
    </Card>
  );
}

async function ScheduleTab({ orgId, day, defaultTo, configured, children }: { orgId: string; day: string; defaultTo: string; configured: boolean; children: React.ReactNode }) {
  const sch = await dailySchedule(prisma, orgId, day);
  return (
    <div className="space-y-6">
      <Card title="Morning emails">{children}</Card>
      <Card title={sch.subject} actions={<DayPicker tab="schedule" day={day} />}>
        <pre className="mb-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 font-sans text-[13px]">{sch.text}</pre>
        <ScheduleForm day={day} defaultTo={defaultTo} disabled={!configured} />
      </Card>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  LESSON_REMINDER: "lesson reminder", DAILY_SCHEDULE: "schedule", BALANCE_REMINDER: "balance reminder", STATEMENT: "statement",
  HOMEWORK_INVITE: "homework", HOMEWORK_SUBMITTED: "homework", PASSWORD_RESET: "password", INVITE: "invite", EMAIL_VERIFY: "verify", INTAKE_CONFIRMATION: "sign-up", OTHER: "other",
};

async function SentTab({ orgId, tz }: { orgId: string; tz: string }) {
  const rows = await prisma.message.findMany({ where: { organizationId: orgId, NOT: { bodyText: { startsWith: "(Sent with the reminder" } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <Card title="Last 100 emails">
      {rows.length === 0 ? <Empty>Nothing sent yet.</Empty> : (
        <TableWrap>
          <Table data-testid="sent">
            <thead><tr><Th>When</Th><Th>What</Th><Th>To</Th><Th>Subject</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <Td num className="text-muted">{formatWhen(m.sentAt ?? m.createdAt, tz)}</Td>
                  <Td><Badge>{KIND_LABEL[m.kind] ?? m.kind.toLowerCase()}</Badge></Td>
                  <Td>{m.toEmail}</Td>
                  <Td className="max-w-80 truncate" title={m.subject}>{m.subject}</Td>
                  <Td>{m.status === "SENT" ? <Badge tone="credit">sent</Badge> : m.status === "FAILED" ? <span title={m.error ?? ""}><Badge tone="owed">failed</Badge></span> : <Badge>{m.status.toLowerCase()}</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}
