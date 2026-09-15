"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/src/components/ui";

/** Narrow the homework list to one student. The choice rides in the URL next to the status tab. */
export function StudentFilter({ students, selected, status }: { students: { id: string; name: string }[]; selected: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Student"
      value={selected}
      disabled={pending}
      onChange={(e) => start(() => router.push(`/homework?status=${status}${e.target.value ? `&student=${e.target.value}` : ""}`))}
      className="h-9 w-56"
    >
      <option value="">All students</option>
      {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  );
}
