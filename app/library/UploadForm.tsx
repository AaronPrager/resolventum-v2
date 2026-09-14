"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormOk, Input } from "@/src/components/ui";
import { type ActionState, uploadLibraryAction } from "../homework/actions";
import { FileInput } from "@/src/components/FileInput";

export function UploadForm({ folders }: { folders: string[] }) {
  const [state, action, pending] = useActionState(uploadLibraryAction, {} as ActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" data-testid="upload-form">
      <Field label="Files"><FileInput name="files" multiple maxFiles={20} required /></Field>
      <Field label="Folder"><Input name="folder" list="folders" placeholder="optional" /></Field>
      <datalist id="folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
      <Button type="submit" disabled={pending}>{pending ? "Uploading" : "Upload"}</Button>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}
