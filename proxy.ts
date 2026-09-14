/**
 * Cheap gate: no session cookie, no app. The real check is requireSession()
 * in every page and action; this just keeps unauthenticated traffic off them.
 */
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/src/auth/constants";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/" || pathname === "/icon.svg" || pathname.startsWith("/login") || pathname.startsWith("/api/dev-login") || pathname.startsWith("/api/calendar/") || pathname.startsWith("/h/") || pathname.startsWith("/api/h/") || pathname.startsWith("/api/health") || pathname.startsWith("/api/cron") || pathname.startsWith("/signup") || pathname.startsWith("/forgot") || pathname.startsWith("/reset") || pathname.startsWith("/invite/") || pathname.startsWith("/join/")) return NextResponse.next();
  if (!req.cookies.get(COOKIE_NAME)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
