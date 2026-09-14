"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** A month cell. Double-clicking the empty part of it starts a new lesson on that day. */
export function DayCell({ day, newHref, className, children }: { day: string; newHref: string; className: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <section
      className={className}
      data-day={day}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("a,[data-lesson]")) return; // a lesson or the day number handles its own double-click
        router.push(newHref);
      }}
      title="Double-click to add a lesson"
    >
      {children}
    </section>
  );
}
