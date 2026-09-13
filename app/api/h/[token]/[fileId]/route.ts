import { prisma } from "@/src/db";
import { publicFile } from "@/src/services/homework";

export const dynamic = "force-dynamic";

/** Files a student may download through their homework link. Public by token. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await ctx.params;
  const f = await publicFile(prisma, token, fileId);
  if (!f || !f.data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`, "Cache-Control": "private, max-age=600" },
  });
}
