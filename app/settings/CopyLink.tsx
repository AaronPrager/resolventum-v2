"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyLink({ url, testId }: { url: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs" data-testid={testId}>{url}</code>
      <button
        type="button"
        onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-surface-2"
      >
        {copied ? <Check className="size-4 text-credit" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
