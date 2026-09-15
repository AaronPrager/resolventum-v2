import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { LogOut } from "lucide-react";
import { BottomNav } from "./Nav";
import { Logo } from "./Logo";
import { Sidebar } from "./Sidebar";
import { SIDEBAR_COOKIE } from "@/src/auth/constants";
import { currentSession, devAutoLogin } from "@/src/auth/current";
import { Avatar } from "@/src/components/ui";
import { logoutAction } from "./login/actions";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
const serif = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-fraunces", display: "swap" });
const fonts = `${sans.variable} ${mono.variable} ${serif.variable}`;

export const metadata: Metadata = {
  title: { default: "Resolventum", template: "%s · Resolventum" },
  description: "Scheduling, billing, and homework for tutoring schools",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f5" }, { media: "(prefers-color-scheme: dark)", color: "#111110" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const bare = (await headers()).get("x-bare-page") === "1";
  if (!session || bare) {
    return (
      <html lang="en" className={fonts}>
        <body className="min-h-screen">{children}</body>
      </html>
    );
  }
  const who = session.name || session.email;
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  return (
    <html lang="en" className={fonts}>
      <body className="min-h-screen">
        <div className="md:flex">
          <Sidebar initialCollapsed={collapsed} role={session.role} organizationName={session.organizationName} who={who} dev={!!devAutoLogin()} logout={logoutAction} />
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur md:hidden">
              <a href="/welcome" title="Resolventum front page"><Logo /></a>
              <div className="flex items-center gap-1">
                <Link href="/profile" aria-label={`${who}, profile`} title="Open your profile" className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-3"><Avatar name={who} /></Link>
                <form action={logoutAction}>
                  <button aria-label="Sign out" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-3">
                    <LogOut className="size-[18px]" aria-hidden />
                  </button>
                </form>
              </div>
            </header>
            <main className="mx-auto max-w-[76rem] px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
          </div>
        </div>
        <BottomNav role={session.role} />
      </body>
    </html>
  );
}
