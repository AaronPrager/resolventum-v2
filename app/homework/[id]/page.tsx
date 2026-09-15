import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { aiConfigured } from "@/src/ai/generate";
import { formatDate, formatDay } from "@/src/lib/format";
import { localDateOnly } from "@/src/lib/tz";
import { assignmentDetail, effectiveStatus } from "@/src/services/homework";
import { Badge, Button, Card, Empty, Field, Input, LinkButton, PageHeader, Textarea } from "@/src/components/ui";
import { deleteAssignmentAction, detachFileAction, discardDraftAction, markAssignedAction, toggleArchiveAction } from "../actions";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { emailConfigured } from "@/src/email/send";
import { EmailLink } from "./EmailLink";
import { AssignmentEditor, DraftReview, FeedbackForm, LinkBox, AiButton } from "./parts";
import { AttachFiles } from "./AttachFiles";
import { usedFiles } from "@/src/services/files";

export const dynamic = "force-dynamic";

function kb(n: number) { return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; }

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const { returnTo } = await searchParams;
  const back = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/homework";
  const d = await assignmentDetail(prisma, s.organizationId, id);
  if (!d) notFound();
  const a = d.assignment;
  const status = effectiveStatus(a, localDateOnly(new Date(), s.timezone));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100"}`;
  const parent = a.student.account.guardians[0];
  const ai = aiConfigured();
  const canEdit = s.role !== "ACCOUNTANT";
  const used = canEdit ? (await usedFiles(prisma, s.organizationId)).filter((f) => !a.files.some((x) => x.file.id === f.id)) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={a.title}
        back={{ href: back, label: back === "/homework" ? "Homework" : "Back" }}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Link href={`/students/${a.student.id}`} className="text-brand hover:underline">{a.student.firstName} {a.student.lastName}</Link><Badge tone={status === "REVIEWED" ? "credit" : status === "OVERDUE" ? "owed" : status === "SOLVED" ? "warn" : "brand"}>{status === "SOLVED" ? "to review" : status.toLowerCase()}</Badge>{a.archivedAt && <Badge>archived</Badge>}{a.dueOn && <span>due {formatDate(a.dueOn)}</span>}{a.lesson && <span>· from the lesson on {formatDay(a.lesson.startsAt, s.timezone)}</span>}</span>}
        actions={
          <>
            <form action={toggleArchiveAction}>
              <input type="hidden" name="assignmentId" value={a.id} />
              <input type="hidden" name="archived" value={a.archivedAt ? "1" : "0"} />
              <Button variant="secondary">{a.archivedAt ? "Unarchive" : "Archive"}</Button>
            </form>
            {a.submissions.length === 0 && (
              <ConfirmForm action={deleteAssignmentAction} message="Delete this assignment? It has no submissions, so nothing else is lost."><input type="hidden" name="assignmentId" value={a.id} /><Button variant="danger">Delete</Button></ConfirmForm>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Assignment">
          <AssignmentEditor assignmentId={a.id} title={a.title} description={a.description ?? ""} dueOn={a.dueOn ? a.dueOn.toISOString().slice(0, 10) : ""} />
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Files{a.files.length ? ` · ${a.files.length}` : ""}</h3>
            {a.files.length === 0 ? <p className="text-sm text-muted">None attached.</p> : (
              <ul className="space-y-1 text-sm" data-testid="assignment-files">
                {a.files.map((f) => (
                  <li key={f.file.id} className="flex flex-wrap items-center gap-2">
                    <a className="text-brand hover:underline" href={`/api/files/${f.file.id}`}>{f.file.name}</a> <span className="text-muted">{kb(f.file.sizeBytes)}</span>
                    {canEdit && <form action={detachFileAction}><input type="hidden" name="assignmentId" value={a.id} /><input type="hidden" name="fileId" value={f.file.id} /><Button variant="link" className="text-xs text-muted">Remove</Button></form>}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <div className="mt-3"><AttachFiles assignmentId={a.id} used={used.map((f) => ({ id: f.id, name: f.name, uses: f.uses }))} /></div>}
          </div>
        </Card>
        <Card title="Student link">
          <p className="mb-3 text-sm text-muted">
            The student opens this link to see the assignment, download the files, and upload their work. No login needed.
            {parent?.email && <> Parent: {parent.email}.</>}{a.student.email && <> Student: {a.student.email}.</>}
          </p>
          <LinkBox assignmentId={a.id} origin={origin} hasLink={d.hasLink} status={a.status} />
          <div className="mt-3 border-t border-line pt-3"><EmailLink assignmentId={a.id} origin={origin} defaultTo={a.student.email ?? parent?.email ?? ""} configured={emailConfigured()} /></div>
          {a.status === "PENDING" && (
            <form action={markAssignedAction} className="mt-3"><input type="hidden" name="assignmentId" value={a.id} /><Button variant="secondary">Mark as sent to the student</Button></form>
          )}
        </Card>
      </div>

      <Card title={`Submissions (${a.submissions.length})`}>
        {a.submissions.length === 0 ? <Empty>Nothing submitted yet.</Empty> : (
          <div className="space-y-5">
            {a.submissions.map((sub) => {
              const draft = d.drafts.find((x) => x.subjectId === sub.id);
              return (
                <div key={sub.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted tabular-nums">{sub.submittedAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                    {sub.file ? <a className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline" href={`/api/files/${sub.file.id}`}>{sub.file.name}</a> : <span className="text-muted">no file</span>}
                    {sub.file && <span className="text-muted">{kb(sub.file.sizeBytes)}</span>}
                    <Badge>{sub.source.toLowerCase()}</Badge>
                  </div>
                  {sub.note && <p className="mt-2 text-sm">{sub.note}</p>}
                  {sub.feedback ? (
                    <div className="mt-3 rounded-md bg-credit-soft p-3 text-sm">
                      <div className="mb-1 font-medium text-credit">Feedback{sub.feedback.score != null && ` · ${sub.feedback.score} of 5`}</div>
                      <p className="whitespace-pre-line">{sub.feedback.comment}</p>
                    </div>
                  ) : draft ? (
                    <DraftReview draft={{ id: draft.id, content: draft.content as Record<string, unknown>, model: draft.model }} assignmentId={a.id} discardAction={discardDraftAction} />
                  ) : (
                    <div className="mt-3 space-y-3">
                      {sub.file && <AiButton submissionId={sub.id} assignmentId={a.id} configured={ai} />}
                      <FeedbackForm submissionId={sub.id} assignmentId={a.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
