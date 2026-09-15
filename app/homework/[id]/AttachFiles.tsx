"use client";

import { useActionState } from "react";
import { Paperclip } from "lucide-react";
import { Button, Field, FormError, FormOk } from "@/src/components/ui";
import { FileInput } from "@/src/components/FileInput";
import { type ActionState, attachFilesAction } from "../actions";
import { UsedBefore, type UsedFileOption } from "../UsedBefore";

/** Add files to an assignment after it exists: from the computer, or ones used before. */
export function AttachFiles({ assignmentId, used }: { assignmentId: string; used: UsedFileOption[] }) {
  const [state, action, pending] = useActionState(attachFilesAction, {} as ActionState);
  return (
    <form action={action} className="space-y-3" data-testid="attach-form">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Field label="Files from your computer"><FileInput name="files" multiple maxFiles={20} /></Field>
      {used.length > 0 && <UsedBefore files={used} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}><Paperclip aria-hidden />{pending ? "Attaching" : "Attach"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}
