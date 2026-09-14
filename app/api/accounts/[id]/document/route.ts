import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { DocumentError, accountDocument } from "@/src/documents/accountDocs";
import { fileResponse } from "@/src/documents/http";

export const dynamic = "force-dynamic";

/** GET ?kind=statement&from=&to=  or  ?kind=invoice&month=YYYY-MM. Add &inline=1 to open in the browser. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") === "invoice" ? "invoice" : "statement";
  try {
    const d = await accountDocument(prisma, session.organizationId, id, {
      kind, from: q.get("from"), to: q.get("to"), month: q.get("month"), today: localDateOnly(new Date(), session.timezone),
    });
    return fileResponse(d.bytes, d.filename, "application/pdf", q.get("inline") === "1");
  } catch (e) {
    if (e instanceof DocumentError) return new Response(e.message, { status: e.message.includes("not found") ? 404 : 400 });
    throw e;
  }
}
