import { notFound } from "next/navigation";
import { requireSession } from "@/src/auth/current";
import { emailConfigured } from "@/src/email/send";
import { formatDate, formatWhen } from "@/src/lib/format";
import { localDateStr, localTimeStr } from "@/src/lib/tz";
import { Badge, Button, Card, PageHeader } from "@/src/components/ui";
import { ConfirmForm } from "@/src/components/ConfirmForm";
import { NoteForm, ShareNoteForm } from "../NoteForm";
import { deleteNoteAction } from "../actions";
import { noteContact, noteFor } from "../access";

export const dynamic = "force-dynamic";

/** One note: rewrite it, send it to the family, or delete it. */
export default async function NotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const q = await searchParams;
  const n = await noteFor(s, id);
  if (!n) notFound();
  const returnTo = q.returnTo && q.returnTo.startsWith("/") && !q.returnTo.startsWith("//") ? q.returnTo : `/students?s=${n.student.id}`;
  const canWrite = s.role !== "ACCOUNTANT";
  const mailOn = emailConfigured();
  const name = `${n.student.firstName} ${n.student.lastName}`;
  const about = n.lesson ? `${formatWhen(n.lesson.startsAt, s.timezone)}${n.lesson.subject ? ` · ${n.lesson.subject}` : ""}` : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Note about ${n.student.firstName}`}
        back={{ href: returnTo, label: "Back" }}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><span>{name}</span><span>·</span><span>{about ?? `General note, ${formatDate(n.notedOn)}`}</span>{n.sharedAt ? <Badge tone="credit">sent {formatDate(n.sharedAt)}</Badge> : <Badge>not sent</Badge>}</span>}
      />
      <Card>
        {canWrite ? (
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
        ) : (
          <div className="space-y-1 text-sm">
            <p>{n.covered}</p>
            {(n.win || n.struggle || n.homework || n.nextGoal) && <p className="text-muted">{[n.win && `Win: ${n.win}`, n.struggle && `Struggle: ${n.struggle}`, n.homework && `Homework: ${n.homework}`, n.nextGoal && `Next: ${n.nextGoal}`].filter(Boolean).join(" · ")}</p>}
          </div>
        )}
      </Card>
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
    </div>
  );
}
