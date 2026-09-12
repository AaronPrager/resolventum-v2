import Link from "next/link";
import { prisma } from "@/src/db";
import { accountBalances } from "@/src/services/balances";
import { formatCents } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p>No organization yet. Run the import.</p>;
  const balances = await accountBalances(prisma, org.id, new Date());
  const open = balances.filter((b) => b.balanceCents !== 0);
  const owed = open.filter((b) => b.balanceCents > 0).reduce((s, b) => s + b.balanceCents, 0);
  const credit = open.filter((b) => b.balanceCents < 0).reduce((s, b) => s - b.balanceCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{org.name}</h1>
        <p className="text-sm text-gray-600">
          {balances.length} accounts. Owed to you {formatCents(owed)}, credit held {formatCents(credit)}.
        </p>
      </div>
      <table className="w-full text-sm" data-testid="balances">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-600">
            <th className="py-2 pr-4 font-medium">Account</th>
            <th className="py-2 pr-4 font-medium">Students</th>
            <th className="py-2 pr-4 text-right font-medium">Charged</th>
            <th className="py-2 pr-4 text-right font-medium">Paid</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {open.map((b) => (
            <tr key={b.accountId} className="border-b border-gray-100">
              <td className="py-2 pr-4"><Link href={`/accounts/${b.accountId}`} className="text-blue-700 hover:underline">{b.name}</Link></td>
              <td className="py-2 pr-4 text-gray-600">{b.studentNames.join(", ")}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatCents(b.chargedCents)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatCents(b.paidCents)}</td>
              <td className={`py-2 text-right tabular-nums ${b.balanceCents > 0 ? "text-red-700" : "text-green-700"}`}>
                {b.balanceCents > 0 ? `owes ${formatCents(b.balanceCents)}` : `credit ${formatCents(-b.balanceCents)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">{balances.length - open.length} accounts at zero are not listed.</p>
    </div>
  );
}
