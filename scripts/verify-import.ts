/**
 * Compare the v1 copy against the imported v2 database. Exits non-zero on any mismatch.
 *
 *   npx tsx scripts/verify-import.ts
 *
 * Balance rule being compared (cents), positive = credit, same sign as the v1 Students page
 * (ledgerStatement.finalBalance):
 *   v1  sum(Payment.amount, all types, date <= today)  -  sum(Lesson.price, New York date <= today)
 *   v2  sum(Payment.amountCents, paidOn <= today)      -  sum(Charge.amountCents, chargedOn <= today)
 * Charges created by the import's post-import fixes (description starts with "[v2 fix]") are left
 * out of the v2 side, since v1 cannot hold them. They are listed.
 */
import "dotenv/config";
import pg from "pg";
import { prisma } from "../src/db.js";

const SOURCE_URL =
  process.env.SOURCE_DATABASE_URL ?? "postgresql://faina@localhost:5432/resolventum_prod_copy";
const src = new pg.Pool({ connectionString: SOURCE_URL });
let failures = 0;

async function v1<T = Record<string, any>>(sql: string): Promise<T[]> {
  return (await src.query(sql)).rows as T[];
}
async function v2<T = Record<string, any>>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}
function money(c: number | bigint) {
  return (Number(c) / 100).toFixed(2);
}
function check(label: string, a: number | bigint, b: number | bigint, unit: "cents" | "n" = "n") {
  const same = Number(a) === Number(b);
  if (!same) failures++;
  const fmt = (x: number | bigint) => (unit === "cents" ? money(x) : String(x));
  console.log(`${same ? "ok  " : "FAIL"} ${label.padEnd(44)} v1 ${fmt(a).padStart(12)}   v2 ${fmt(b).padStart(12)}`);
}

const NY = `(("dateTime" at time zone 'UTC') at time zone 'America/New_York')::date`;

async function main() {
  console.log("== counts");
  const c1 = (await v1(`
    select
      (select count(*) from "Student" where "organizationId" = (select id from "Organization" where name = 'Easy STEM School')) students,
      (select count(*) from "Lesson" where "studentId" is not null) lessons,
      (select count(*) from "Payment" where type <> 'ADJUSTMENT') payments,
      (select count(*) from "Payment" where type = 'ADJUSTMENT') adjustments,
      (select count(*) from "LessonPayment") allocations,
      (select count(*) from "Transaction") expenses,
      (select count(*) from "Transaction" where "isRecurring") recurring,
      (select count(*) from "Assignment") + (select count(*) from "StudentAssignedResource") assignments,
      (select count(*) from "Submission") submissions,
      (select count(*) from "LessonProgress") progress,
      (select count(*) from "UserResource") library_files,
      (select count(*) from "Payment" where "taxReturnReportedAt" is not null) payments_tax_reported,
      (select count(*) from "Transaction" where "taxReturnReportedAt" is not null) expenses_tax_reported
  `))[0];
  const c2 = (await v2(`
    select
      (select count(*) from "Student") students,
      (select count(*) from "LessonStudent") lessons,
      (select count(*) from "Payment") payments,
      (select count(*) from "Charge" where kind = 'ADJUSTMENT' and description not like '[v2 fix]%') adjustments,
      (select count(*) from "Allocation") allocations,
      (select count(*) from "Expense") expenses,
      (select count(*) from "RecurringExpense") recurring,
      (select count(*) from "Assignment") assignments,
      (select count(*) from "Submission") submissions,
      (select count(*) from "ProgressNote") progress,
      (select count(*) from "LibraryItem") library_files,
      (select count(*) from "Payment" where "taxReportedAt" is not null) payments_tax_reported,
      (select count(*) from "Expense" where "taxReportedAt" is not null) expenses_tax_reported
  `))[0];
  for (const k of Object.keys(c1)) check(k, c1[k], c2[k]);

  console.log("\n== money totals (all dates)");
  const m1 = (await v1(`
    select
      (select coalesce(sum(round(price * 100)), 0) from "Lesson" where "studentId" is not null) billed,
      (select coalesce(sum(round(amount * 100)), 0) from "Payment" where type <> 'ADJUSTMENT') paid,
      (select coalesce(sum(round(-amount * 100)), 0) from "Payment" where type = 'ADJUSTMENT') adjusted,
      (select coalesce(sum(round(amount * 100)), 0) from "LessonPayment") allocated,
      (select coalesce(sum(round("grossAmount" * 100)), 0) from "Transaction") spent
  `))[0];
  const m2 = (await v2(`
    select
      (select coalesce(sum("amountCents"), 0) from "Charge" where kind = 'LESSON') billed,
      (select coalesce(sum("amountCents"), 0) from "Payment") paid,
      (select coalesce(sum("amountCents"), 0) from "Charge" where kind = 'ADJUSTMENT' and description not like '[v2 fix]%') adjusted,
      (select coalesce(sum("amountCents"), 0) from "Allocation") allocated,
      (select coalesce(sum("amountCents"), 0) from "Expense") spent
  `))[0];
  for (const k of Object.keys(m1)) check(k, m1[k], m2[k], "cents");

  console.log("\n== payments by year");
  const py1 = await v1(`select extract(year from date)::int y, sum(round(amount * 100)) c from "Payment" where type <> 'ADJUSTMENT' group by 1 order by 1`);
  const py2 = await v2(`select extract(year from "paidOn")::int y, sum("amountCents") c from "Payment" group by 1 order by 1`);
  for (const r of py1) check(`payments ${r.y}`, r.c, py2.find((x) => x.y === r.y)?.c ?? 0, "cents");

  console.log("\n== expenses by year and treatment");
  const ex1 = await v1(`
    select (case when extract(year from date) < 100 then extract(year from date) + 2000 else extract(year from date) end)::int y,
           "taxTreatment" t, sum(round("grossAmount" * 100)) c
    from "Transaction" group by 1, 2 order by 1, 2`);
  const ex2 = await v2(`select extract(year from "spentOn")::int y, "taxTreatment" t, sum("amountCents") c from "Expense" group by 1, 2 order by 1, 2`);
  for (const r of ex1) check(`${r.y} ${r.t}`, r.c, ex2.find((x) => x.y === r.y && x.t === r.t)?.c ?? 0, "cents");

  console.log("\n== files");
  const f1 = (await v1(`
    select (select count(*) from "UserResource") n, (select coalesce(sum(length(data)), 0) from "UserResource") b,
           (select count(*) from "Submission" where "fileData" is not null) sn, (select coalesce(sum(length("fileData")), 0) from "Submission") sb`))[0];
  const f2 = (await v2(`
    select (select count(*) from "File" f join "LibraryItem" l on l."fileId" = f.id) n,
           (select coalesce(sum(f."sizeBytes"), 0) from "File" f join "LibraryItem" l on l."fileId" = f.id) b,
           (select count(*) from "Submission" where "fileId" is not null) sn,
           (select coalesce(sum(f."sizeBytes"), 0) from "Submission" s join "File" f on f.id = s."fileId") sb`))[0];
  check("library files", f1.n, f2.n);
  check("library bytes", f1.b, f2.b);
  check("submission files", f1.sn, f2.sn);
  check("submission bytes", f1.sb, f2.sb);

  console.log("\n== balance per student, as of today");
  const b1 = await v1(`
    select s.id, s."firstName" || ' ' || s."lastName" name,
      coalesce((select sum(round(p.amount * 100)) from "Payment" p where p."studentId" = s.id and p.date::date <= current_date), 0)
      - coalesce((select sum(round(l.price * 100)) from "Lesson" l where l."studentId" = s.id and ${NY} <= current_date), 0) as bal
    from "Student" s order by name`);
  const b2 = await v2(`
    select a.id,
      coalesce((select sum(p."amountCents") from "Payment" p where p."accountId" = a.id and p."paidOn" <= current_date and p."voidedAt" is null), 0)
      - coalesce((select sum(c."amountCents") from "Charge" c where c."accountId" = a.id and c."chargedOn" <= current_date and c."voidedAt" is null and c.description not like '[v2 fix]%'), 0) as bal
    from "Account" a`);
  const fixes = await v2(`select a.name, c.kind, c."chargedOn", c."amountCents", c.description from "Charge" c join "Account" a on a.id = c."accountId" where c.description like '[v2 fix]%' order by 3`);
  // v1 balances are per student; v2 balances are per account. Add v1 students up by their v2 account.
  const accountOf = new Map((await v2(`select id, "accountId" from "Student"`)).map((r) => [r.id, r.accountId as string]));
  const accountName = new Map((await v2(`select id, name from "Account"`)).map((r) => [r.id, r.name as string]));
  const v1ByAccount = new Map<string, { bal: number; names: string[] }>();
  for (const r of b1) {
    const acc = accountOf.get(r.id);
    if (!acc) { failures++; console.log(`     ${r.name}: missing in v2`); continue; }
    const cur = v1ByAccount.get(acc) ?? { bal: 0, names: [] };
    cur.bal += Number(r.bal);
    cur.names.push(r.name);
    v1ByAccount.set(acc, cur);
  }
  const b2map = new Map(b2.map((r) => [r.id, Number(r.bal)]));
  let balOk = 0;
  const mismatches: string[] = [];
  for (const [acc, v] of v1ByAccount) {
    const b = b2map.get(acc);
    if (b === undefined) { mismatches.push(`${accountName.get(acc)}: account missing in v2`); continue; }
    if (v.bal === b) balOk++;
    else mismatches.push(`${accountName.get(acc)} (${v.names.join(" + ")}): v1 ${money(v.bal)}  v2 ${money(b)}`);
  }
  console.log(`${mismatches.length === 0 ? "ok  " : "FAIL"} ${balOk} of ${v1ByAccount.size} account balances match (${b1.length} v1 students)`);
  for (const m of mismatches) { failures++; console.log(`     ${m}`); }
  for (const [acc, v] of v1ByAccount) if (v.names.length > 1) console.log(`     merged: ${accountName.get(acc)} = ${v.names.join(" + ")}, balance ${money(b2map.get(acc) ?? 0)}`);
  const owed = b1.filter((r) => Number(r.bal) < 0).length;
  const credit = b1.filter((r) => Number(r.bal) > 0).length;
  console.log(`     ${owed} owe money, ${credit} have credit, ${b1.length - owed - credit} at zero (before v2 fixes)`);
  for (const f of fixes) console.log(`     v2 fix: ${f.name} ${f.kind} ${money(f.amountCents)} on ${new Date(f.chargedOn).toISOString().slice(0, 10)}: ${String(f.description).replace('[v2 fix] ', '')}`);

  console.log("\n== allocation sanity in v2");
  const over = await v2(`
    select c.id, c."chargedOn", c."amountCents", sum(a."amountCents") alloc
    from "Charge" c join "Allocation" a on a."chargeId" = c.id
    group by c.id having sum(a."amountCents") > c."amountCents"`);
  const overPay = await v2(`
    select p.id, p."paidOn", p."amountCents", sum(a."amountCents") alloc
    from "Payment" p join "Allocation" a on a."paymentId" = p.id
    group by p.id having sum(a."amountCents") > p."amountCents"`);
  console.log(`${over.length ? "warn" : "ok  "} charges with more allocated than owed: ${over.length}`);
  for (const r of over) console.log(`     charge ${r.id} on ${new Date(r.chargedOn).toISOString().slice(0, 10)}: owed ${money(r.amountCents)}, allocated ${money(r.alloc)}`);
  console.log(`${overPay.length ? "FAIL" : "ok  "} payments with more allocated than paid: ${overPay.length}`);
  failures += overPay.length;
  const unalloc = (await v2(`
    select coalesce(sum(p."amountCents"), 0) - coalesce((select sum("amountCents") from "Allocation"), 0) c
    from "Payment" p where p.kind = 'PAYMENT'`))[0];
  console.log(`     unallocated payment money in v2: ${money(unalloc.c)}`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error("VERIFY FAILED:", e.message ?? e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await src.end(); });
