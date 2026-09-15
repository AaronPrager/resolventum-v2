"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "./ui";

/**
 * Narrow a list to one student. `href` is the page with its other filters
 * already in the query ("/homework?status=OPEN"); the student is added to it.
 */
export function StudentFilter({ students, selected, href }: { students: { id: string; name: string }[]; selected: string; href: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const join = href.includes("?") ? "&" : "?";
  return (
    <Select
      aria-label="Student"
      value={selected}
      disabled={pending}
      onChange={(e) => start(() => router.push(`${href}${e.target.value ? `${join}student=${e.target.value}` : ""}`))}
      className="h-9 w-56"
    >
      <option value="">All students</option>
      {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  );
}
