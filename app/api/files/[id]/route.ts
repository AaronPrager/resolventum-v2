import { prisma } from "@/src/db";
import { currentSession } from "@/src/auth/current";
import { fileForDownload } from "@/src/services/files";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await currentSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const { id } = await ctx.params;
  const f = await fileForDownload(prisma, s.organizationId, id);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data!), {
    headers: { "Content-Type": f.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`, "Cache-Control": "private, max-age=3600" },
  });
}
