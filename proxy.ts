/**
 * Cheap gate: no session cookie, no app. The real check is requireSession()
 * in every page and action; this just keeps unauthenticated traffic off them.
 */
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/src/auth/constants";

/** Pages that render on their own, outside the app frame, even for someone who is signed in. */
const BARE = new Set(["/welcome"]);

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // The root layout cannot see the address; tell it when a page wants no frame.
  const headers = new Headers(req.headers);
  headers.set("x-bare-page", BARE.has(pathname) ? "1" : "0");
  if (pathname === "/" || pathname === "/welcome" || pathname === "/icon.svg" || pathname.startsWith("/login") || pathname.startsWith("/api/dev-login") || pathname.startsWith("/api/calendar/") || pathname.startsWith("/h/") || pathname.startsWith("/api/h/") || pathname.startsWith("/api/health") || pathname.startsWith("/api/cron") || pathname.startsWith("/signup") || pathname.startsWith("/forgot") || pathname.startsWith("/reset") || pathname.startsWith("/invite/") || pathname.startsWith("/join/")) return NextResponse.next({ request: { headers } });
  if (!req.cookies.get(COOKIE_NAME)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
