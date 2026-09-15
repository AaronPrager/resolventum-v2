import { formatCents } from "@/src/lib/format";
import type { MonthMoney } from "@/src/services/dashboard";

/**
 * Money collected per month as bars: one series, one hue, the current month
 * lighter because it is not over yet. Thin bars with rounded tops on a quiet
 * baseline; the biggest month and the current one carry a label, the rest are
 * read on hover. A table underneath holds every number for anyone who wants it.
 */
export function MoneyChart({ months }: { months: MonthMoney[] }) {
  const W = 560, H = 180, padX = 8, padTop = 26, padBottom = 28;
  const max = Math.max(1, ...months.map((m) => m.collectedCents));
  const iMax = months.findIndex((m) => m.collectedCents === max);
  const slot = (W - padX * 2) / months.length;
  const barW = Math.min(44, slot * 0.55);
  const plotH = H - padTop - padBottom;
  const y = (cents: number) => padTop + plotH - (cents / max) * plotH;
  const short = (cents: number) => (cents >= 100000 ? `$${(cents / 100000).toFixed(cents % 100000 === 0 ? 0 : 1)}k` : formatCents(cents).replace(/\.00$/, ""));
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Money collected per month, last ${months.length} months`}>
        {[0.5, 1].map((f) => <line key={f} x1={padX} x2={W - padX} y1={y(max * f)} y2={y(max * f)} className="stroke-line" strokeWidth={1} strokeDasharray={f === 1 ? "2 4" : undefined} />)}
        <line x1={padX} x2={W - padX} y1={padTop + plotH + 0.5} y2={padTop + plotH + 0.5} className="stroke-line-strong" strokeWidth={1} />
        {months.map((m, i) => {
          const cx = padX + slot * i + slot / 2;
          const top = y(m.collectedCents);
          const h = Math.max(0, padTop + plotH - top);
          const labelled = i === iMax || m.current;
          return (
            <g key={m.month} className="group">
              <title>{`${m.label}: ${formatCents(m.collectedCents)} collected${m.refundedCents ? `, ${formatCents(m.refundedCents)} refunded` : ""}, ${m.lessons} lesson${m.lessons === 1 ? "" : "s"}${m.current ? " (so far)" : ""}`}</title>
              <rect x={cx - slot / 2} y={padTop} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - barW / 2},${padTop + plotH} v${-(h - Math.min(4, h))} a4,4 0 0 1 4,-${Math.min(4, h)} h${barW - 8} a4,4 0 0 1 4,${Math.min(4, h)} v${h - Math.min(4, h)} z`}
                  className={`${m.current ? "fill-brand/45" : "fill-brand"} transition-opacity group-hover:opacity-80`}
                />
              )}
              <text x={cx} y={H - 9} textAnchor="middle" className={`fill-muted text-[11px] ${m.current ? "font-medium" : ""}`}>{m.label}</text>
              {labelled && m.collectedCents > 0 && <text x={cx} y={top - 7} textAnchor="middle" className="fill-fg text-[11px] font-medium tabular-nums">{short(m.collectedCents)}</text>}
            </g>
          );
        })}
      </svg>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">As a table</summary>
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="font-medium">Month</th><th className="text-right font-medium">Collected</th><th className="text-right font-medium">Refunded</th><th className="text-right font-medium">Lessons</th></tr></thead>
          <tbody>{months.map((m) => <tr key={m.month}><td className="py-0.5">{m.label}{m.current ? " (so far)" : ""}</td><td className="text-right tabular-nums">{formatCents(m.collectedCents)}</td><td className="text-right tabular-nums">{formatCents(m.refundedCents)}</td><td className="text-right tabular-nums">{m.lessons}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
