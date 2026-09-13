import { prisma } from "@/src/db";
import { extendOpenSeries } from "@/src/services/series";
import { runRecurring } from "@/src/services/expenses";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping, called by Vercel Cron (see vercel.json) with the
 * CRON_SECRET header Vercel adds. Safe to run any time: both jobs are idempotent.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  const out = [];
  for (const org of orgs) {
    const lessons = await extendOpenSeries(prisma, org.id);
    const expenses = await runRecurring(prisma, org.id, new Date());
    out.push({ organization: org.name, lessonsCreated: lessons, expensesCreated: expenses });
  }
  return Response.json({ ranAt: new Date().toISOString(), out });
}
