"use client";

import { useRouter } from "next/navigation";

/** Narrows every calendar view to one tutor. The choice rides along in the URL. */
export function TutorFilter({ tutors, value, hrefFor }: { tutors: { id: string; name: string }[]; value: string; hrefFor: Record<string, string> }) {
  const router = useRouter();
  return (
    <select
      aria-label="Tutor"
      value={value}
      onChange={(e) => router.push(hrefFor[e.target.value])}
      className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-fg"
    >
      <option value="">All tutors</option>
      {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      <option value="none">No tutor set</option>
    </select>
  );
}
