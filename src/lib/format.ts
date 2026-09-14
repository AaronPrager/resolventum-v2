import { localDateStr, localTimeStr } from "./tz";

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function balanceText(cents: number): string {
  if (cents > 0) return `owes ${formatCents(cents)}`;
  if (cents < 0) return `credit ${formatCents(-cents)}`;
  return formatCents(0);
}

export function balanceClass(cents: number): string {
  return cents > 0 ? "text-red-700" : cents < 0 ? "text-green-700" : "";
}

/** "Mon Mar 20, 2026 4:00 PM" in the organization's zone. */
export function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

/** "6:45 PM" in the organization's zone. For display; forms keep HH:MM from localTimeStr. */
export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
}

/** "Sep 5, 2026" for a date-only column (stored as UTC midnight). */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(date);
}

export { localDateStr, localTimeStr };
