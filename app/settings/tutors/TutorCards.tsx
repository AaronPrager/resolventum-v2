"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, Empty, IconButton } from "@/src/components/ui";
import { archiveTutorAction } from "../actions";
import { TutorForm, type TutorValues } from "../forms";

export interface TutorSummary {
  values: TutorValues;
  lessons: number;
  archived: boolean;
  signsIn: boolean;
  /** "$40.00 per hour, by subject for SAT Math" */
  pay: string;
  clientRate: string | null;
  hours: string | null;
}

/**
 * One tutor: a summary line you can read at a glance, and the full form only
 * when you press Edit. Saving or Cancel folds it back. Adding works the same
 * way from a button at the top.
 */
function TutorCard({ t, zones, owner }: { t: TutorSummary; zones: string[]; owner: boolean }) {
  const [editing, setEditing] = useState(false);
  const v = t.values;
  const facts = [
    `${t.lessons} lesson${t.lessons === 1 ? "" : "s"}`,
    `pay ${t.pay}`,
    t.clientRate && `families pay ${t.clientRate} per hour`,
    v.subjects && v.subjects,
    t.hours,
    v.timezone && v.timezone,
  ].filter(Boolean) as string[];
  return (
    <Card className={t.archived ? "opacity-70" : ""}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-1.5 inline-block size-3 shrink-0 rounded-full" style={{ backgroundColor: v.color || "var(--brand)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{v.name}</span>
            {t.archived && <Badge>archived</Badge>}
            {t.signsIn && <Badge tone="brand">signs in</Badge>}
          </div>
          <div className="mt-0.5 text-[13px] text-muted">{facts.join(" · ")}</div>
          {(v.email || v.phone) && <div className="mt-0.5 text-[13px] text-muted">{[v.email, v.phone].filter(Boolean).join(" · ")}</div>}
        </div>
        {owner && !editing && (
          <span className="inline-flex items-center gap-1">
            <form action={archiveTutorAction} className="inline-flex">
              <input type="hidden" name="tutorId" value={v.id} />
              <IconButton type="submit" label={t.archived ? `Restore ${v.name}` : `Archive ${v.name}`}>{t.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}</IconButton>
            </form>
            <Button type="button" variant="secondary" className="h-8 px-2.5" onClick={() => setEditing(true)}><Pencil aria-hidden />Edit</Button>
          </span>
        )}
      </div>
      {editing && (
        <div className="mt-4 border-t border-line pt-4">
          <TutorForm tutor={v} zones={zones} onDone={() => setEditing(false)} />
        </div>
      )}
    </Card>
  );
}

export function TutorCards({ tutors, zones, owner }: { tutors: TutorSummary[]; zones: string[]; owner: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      {owner && (adding ? (
        <Card title="New tutor"><TutorForm zones={zones} onDone={() => setAdding(false)} /></Card>
      ) : (
        <div><Button type="button" onClick={() => setAdding(true)}><Plus aria-hidden />Add a tutor</Button></div>
      ))}
      {tutors.length === 0 && !adding && <Empty>No tutors yet.</Empty>}
      {tutors.map((t) => <TutorCard key={t.values.id} t={t} zones={zones} owner={owner} />)}
    </div>
  );
}
