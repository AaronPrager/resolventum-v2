"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/src/components/ui";

/** The tutor and student pickers on the lessons list. The choice rides along in the URL with the other filters. */
export function LessonFilters({ tutors, students, tutor, student, when }: {
  tutors: { id: string; name: string }[];
  students: { id: string; name: string }[];
  tutor: string;
  student: string;
  when: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function go(next: { tutor?: string; student?: string }) {
    const q = new URLSearchParams();
    if (when !== "upcoming") q.set("when", when);
    const t = next.tutor ?? tutor;
    const s = next.student ?? student;
    if (t) q.set("tutor", t);
    if (s) q.set("student", s);
    const qs = q.toString();
    start(() => router.push(`/lessons${qs ? `?${qs}` : ""}`));
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tutors.length > 0 && (
        <div className="w-44">
          <Select aria-label="Tutor" value={tutor} disabled={pending} onChange={(e) => go({ tutor: e.target.value })}>
            <option value="">All tutors</option>
            {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="none">No tutor set</option>
          </Select>
        </div>
      )}
      <div className="w-52">
        <Select aria-label="Student" value={student} disabled={pending} onChange={(e) => go({ student: e.target.value })}>
          <option value="">All students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
    </div>
  );
}
