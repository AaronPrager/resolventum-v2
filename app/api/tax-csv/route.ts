import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { taxCsv } from "@/src/services/expenses";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await currentSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());
  const csv = await taxCsv(prisma, s.organizationId, year);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="expenses-${year}.csv"` } });
}
