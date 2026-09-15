import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/src/auth/current";
import { emailConfigured } from "@/src/email/send";
import { formatDate, formatWhen } from "@/src/lib/format";
import { localDateStr, localTimeStr } from "@/src/lib/tz";
import { ENGAGEMENT_LABELS } from "@/src/services/sessionNotes";
import { Badge, Button, Card, cx } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { RecordScreen } from "@/src/components/RecordScreen";
import { NoteForm, ShareNoteForm } from "../NoteForm";
import { deleteNoteAction } from "../actions";
import { noteContact, noteFor } from "../access";

export const dynamic = "force-dynamic";

/** A labelled paragraph of the note. Skipped when empty. */
function Line({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-2 text-sm sm:grid-cols-[6rem_1fr]">
      <span className="text-[11px] font-medium uppercase leading-5 tracking-[0.05em] text-muted">{label}</span>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

/** One note. Opens read-only; Edit shows the form. Send and delete sit under it. */
export default async function NotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string; edit?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const q = await searchParams;
  const n = await noteFor(s, id);
  if (!n) notFound();
  const returnTo = q.returnTo && q.returnTo.startsWith("/") && !q.returnTo.startsWith("//") ? q.returnTo : `/students/${n.student.id}`;
  const canWrite = s.role !== "ACCOUNTANT";
  const mailOn = emailConfigured();
  const name = `${n.student.firstName} ${n.student.lastName}`;
  const about = n.lesson ? `${formatWhen(n.lesson.startsAt, s.timezone)}${n.lesson.subject ? ` · ${n.lesson.subject}` : ""}` : null;

  const overview = (
    <Card>
      <div className="space-y-2">
        {n.engagement != null && (
          <div className="grid grid-cols-[5rem_1fr] gap-2 text-sm sm:grid-cols-[6rem_1fr]">
            <span className="text-[11px] font-medium uppercase leading-5 tracking-[0.05em] text-muted">Engaged</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={cx("size-2 rounded-full", i <= n.engagement! ? "bg-brand" : "bg-surface-3")} />)}</span>
              <span className="text-xs text-muted">{ENGAGEMENT_LABELS[n.engagement] ?? `${n.engagement}/5`}</span>
            </span>
          </div>
        )}
        <Line label="Covered" text={n.covered} />
        <Line label="Homework" text={n.homework} />
        <Line label="Win" text={n.win} />
        <Line label="Struggle" text={n.struggle} />
        <Line label="Next" text={n.nextGoal} />
      </div>
      {n.lesson && <p className="mt-4 text-xs text-muted">About the <Link href={`/lessons/${n.lesson.id}`} className="text-brand hover:underline">lesson on {formatWhen(n.lesson.startsAt, s.timezone)}</Link>.</p>}
    </Card>
  );

  return (
    <RecordScreen
      title={`Note about ${n.student.firstName}`}
      editTitle={`Edit the note about ${n.student.firstName}`}
      back={{ href: returnTo, label: "Back" }}
      subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Link href={`/students/${n.student.id}`} className="text-brand hover:underline">{name}</Link><span>·</span><span>{about ?? `General note, ${formatDate(n.notedOn)}`}</span>{n.sharedAt ? <Badge tone="credit">sent {formatDate(n.sharedAt)}</Badge> : <Badge>not sent</Badge>}</span>}
      canEdit={canWrite}
      defaultEditing={q.edit === "1"}
      overview={overview}
      form={
        <Card>
          <NoteForm
            students={[{ id: n.student.id, name: name, first: n.student.firstName }]}
            lessonsByStudent={{}}
            defaults={{ studentId: n.student.id, lessonId: n.lessonId ?? "" }}
            locked={{ student: name, lesson: about }}
            today={localDateStr(new Date(), s.timezone)}
            returnTo={returnTo}
            noteId={n.id}
            initial={{ covered: n.covered, win: n.win ?? "", struggle: n.struggle ?? "", homework: n.homework ?? "", nextGoal: n.nextGoal ?? "", engagement: n.engagement ? String(n.engagement) : "", notedOn: n.notedOn.toISOString().slice(0, 10) }}
          />
        </Card>
      }
    >
      {canWrite && (
        <Card title="Send to the family">
          <ShareNoteForm noteId={n.id} defaultTo={noteContact(n.student)} disabled={!mailOn} sharedTo={n.sharedTo} sharedAt={n.sharedAt ? `${localDateStr(n.sharedAt, s.timezone)} ${localTimeStr(n.sharedAt, s.timezone)}` : null} />
          {!mailOn && <p className="mt-2 text-xs text-warn">Email is off on this server, so notes can be written but not sent.</p>}
        </Card>
      )}
      {canWrite && (
        <ConfirmForm action={deleteNoteAction} message="Delete this note? This cannot be undone." className="flex justify-end">
          <input type="hidden" name="noteId" value={n.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Button variant="ghost" className="text-owed">Delete the note</Button>
        </ConfirmForm>
      )}
    </RecordScreen>
  );
}
