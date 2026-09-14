/**
 * The component set. Plain functions, no client code, so every page and
 * client form can use them. Money and balance colors live here so a number
 * looks the same everywhere.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatCents } from "@/src/lib/format";

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- buttons

const buttonBase = "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
const buttonVariants = {
  primary: "bg-brand text-brand-fg hover:bg-brand-strong px-3.5 py-2",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-3 px-3.5 py-2",
  danger: "bg-owed text-white border border-owed hover:opacity-90 px-3.5 py-2",
  ghost: "text-brand hover:bg-brand-soft px-2 py-1",
  link: "text-brand hover:underline px-0 py-0 font-normal",
};
export type ButtonVariant = keyof typeof buttonVariants;

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button {...props} className={cx(buttonBase, buttonVariants[variant], className)} />;
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={cx(buttonBase, buttonVariants[variant], className)} />;
}

// ---------------------------------------------------------------- fields

const control = "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

export function Field({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cx("flex flex-col gap-1 text-sm", className)}>
      <span className="text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(control, className)} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx(control, className)} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(control, className)} />;
}
export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex items-center gap-2 text-sm", className)}>
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-line accent-brand" />
      <span>{label}</span>
    </label>
  );
}
export function Radio({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex items-center gap-2 text-sm", className)}>
      <input type="radio" {...props} className="h-4 w-4 accent-brand" />
      <span>{label}</span>
    </label>
  );
}
export function FormError({ children }: { children?: ReactNode }) {
  return children ? <p role="alert" className="rounded-md bg-owed-soft px-3 py-2 text-sm text-owed">{children}</p> : null;
}
export function FormOk({ children }: { children?: ReactNode }) {
  return children ? <p role="status" className="rounded-md bg-credit-soft px-3 py-2 text-sm text-credit">{children}</p> : null;
}

// ---------------------------------------------------------------- layout pieces

export function PageHeader({ title, back, subtitle, actions }: { title: ReactNode; back?: { href: string; label: string }; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back && <Link href={back.href} className="text-sm text-brand hover:underline">{back.label}</Link>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-line bg-surface p-4 shadow-sm", className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone, ...props }: { label: ReactNode; value: ReactNode; tone?: "owed" | "credit" | "muted" } & ComponentProps<"div">) {
  return (
    <div {...props} className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div data-stat-value className={cx("mt-0.5 text-lg font-semibold tabular-nums", tone === "owed" && "text-owed", tone === "credit" && "text-credit", tone === "muted" && "text-muted")}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "owed" | "credit" | "warn" }) {
  const tones = {
    neutral: "bg-surface-3 text-muted",
    brand: "bg-brand-soft text-brand",
    owed: "bg-owed-soft text-owed",
    credit: "bg-credit-soft text-credit",
    warn: "bg-warn-soft text-warn",
  };
  return <span className={cx("inline-block rounded px-1.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

// ---------------------------------------------------------------- tables

/** Wraps a table so it scrolls sideways on a phone instead of the page. */
export function TableWrap({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} className={cx("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      {children}
    </div>
  );
}
export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table {...props} className={cx("w-full text-sm", className)} />;
}
export function Th({ className, right, ...props }: ComponentProps<"th"> & { right?: boolean }) {
  return <th {...props} className={cx("border-b border-line py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted last:pr-0", right && "text-right", className)} />;
}
export function Td({ className, right, num, ...props }: ComponentProps<"td"> & { right?: boolean; num?: boolean }) {
  return <td {...props} className={cx("border-b border-line/70 py-2 pr-4 align-top last:pr-0", right && "text-right", num && "tabular-nums whitespace-nowrap", className)} />;
}

// ---------------------------------------------------------------- money

export function Money({ cents, signed }: { cents: number; signed?: boolean }) {
  const text = formatCents(Math.abs(cents));
  return <span className={cx("tabular-nums", signed && cents < 0 && "text-owed")}>{signed && cents < 0 ? `-${text}` : formatCents(cents)}</span>;
}

/** A balance where positive means the family owes. */
export function Balance({ cents, className }: { cents: number; className?: string }) {
  if (cents > 0) return <span className={cx("tabular-nums text-owed", className)}>owes {formatCents(cents)}</span>;
  if (cents < 0) return <span className={cx("tabular-nums text-credit", className)}>credit {formatCents(-cents)}</span>;
  return <span className={cx("tabular-nums text-muted", className)}>{formatCents(0)}</span>;
}

export { cx };
