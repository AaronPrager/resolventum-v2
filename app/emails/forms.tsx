"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button, Checkbox, Field, FormError, FormOk, Input } from "@/src/components/ui";
import { type ActionState, saveEmailSettingsAction, sendBalanceRemindersAction, sendLessonRemindersAction, sendScheduleAction } from "./actions";

const actions = { lesson: sendLessonRemindersAction, balance: sendBalanceRemindersAction };

/** A list of families with tick boxes (rendered by the page) and one send button. */
export function PickAndSend({ which, day, children, disabled, label, testId }: { which: "lesson" | "balance"; day?: string; children: ReactNode; disabled: boolean; label: string; testId: string }) {
  const [state, action, pending] = useActionState(actions[which], {} as ActionState);
  return (
    <form action={action} className="space-y-4" data-testid={testId}>
      {day && <input type="hidden" name="day" value={day} />}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || disabled}><Send aria-hidden />{pending ? "Sending" : label}</Button>
        <FormError>{state.error}</FormError>
        <FormOk>{state.ok}</FormOk>
      </div>
    </form>
  );
}

export function ScheduleForm({ day, defaultTo, disabled }: { day: string; defaultTo: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(sendScheduleAction, {} as ActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="schedule-form">
      <input type="hidden" name="day" value={day} />
      <Field label="Send it to"><Input type="email" name="to" defaultValue={defaultTo} required className="w-72" /></Field>
      <Button type="submit" variant="secondary" disabled={pending || disabled}><Send aria-hidden />{pending ? "Sending" : "Send now"}</Button>
      <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
    </form>
  );
}

export function AutoSettingsForm({ lessonRemindersAuto, dailyScheduleAuto, dailyScheduleEmail, ownerEmail, canEdit }: { lessonRemindersAuto: boolean; dailyScheduleAuto: boolean; dailyScheduleEmail: string; ownerEmail: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveEmailSettingsAction, {} as ActionState);
  return (
    <form action={action} className="space-y-4" data-testid="email-settings">
      <fieldset disabled={!canEdit} className="space-y-3">
        <Checkbox name="lessonRemindersAuto" defaultChecked={lessonRemindersAuto} label="Every morning, email families about the next day's lessons" />
        <div className="flex flex-wrap items-end gap-3">
          <Checkbox name="dailyScheduleAuto" defaultChecked={dailyScheduleAuto} label="Every morning, email me the day's schedule" />
          <Field label="Send the schedule to" className="w-72"><Input type="email" name="dailyScheduleEmail" defaultValue={dailyScheduleEmail} placeholder={ownerEmail} /></Field>
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending || !canEdit}>{pending ? "Saving" : "Save"}</Button>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </div>
      <p className="text-xs text-muted">The morning job runs at 9:15 Eastern. A lesson is never reminded twice, even if you also send by hand.</p>
    </form>
  );
}
