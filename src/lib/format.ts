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

export function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(date);
}

export { localDateStr, localTimeStr };
