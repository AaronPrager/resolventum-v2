import { NextResponse } from "next/server";

/** The agreement page's plain form picks a student; send the browser to that student's PDF. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("student") ?? "";
  if (!/^[0-9a-f-]{20,40}$/i.test(id)) return new Response("Pick a student", { status: 400 });
  return NextResponse.redirect(new URL(`/api/students/${id}/agreement`, url.origin));
}
