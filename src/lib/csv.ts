/** CSV the way spreadsheets expect it: quoted fields, CRLF lines, a UTF-8 BOM so Excel reads accents. */
export type CsvCell = string | number | boolean | Date | null | undefined;

function cell(v: CsvCell): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = v.replace(/\r?\n/g, " ");
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Cents as "130.00" for a money column. */
export const money = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2));
