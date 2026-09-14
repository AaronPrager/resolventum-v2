"use client";

import { useActionState } from "react";
import { Button } from "@/src/components/ui";
import { type ActionState, recordTutorPayAction } from "./actions";

export function RecordButton({ tutorId, month, disabled }: { tutorId: string; month: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(recordTutorPayAction, {} as ActionState);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="tutorId" value={tutorId} />
      <input type="hidden" name="month" value={month} />
      <Button type="submit" variant="secondary" disabled={pending || disabled}>{pending ? "Recording" : "Record as expense"}</Button>
      {state.error && <span role="alert" className="text-xs text-owed">{state.error}</span>}
      {state.ok && <span role="status" className="text-xs text-credit">{state.ok}</span>}
    </form>
  );
}
