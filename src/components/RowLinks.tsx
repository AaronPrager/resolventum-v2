"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Makes every table row with a data-href open that page when clicked, the
 * way a list of files does. Clicks on links, buttons, and inputs inside the
 * row still do their own thing. Wrap the table in it.
 */
export function RowLinks({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("a, button, input, select, label, form")) return;
      const tr = t.closest("tr[data-href]") as HTMLElement | null;
      if (tr?.dataset.href) router.push(tr.dataset.href);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [router]);
  return <div ref={ref} className="[&_tr[data-href]]:cursor-pointer">{children}</div>;
}
