"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input, Select } from "@/src/components/ui";

/** Date range, student, and tutor on the payments list. Every choice rides along in the URL. */
export function PaymentFilters({ from, to, student, tutor, students, tutors }: {
  from: string;
  to: string;
  student: string;
  tutor: string;
  students: { id: string; name: string }[];
  tutors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function go(next: Partial<{ from: string; to: string; student: string; tutor: string }>) {
    const v = { from, to, student, tutor, ...next };
    const q = new URLSearchParams();
    if (v.from) q.set("from", v.from);
    if (v.to) q.set("to", v.to);
    if (v.student) q.set("student", v.student);
    if (v.tutor) q.set("tutor", v.tutor);
    start(() => router.push(`/payments?${q.toString()}`));
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="inline-flex items-center gap-1.5">
        <span className="text-muted">From</span>
        <Input type="date" value={from} disabled={pending} onChange={(e) => e.target.value && go({ from: e.target.value })} aria-label="From" className="w-40" />
      </label>
      <label className="inline-flex items-center gap-1.5">
        <span className="text-muted">to</span>
        <Input type="date" value={to} disabled={pending} onChange={(e) => e.target.value && go({ to: e.target.value })} aria-label="To" className="w-40" />
      </label>
      <div className="w-52">
        <Select aria-label="Student" value={student} disabled={pending} onChange={(e) => go({ student: e.target.value })}>
          <option value="">All students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      {tutors.length > 0 && (
        <div className="w-44">
          <Select aria-label="Tutor" value={tutor} disabled={pending} onChange={(e) => go({ tutor: e.target.value })}>
            <option value="">All tutors</option>
            {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
      )}
    </div>
  );
}
