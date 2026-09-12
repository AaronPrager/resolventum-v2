import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/db";
import { formatCents } from "@/src/lib/format";
import { accountStatement } from "@/src/services/statement";

export const dynamic = "force-dynamic";

function parseDate(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function balanceText(cents: number): string {
  if (cents > 0) return `owes ${formatCents(cents)}`;
  if (cents < 0) return `credit ${formatCents(-cents)}`;
  return formatCents(0);
}

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const from = parseDate(q.from);
  const to = parseDate(q.to);
  const st = await accountStatement(prisma, id, { from, to });
  if (!st) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-blue-700 hover:underline">All accounts</Link>
        <h1 className="mt-1 text-xl font-semibold">{st.accountName}</h1>
        <p className="text-sm text-gray-600">{st.studentNames.join(", ")}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          <span className="text-gray-600">From</span>
          <input type="date" name="from" defaultValue={from ? fmtDate(from) : ""} className="rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-600">To</span>
          <input type="date" name="to" defaultValue={to ? fmtDate(to) : ""} className="rounded border border-gray-300 px-2 py-1" />
        </label>
        <button type="submit" className="rounded bg-gray-900 px-3 py-1.5 text-white">Show</button>
        {(from || to) && <Link href={`/accounts/${id}`} className="text-blue-700 hover:underline">All time</Link>}
      </form>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-gray-600">Opening balance</dt><dd className="tabular-nums">{balanceText(st.openingBalanceCents)}</dd>
        <dt className="text-gray-600">Charged</dt><dd className="tabular-nums">{formatCents(st.chargedCents)}</dd>
        <dt className="text-gray-600">Paid</dt><dd className="tabular-nums">{formatCents(st.paidCents)}</dd>
        <dt className="text-gray-600">Closing balance</dt>
        <dd className={`font-semibold tabular-nums ${st.closingBalanceCents > 0 ? "text-red-700" : st.closingBalanceCents < 0 ? "text-green-700" : ""}`}>
          {balanceText(st.closingBalanceCents)}
        </dd>
      </dl>

      <table className="w-full text-sm" data-testid="statement">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-600">
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Description</th>
            <th className="py-2 pr-4 text-right font-medium">Charge</th>
            <th className="py-2 pr-4 text-right font-medium">Payment</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {st.entries.map((e) => (
            <tr key={`${e.kind}-${e.id}`} className="border-b border-gray-100 align-top">
              <td className="py-2 pr-4 whitespace-nowrap tabular-nums">{fmtDate(e.date)}</td>
              <td className="py-2 pr-4">
                <div>
                  {e.description}
                  {e.studentName && st.studentNames.length > 1 && <span className="text-gray-500"> ({e.studentName})</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {e.kind === "charge" ? e.subkind.toLowerCase() : e.subkind.toLowerCase().replace("_", " ")}
                  {e.appliedPayments.length > 0 && (
                    <> · paid by {e.appliedPayments.map((a) => `${formatCents(a.amountCents)} on ${fmtDate(a.paidOn)}`).join(", ")}</>
                  )}
                </div>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{e.kind === "charge" ? formatCents(e.deltaCents) : ""}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{e.kind === "payment" ? formatCents(-e.deltaCents) : ""}</td>
              <td className={`py-2 text-right tabular-nums ${e.runningBalanceCents > 0 ? "text-red-700" : e.runningBalanceCents < 0 ? "text-green-700" : ""}`}>
                {balanceText(e.runningBalanceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {st.entries.length === 0 && <p className="text-sm text-gray-500">Nothing in this period.</p>}
    </div>
  );
}
