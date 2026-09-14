"use client";

import { Children, cloneElement, isValidElement, useRef, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";

/**
 * Any table, sortable by clicking a column heading. The rows arrive rendered
 * from the server; on a click the text of each cell is read from the page
 * and the rows are re-ordered by it. Money ("owes $550.00", "credit $130.00",
 * "$1,234.00"), dates ("Sep 8, 2026"), and plain numbers sort as values;
 * everything else sorts as words. A cell can override its key with
 * data-sort. Headings with no text (an actions column) are not sortable.
 * Until a heading is clicked the order is whatever the page chose.
 */
type Key = number | string | null;
interface Sort { col: number; dir: 1 | -1 }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function keyOf(td: HTMLTableCellElement): Key {
  const raw = (td.dataset.sort ?? td.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const money = /(?:^|\s)(−|-)?\$([\d,]+(?:\.\d+)?)/.exec(raw);
  if (money) {
    const n = Number(money[2].replace(/,/g, ""));
    const negative = money[1] !== undefined || /^credit\b/i.test(raw);
    return negative ? -n : n;
  }
  if (/^-?[\d,]+(?:\.\d+)?%?$/.test(raw)) return Number(raw.replace(/[,%]/g, ""));
  // "Sep 8, 2026", "Mon Mar 20, 2026 4:00 PM", "2026-09-14", "2026-09-14 16:00"
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(raw);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0));
  const us = /^(?:[A-Za-z]{3},? )?([A-Za-z]{3})\.? (\d{1,2}),? (\d{4})(?:,? (\d{1,2}):(\d{2}) ?(AM|PM))?/i.exec(raw);
  if (us) {
    const m = MONTHS.indexOf(us[1].toLowerCase());
    if (m >= 0) {
      let h = us[4] ? Number(us[4]) : 0;
      if (us[6]?.toUpperCase() === "PM" && h < 12) h += 12;
      if (us[6]?.toUpperCase() === "AM" && h === 12) h = 0;
      return Date.UTC(Number(us[3]), m, Number(us[2]), h, us[5] ? Number(us[5]) : 0);
    }
  }
  return raw.toLowerCase();
}

function compare(a: Key, b: Key): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

type El = ReactElement<{ children?: ReactNode; className?: string; onClick?: () => void; "aria-sort"?: string; "data-row"?: number }>;
const isTag = (node: ReactNode, tag: string): node is El => isValidElement(node) && node.type === tag;

export function SortableTable({ children, ...props }: ComponentProps<"table">) {
  const ref = useRef<HTMLTableElement>(null);
  const [sort, setSort] = useState<Sort | null>(null);
  const [order, setOrder] = useState<number[] | null>(null);

  const kids = Children.toArray(children);
  const thead = kids.find((k) => isTag(k, "thead"));
  const tbody = kids.find((k) => isTag(k, "tbody"));
  const rows = tbody ? Children.toArray(tbody.props.children) : [];
  const sortable = !!thead && !!tbody && rows.length > 1 && rows.every((r) => isTag(r, "tr"));
  if (!sortable) return <table ref={ref} {...props}>{children}</table>;

  function clickHeading(col: number) {
    const table = ref.current;
    if (!table) return;
    const dir: 1 | -1 = sort?.col === col ? (sort.dir === 1 ? -1 : 1) : 1;
    // Read the keys from the page: the rows carry their original index however they are ordered now.
    const keys = new Map<number, Key>();
    for (const tr of Array.from(table.tBodies[0]?.rows ?? [])) {
      const i = Number(tr.dataset.row);
      const td = tr.cells[col];
      keys.set(i, td ? keyOf(td) : null);
    }
    const next = rows.map((_, i) => i).sort((a, b) => compare(keys.get(a) ?? null, keys.get(b) ?? null) * dir || a - b);
    setSort({ col, dir });
    setOrder(next);
  }

  const headRow = Children.toArray(thead!.props.children).find((r) => isTag(r, "tr"));
  const head = headRow
    ? cloneElement(thead!, {}, cloneElement(headRow, {}, Children.toArray(headRow.props.children).map((th, col) => {
        if (!isTag(th, "th")) return th;
        const label = Children.toArray(th.props.children).some((c) => typeof c === "string" ? c.trim() : true);
        if (!label) return th;
        const active = sort?.col === col;
        return cloneElement(th, {
          key: col,
          onClick: () => clickHeading(col),
          "aria-sort": active ? (sort!.dir === 1 ? "ascending" : "descending") : "none",
          className: `${th.props.className ?? ""} cursor-pointer select-none hover:text-fg`,
        }, <>{th.props.children}<span aria-hidden className={`ml-1 inline-block w-2 text-[10px] ${active ? "text-brand" : "text-transparent"}`}>{active && sort!.dir === -1 ? "▼" : "▲"}</span></>);
      })))
    : thead!;

  const ordered = (order ?? rows.map((_, i) => i)).map((i) => cloneElement(rows[i] as El, { key: `r${i}`, "data-row": i }));
  const body = cloneElement(tbody!, {}, ordered);
  const rest = kids.filter((k) => k !== thead && k !== tbody);
  return <table ref={ref} {...props}>{head}{body}{rest}</table>;
}
