import { prisma } from "@/src/db";
import { assignmentByToken } from "@/src/services/homework";
import { SubmitForm } from "./SubmitForm";

export const dynamic = "force-dynamic";

/** The student's page. No login. Everything it shows is scoped by the token. */
export default async function PublicHomeworkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await assignmentByToken(prisma, token);
  const shell = (children: React.ReactNode) => (
    <div className="mx-auto mt-10 max-w-2xl space-y-5 px-4">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">{children}</div>
    </div>
  );
  if (!a) return shell(<><h1 className="text-xl font-semibold">This link is not valid</h1><p className="mt-2 text-sm text-muted">It may have been replaced. Ask your tutor for a new one.</p></>);
  const reviewed = a.status === "REVIEWED";
  return shell(
    <>
      <p className="text-xs text-muted">{a.organization.name}</p>
      <h1 className="text-xl font-semibold">{a.title}</h1>
      <p className="text-sm text-muted">For {a.student.firstName}{a.dueOn && ` · due ${a.dueOn.toISOString().slice(0, 10)}`}</p>
      {a.description && <p className="mt-3 whitespace-pre-line text-sm">{a.description}</p>}
      {a.files.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold">Files</h2>
          <ul className="mt-1 space-y-1 text-sm">{a.files.map((f) => <li key={f.file.id}><a className="text-brand hover:underline" href={`/api/h/${token}/${f.file.id}`}>{f.file.name}</a></li>)}</ul>
        </div>
      )}
      {a.submissions.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold">What you sent</h2>
          <ul className="mt-1 space-y-2 text-sm">
            {a.submissions.map((sub) => (
              <li key={sub.id}>
                <span className="text-muted tabular-nums">{sub.submittedAt.toISOString().slice(0, 10)}</span>{" "}
                {sub.file ? <a className="text-brand hover:underline" href={`/api/h/${token}/${sub.file.id}`}>{sub.file.name}</a> : sub.note}
                {sub.feedback && <div className="mt-1 rounded-md bg-credit-soft p-2 whitespace-pre-line">{sub.feedback.comment}{sub.feedback.score != null && <div className="mt-1 text-xs text-credit">Score {sub.feedback.score} of 5</div>}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 border-t border-line pt-4">
        {reviewed ? <p className="text-sm text-muted">This assignment has been reviewed. Thank you.</p> : <SubmitForm token={token} />}
      </div>
    </>,
  );
}
