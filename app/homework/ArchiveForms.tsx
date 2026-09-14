"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { Archive } from "lucide-react";
import { Button, FormError, FormOk, Input } from "@/src/components/ui";
import { type ActionState, archiveOlderAction, archiveSelectedAction } from "./actions";

/** Wraps the list so its tick boxes submit together. */
export function ArchiveSelected({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(archiveSelectedAction, {} as ActionState);
  return (
    <form action={action} data-testid="archive-selected">
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}><Archive aria-hidden />{pending ? "Archiving" : "Archive selected"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}

export function ArchiveOlder({ defaultBefore }: { defaultBefore: string }) {
  const [state, action, pending] = useActionState(archiveOlderAction, {} as ActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm" data-testid="archive-older">
      <span className="text-muted">Archive everything due before</span>
      <Input type="date" name="before" defaultValue={defaultBefore} aria-label="Archive before" className="w-40" required />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Archiving" : "Archive"}</Button>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}
