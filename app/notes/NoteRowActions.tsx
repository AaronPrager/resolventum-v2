"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Send } from "lucide-react";
import { RowAsk, RowIcons, dangerClass, noClass, useAsk, yesClass } from "@/src/components/ListRowActions";
import { type ActionState, deleteNoteAction, shareNoteAction } from "./actions";

/** Edit, send, delete for one note line. Send and delete ask here first. */
export function NoteRowActions({ id, what, to, mailOn, canWrite, here }: { id: string; what: string; /** The family address the note goes to, or "". */ to: string; mailOn: boolean; canWrite: boolean; here: string }) {
  const router = useRouter();
  const { asking, ask, close } = useAsk<"send" | "delete">();
  const [sent, shareAction, sending] = useActionState(shareNoteAction, {} as ActionState);
  useEffect(() => { if (sent.ok) { close(); router.refresh(); } }, [sent, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const question = asking === "send" ? (
    <form action={shareAction}>
      <input type="hidden" name="noteId" value={id} />
      <RowAsk>
        {sent.error ? <span className="text-owed">{sent.error}</span> : <span>Send to {to || "the family"}?</span>}
        {!sent.error && <button type="submit" disabled={sending} className={yesClass}>{sending ? "Sending" : "Yes"}</button>}
        <button type="button" onClick={close} className={noClass}>{sent.error ? "Close" : "No"}</button>
      </RowAsk>
    </form>
  ) : asking === "delete" ? (
    <form action={deleteNoteAction}>
      <input type="hidden" name="noteId" value={id} /><input type="hidden" name="returnTo" value={decodeURIComponent(here)} />
      <RowAsk>
        <span>Delete for good?</span>
        <button type="submit" className={dangerClass}>Yes</button>
        <button type="button" onClick={close} className={noClass}>No</button>
      </RowAsk>
    </form>
  ) : null;

  return (
    <RowIcons
      what={what}
      editHref={canWrite ? `/notes/${id}?edit=1&returnTo=${here}` : undefined}
      middle={canWrite && mailOn && to ? { icon: Send, tip: "Send", onClick: () => ask("send") } : undefined}
      onDelete={canWrite ? () => ask("delete") : undefined}
      ask={question}
    />
  );
}
