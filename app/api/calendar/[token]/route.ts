import { prisma } from "@/src/db";
import { feedForToken } from "@/src/services/calendarFeed";

export const dynamic = "force-dynamic";

/** Public by token. Excluded from the login gate in proxy.ts. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const raw = token.replace(/\.ics$/, "");
  const feed = await feedForToken(prisma, raw);
  if (!feed) return new Response("Not found", { status: 404 });
  return new Response(feed.ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lessons.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
