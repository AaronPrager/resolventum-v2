import Link from "next/link";
import { prisma } from "@/src/db";
import { balanceClass, balanceText, formatDay } from "@/src/lib/format";
import { listStudents } from "@/src/services/students";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const q = await searchParams;
  const includeArchived = q.archived === "1";
  const org = await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const rows = await listStudents(prisma, org.id, { includeArchived });
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link href={includeArchived ? "/students" : "/students?archived=1"} className="text-sm text-blue-700 hover:underline">
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>
      <table className="w-full text-sm" data-testid="students">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-600">
            <th className="py-2 pr-4 font-medium">Student</th>
            <th className="py-2 pr-4 font-medium">Grade</th>
            <th className="py-2 pr-4 font-medium">Last lesson</th>
            <th className="py-2 pr-4 font-medium">Next lesson</th>
            <th className="py-2 pr-4 text-right font-medium">Lessons</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={`border-b border-gray-100 ${s.archived ? "text-gray-400" : ""}`}>
              <td className="py-2 pr-4"><Link href={`/students/${s.id}`} className="text-blue-700 hover:underline">{s.name}</Link>{s.archived && <span className="ml-2 text-xs">archived</span>}</td>
              <td className="py-2 pr-4">{s.grade ?? ""}</td>
              <td className="py-2 pr-4">{s.lastLessonAt ? formatDay(s.lastLessonAt, org.timezone) : ""}</td>
              <td className="py-2 pr-4">{s.nextLessonAt ? formatDay(s.nextLessonAt, org.timezone) : ""}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{s.lessonCount}</td>
              <td className={`py-2 text-right tabular-nums ${balanceClass(s.balanceCents)}`}>
                <Link href={`/accounts/${s.accountId}`} className="hover:underline">{balanceText(s.balanceCents)}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">{rows.length} students. Balance is the account's, so siblings share one.</p>
    </div>
  );
}
