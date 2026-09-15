"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { Button, PageHeader } from "@/src/components/ui";
import { deleteLessonAction } from "../actions";
import { ConfirmDelete } from "../ConfirmDelete";

/**
 * The lesson page frame. Opens read-only; Edit swaps the overview for the form
 * and back again without leaving the page. Delete asks first, then returns to
 * where the lesson was opened from.
 */
export function LessonScreen({ lessonId, title, editTitle, back, subtitle, canWrite, defaultEditing, what, inSeries, charged, overview, form, children }: {
  lessonId: string;
  title: string;
  /** "Edit lesson", "Edit group lesson", "Edit event". */
  editTitle: string;
  back: { href: string; label: string };
  subtitle: ReactNode;
  canWrite: boolean;
  defaultEditing: boolean;
  /** "Eva Laffer, Math on Sep 15 at 1:45 PM", for the delete dialog. */
  what: string;
  inSeries: boolean;
  charged: boolean;
  overview: ReactNode;
  form: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(defaultEditing && canWrite);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(scope: "one" | "future") {
    startTransition(async () => {
      const r = await deleteLessonAction(lessonId, scope);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.push(back.href);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={editing ? editTitle : title}
        back={back}
        subtitle={subtitle}
        actions={canWrite && (
          <>
            {editing ? (
              <Button variant="secondary" type="button" onClick={() => setEditing(false)}><X aria-hidden />Stop editing</Button>
            ) : (
              <Button variant="secondary" type="button" onClick={() => setEditing(true)} data-testid="edit-lesson"><Pencil aria-hidden />Edit</Button>
            )}
            <Button variant="ghost" type="button" className="text-owed hover:bg-owed-soft hover:text-owed" onClick={() => { setError(null); setAsking(true); }}><Trash2 aria-hidden />Delete</Button>
          </>
        )}
      />
      {editing ? form : overview}
      {children}
      {asking && (
        <ConfirmDelete what={what} inSeries={inSeries} charged={charged} pending={pending} error={error} onCancel={() => setAsking(false)} onDelete={remove} />
      )}
    </div>
  );
}
