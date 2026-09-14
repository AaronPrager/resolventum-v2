/** The mark and wordmark. The mark alone is used as the favicon too (app/icon.svg). */
export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-strong text-[15px] font-bold text-white shadow-xs">
        R
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.01em]">Resolventum</span>}
    </span>
  );
}
