import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** The frame for sign-in, sign-up, and password pages: mark on top, one card, a quiet footer. */
export function AuthShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-4 pt-[12vh]">
      <div className="mb-8"><Logo /></div>
      <div className={`w-full ${wide ? "max-w-md" : "max-w-sm"} rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8`}>{children}</div>
      <p className="mt-8 text-xs text-faint">Scheduling, billing, and homework for tutoring schools</p>
    </div>
  );
}
