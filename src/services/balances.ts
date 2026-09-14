/**
 * Account balances, derived every time from charges and payments.
 * Positive balanceCents = the family owes money. Negative = credit on account.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export interface AccountBalance {
  accountId: string;
  name: string;
  archived: boolean;
  chargedCents: number;
  paidCents: number;
  balanceCents: number;
  studentNames: string[];
}

/** Balances as of a date (inclusive). Future charges and payments are left out. */
/** `asOf` is a calendar day in the school's zone (see localDateOnly), not an instant. */
export async function accountBalances(prisma: PrismaClient, organizationId: string, asOf: Date): Promise<AccountBalance[]> {
  const asOfStr = asOf.toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<
    { id: string; name: string; archivedAt: Date | null; charged: bigint; paid: bigint; students: string[] }[]
  >`
    select a.id, a.name, a."archivedAt",
      coalesce((select sum(c."amountCents") from "Charge" c
                where c."accountId" = a.id and c."voidedAt" is null and c."chargedOn" <= ${asOfStr}::date), 0)::bigint as charged,
      coalesce((select sum(p."amountCents") from "Payment" p
                where p."accountId" = a.id and p."voidedAt" is null and p."paidOn" <= ${asOfStr}::date), 0)::bigint as paid,
      coalesce((select array_agg(s."firstName" || ' ' || s."lastName" order by s."firstName")
                from "Student" s where s."accountId" = a.id and s."deletedAt" is null), '{}') as students
    from "Account" a
    where a."organizationId" = ${organizationId}
    order by a.name`;
  return rows.map((r) => ({
    accountId: r.id,
    name: r.name,
    archived: r.archivedAt !== null,
    chargedCents: Number(r.charged),
    paidCents: Number(r.paid),
    balanceCents: Number(r.charged) - Number(r.paid),
    studentNames: r.students,
  }));
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
