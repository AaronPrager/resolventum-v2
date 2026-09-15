"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/src/components/ui";

export interface PickerStudent { id: string; label: string }

/** Which student the page shows: a drop-down, with arrows to step through the list in order. The choice rides in the URL. */
export function StudentPicker({ students, selected, keep }: { students: PickerStudent[]; selected: string | null; /** Query parts to carry along, such as "archived=1". */ keep: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const i = students.findIndex((s) => s.id === selected);
  const go = (id: string) => start(() => router.push(`/students?${[keep, `s=${id}`].filter(Boolean).join("&")}`));
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="student-picker">
      <select
        value={selected ?? ""}
        onChange={(e) => go(e.target.value)}
        aria-label="Student"
        disabled={pending}
        className="h-10 min-w-64 max-w-full rounded-lg border border-line bg-surface pl-3 pr-9 text-[15px] font-medium text-fg shadow-xs hover:border-line-strong focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:opacity-60"
      >
        {selected === null && <option value="">Pick a student</option>}
        {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <span className="inline-flex items-center">
        <IconButton label="Previous student" disabled={i <= 0 || pending} onClick={() => go(students[i - 1].id)}><ChevronLeft aria-hidden /></IconButton>
        <IconButton label="Next student" disabled={i < 0 || i >= students.length - 1 || pending} onClick={() => go(students[i + 1].id)}><ChevronRight aria-hidden /></IconButton>
      </span>
      {i >= 0 && <span className="text-xs text-muted tabular-nums">{i + 1} of {students.length}</span>}
    </div>
  );
}
