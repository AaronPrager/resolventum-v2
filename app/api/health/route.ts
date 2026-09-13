import { prisma } from "@/src/db";

export const dynamic = "force-dynamic";

/** Liveness for uptime checks. Reports whether the database answers; never leaks details. */
export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
    return Response.json({ ok: true, db: true, time: new Date().toISOString() });
  } catch {
    return Response.json({ ok: false, db: false, time: new Date().toISOString() }, { status: 503 });
  }
}
