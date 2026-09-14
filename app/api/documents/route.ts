import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { DocumentError, bulkDocuments } from "@/src/documents/accountDocs";
import { fileResponse } from "@/src/documents/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET ?kind=statement (every open balance)  or  ?kind=invoice&month=YYYY-MM. Returns a ZIP of PDFs. */
export async function GET(req: Request) {
  const session = await currentSession();
  if (!session) return new Response("Sign in first", { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") === "invoice" ? "invoice" : "statement";
  try {
    const d = await bulkDocuments(prisma, session.organizationId, { kind, month: q.get("month"), today: localDateOnly(new Date(), session.timezone) });
    return fileResponse(d.bytes, d.filename, "application/zip");
  } catch (e) {
    if (e instanceof DocumentError) return new Response(e.message, { status: 400 });
    throw e;
  }
}
