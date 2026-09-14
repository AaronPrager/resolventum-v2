import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { EXPORT_KINDS, type ExportKind, exportCsv, fullExport } from "@/src/services/exportData";
import { fileResponse } from "@/src/documents/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET ?what=students|accounts|ledger|payments|lessons|expenses|tutors|leads|notes as CSV, or ?what=all as a ZIP of every table. */
export async function GET(req: Request) {
  const s = await currentSession();
  if (!s) return new Response("Sign in first", { status: 401 });
  if (s.role === "TUTOR") return new Response("Ask the owner for an export", { status: 403 });
  const what = new URL(req.url).searchParams.get("what") ?? "all";
  const opts = { timeZone: s.timezone, today: localDateOnly(new Date(), s.timezone) };
  if (what === "all") {
    const z = await fullExport(prisma, s.organizationId, opts);
    return fileResponse(z.bytes, z.filename, "application/zip");
  }
  if (!(EXPORT_KINDS as string[]).includes(what)) return new Response("Unknown export", { status: 400 });
  const f = await exportCsv(prisma, s.organizationId, what as ExportKind, opts);
  return fileResponse(new TextEncoder().encode(f.csv), f.filename, "text/csv; charset=utf-8");
}
