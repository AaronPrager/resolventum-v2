"use client";

import { useState, type ComponentProps } from "react";
import { cx } from "./ui";

const MB = 1024 * 1024;
export const UPLOAD_LIMITS = {
  /** One file (matches MAX_FILE_BYTES on the server). */
  fileBytes: 25 * MB,
  /** Everything in one submit (under the 30 MB server action cap). */
  totalBytes: 28 * MB,
};

function size(n: number) {
  return n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * A file picker that checks sizes and counts as soon as files are chosen, says
 * what is wrong in plain words, and stops the form from sending until it is fixed.
 */
export function FileInput({ maxBytes = UPLOAD_LIMITS.fileBytes, maxTotalBytes = UPLOAD_LIMITS.totalBytes, maxFiles, className, onChange, ...props }: ComponentProps<"input"> & { maxBytes?: number; maxTotalBytes?: number; maxFiles?: number }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <input
        {...props}
        type="file"
        aria-invalid={problem ? true : undefined}
        className={cx(
          "w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg shadow-xs file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-2.5 file:py-1 file:text-sm file:font-medium hover:border-line-strong",
          problem && "border-owed",
          className,
        )}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          let msg: string | null = null;
          const big = files.find((f) => f.size > maxBytes);
          const total = files.reduce((s, f) => s + f.size, 0);
          if (maxFiles && files.length > maxFiles) msg = `Pick up to ${maxFiles} files at a time.`;
          else if (big) msg = `${big.name} is ${size(big.size)}, and the limit is ${size(maxBytes)}. Try a smaller file or a photo at lower quality.`;
          else if (total > maxTotalBytes) msg = `These files add up to ${size(total)}, and one upload can be at most ${size(maxTotalBytes)}. Send them in two goes.`;
          else if (files.some((f) => f.size === 0)) msg = "One of the files is empty.";
          e.currentTarget.setCustomValidity(msg ?? "");
          setProblem(msg);
          onChange?.(e);
        }}
      />
      {problem && <p role="alert" className="text-xs text-owed">{problem}</p>}
    </div>
  );
}
