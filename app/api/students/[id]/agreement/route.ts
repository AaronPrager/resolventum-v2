import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { fileResponse } from "@/src/documents/http";
import { AgreementError, agreementPdf } from "@/src/documents/agreement";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await currentSession();
  if (!s) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  try {
    const d = await agreementPdf(prisma, s.organizationId, id, localDateOnly(new Date(), s.timezone));
    return fileResponse(d.bytes, d.filename, "application/pdf");
  } catch (e) {
    if (e instanceof AgreementError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
