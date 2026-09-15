"use client";

import { useState } from "react";
import { Checkbox, Input } from "@/src/components/ui";

export interface UsedFileOption { id: string; name: string; uses: number }

/**
 * Files attached to earlier assignments, newest first, with a search box.
 * Tick the ones to attach again. Replaces the old library.
 */
export function UsedBefore({ files }: { files: UsedFileOption[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const shown = files.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand hover:underline">Attach a file used before ({files.length})</button>;
  return (
    <fieldset className="rounded-xl border border-dashed border-line-strong bg-surface-2/40 p-3" data-testid="used-before">
      <legend className="px-1 text-[13px] font-medium text-fg/80">Used before</legend>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search files used before" className="mb-2 h-8 max-w-xs" />
      <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
        {shown.length === 0 ? <p className="text-muted">Nothing matches.</p> : shown.map((f) => (
          <Checkbox key={f.id} name="fileIds" value={f.id} label={<span>{f.name} <span className="text-xs text-muted">· used {f.uses} time{f.uses === 1 ? "" : "s"}</span></span>} />
        ))}
      </div>
    </fieldset>
  );
}
