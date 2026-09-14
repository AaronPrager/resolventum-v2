import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { BottomNav } from "./Nav";
import { Logo } from "./Logo";
import { SIDEBAR_COOKIE, Sidebar } from "./Sidebar";
import { currentSession, devAutoLogin } from "@/src/auth/current";
import { logoutAction } from "./login/actions";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

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
  if (!session) {
    return (
      <html lang="en" className={inter.variable}>
        <body className="min-h-screen">{children}</body>
      </html>
    );
  }
  const who = session.name || session.email;
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <div className="md:flex">
          <Sidebar initialCollapsed={collapsed} role={session.role} organizationName={session.organizationName} who={who} dev={!!devAutoLogin()} logout={logoutAction} />
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur md:hidden">
              <Link href="/"><Logo /></Link>
              <form action={logoutAction}>
                <button aria-label="Sign out" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-3">
                  <LogOut className="size-[18px]" aria-hidden />
                </button>
              </form>
            </header>
            <main className="mx-auto max-w-[76rem] px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
          </div>
        </div>
        <BottomNav role={session.role} />
      </body>
    </html>
  );
}
