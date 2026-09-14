/**
 * The component set. Plain functions, no client code, so every page and
 * client form can use them. Money and balance colors live here so a number
 * looks the same everywhere.
 */
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { formatCents } from "@/src/lib/format";
import { SortableTable } from "./SortableTable";

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- buttons

const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";
const buttonVariants = {
  primary: "h-9 bg-brand px-3.5 text-brand-fg shadow-sm shadow-brand/20 hover:bg-brand-strong active:translate-y-px",
  secondary: "h-9 border border-line bg-surface px-3.5 text-fg shadow-xs hover:border-line-strong hover:bg-surface-2 active:translate-y-px",
  danger: "h-9 border border-owed/30 bg-owed-soft px-3.5 text-owed hover:bg-owed hover:text-white active:translate-y-px",
  ghost: "h-8 px-2.5 text-muted hover:bg-surface-3 hover:text-fg",
  link: "h-auto px-0 font-normal text-brand hover:underline",
};
export type ButtonVariant = keyof typeof buttonVariants;

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button {...props} className={cx(buttonBase, buttonVariants[variant], className)} />;
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={cx(buttonBase, buttonVariants[variant], className)} />;
}

/** A small square button holding one icon: edit, archive, delete. The label is the tooltip and the accessible name. */
export function IconButton({ label, tone = "neutral", className, children, ...props }: ComponentProps<"button"> & { label: string; tone?: "neutral" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
        tone === "danger" ? "hover:bg-owed-soft hover:text-owed" : "hover:bg-surface-3 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The icon buttons at the end of a list row. Faint until the row is hovered or one of them has focus; always shown on a touch screen. */
export function RowActions({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("ml-auto inline-flex shrink-0 items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", className)}>{children}</span>;
}

/** A list of rows with a hairline between them. Each row is a "group" so RowActions can react to hover. */
export function Rows({ children, className, ...props }: ComponentProps<"ul">) {
  return <ul {...props} className={cx("divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface", className)}>{children}</ul>;
}
export function Row({ children, className, ...props }: ComponentProps<"li">) {
  return <li {...props} className={cx("group flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm transition-colors hover:bg-surface-2/70", className)}>{children}</li>;
}

/** A dashed "add one" row at the foot of a list, holding a small form. */
export function AddRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2/40 px-3 py-2", className)}>
      <Plus className="size-4 shrink-0 text-faint" aria-hidden />
      {children}
    </div>
  );
}

/** Buttons that read as one control: Previous / Today / Next, Day / Week / Month. */
export function ButtonGroup({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cx(
        "inline-flex h-9 items-stretch overflow-hidden rounded-lg border border-line bg-surface shadow-xs [&>*]:inline-flex [&>*]:items-center [&>*]:px-3 [&>*]:text-sm [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- fields

const control =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg shadow-xs transition-[border-color,box-shadow] placeholder:text-faint hover:border-line-strong focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:bg-surface-2 disabled:text-faint";
const controlHeight = "h-9";

export function Field({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cx("flex flex-col gap-1.5 text-sm", className)}>
      <span className="text-[13px] font-medium text-fg/80">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(control, controlHeight, className)} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx(control, props.multiple ? "py-1.5" : controlHeight, className)} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(control, "py-2", className)} />;
}
export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="checkbox" {...props} className="size-4 rounded border-line accent-brand" />
      <span>{label}</span>
    </label>
  );
}
export function Radio({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="radio" {...props} className="size-4 accent-brand" />
      <span>{label}</span>
    </label>
  );
}
export function FormError({ children }: { children?: ReactNode }) {
  return children ? <p role="alert" className="rounded-lg border border-owed/20 bg-owed-soft px-3 py-2 text-sm text-owed">{children}</p> : null;
}
export function FormOk({ children }: { children?: ReactNode }) {
  return children ? <p role="status" className="rounded-lg border border-credit/20 bg-credit-soft px-3 py-2 text-sm text-credit">{children}</p> : null;
}

// ---------------------------------------------------------------- layout pieces

export function PageHeader({ title, back, subtitle, actions }: { title: ReactNode; back?: { href: string; label: string }; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="-ml-1 mb-1 inline-flex items-center gap-0.5 rounded text-[13px] text-muted hover:text-fg">
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, children, className, actions }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5", className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone, icon, ...props }: { label: ReactNode; value: ReactNode; tone?: "owed" | "credit" | "muted"; icon?: ReactNode } & ComponentProps<"div">) {
  return (
    <div {...props} className="min-w-0 rounded-2xl border border-line bg-surface px-3 py-3 shadow-sm sm:px-4 sm:py-3.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted sm:text-[13px]">
        <span className="truncate">{label}</span>
        {icon && <span className="hidden text-faint sm:inline [&_svg]:size-4">{icon}</span>}
      </div>
      <div
        data-stat-value
        className={cx("mt-1 truncate text-lg font-semibold tabular-nums tracking-[-0.02em] sm:text-2xl", tone === "owed" && "text-owed", tone === "credit" && "text-credit", tone === "muted" && "text-muted")}
      >
        {value}
      </div>
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
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-4", tones[tone])}>{children}</span>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-2/50 px-4 py-8 text-center text-sm text-muted">
      <p>{children}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- tables

/** Wraps a table so it scrolls sideways on a phone instead of the page. */
export function TableWrap({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} className={cx("-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5", className)}>
      {children}
    </div>
  );
}
/** Every table sorts by any heading with text; see SortableTable. */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return <SortableTable {...props} className={cx("w-full border-separate border-spacing-0 text-sm [&_tbody_tr:last-child>td]:border-b-0", className)} />;
}
export function Th({ className, right, ...props }: ComponentProps<"th"> & { right?: boolean }) {
  return (
    <th
      {...props}
      className={cx("whitespace-nowrap border-b border-line pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-muted last:pr-0", right && "text-right", className)}
    />
  );
}
export function Td({ className, right, num, ...props }: ComponentProps<"td"> & { right?: boolean; num?: boolean }) {
  return <td {...props} className={cx("border-b border-line py-2.5 pr-4 align-top last:pr-0", right && "text-right", num && "whitespace-nowrap tabular-nums", className)} />;
}

// ---------------------------------------------------------------- money

export function Money({ cents, signed }: { cents: number; signed?: boolean }) {
  const text = formatCents(Math.abs(cents));
  return <span className={cx("tabular-nums", signed && cents < 0 && "text-owed")}>{signed && cents < 0 ? `-${text}` : formatCents(cents)}</span>;
}

/** A balance where positive means the family owes. */
export function Balance({ cents, className }: { cents: number; className?: string }) {
  if (cents > 0) return <span className={cx("tabular-nums font-medium text-owed", className)}>owes {formatCents(cents)}</span>;
  if (cents < 0) return <span className={cx("tabular-nums font-medium text-credit", className)}>credit {formatCents(-cents)}</span>;
  return <span className={cx("tabular-nums text-faint", className)}>{formatCents(0)}</span>;
}

/** Initials in a circle, for people with no photo. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <span aria-hidden className={cx("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand", className)}>
      {initials}
    </span>
  );
}

export { cx };
