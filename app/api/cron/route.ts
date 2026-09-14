import { prisma } from "@/src/db";
import { extendOpenSeries } from "@/src/services/series";
import { runRecurring } from "@/src/services/expenses";
import { nightlyEmails } from "@/src/services/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily housekeeping, called by Cloud Scheduler once a day with the
 * CRON_SECRET bearer header. Safe to run more than once: lessons and expenses
 * are only made when missing, and no reminder or schedule email goes out twice.
 * One school failing does not stop the others.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  const out = [];
  for (const org of orgs) {
    try {
      const lessons = await extendOpenSeries(prisma, org.id);
      const expenses = await runRecurring(prisma, org.id, new Date());
      const emails = await nightlyEmails(prisma, org.id);
      out.push({ organization: org.name, lessonsCreated: lessons, expensesCreated: expenses, emails });
    } catch (e) {
      console.error(`cron failed for ${org.name}`, e);
      out.push({ organization: org.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ ranAt: new Date().toISOString(), out });
}
