import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { localDateOnly } from "@/src/lib/tz";
import { fileResponse } from "@/src/documents/http";
import { tutorSlip } from "@/src/documents/tutorSlipPdf";
import { PayrollError } from "@/src/services/payroll";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const month = new URL(req.url).searchParams.get("month") ?? "";
  try {
    const d = await tutorSlip(prisma, session.organizationId, id, month, localDateOnly(new Date(), session.timezone));
    return fileResponse(d.bytes, d.filename, "application/pdf");
  } catch (e) {
    if (e instanceof PayrollError) return new Response(e.message, { status: 400 });
    throw e;
  }
}
