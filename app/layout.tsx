import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { BottomNav, SideNav } from "./Nav";
import { Logo } from "./Logo";
import { currentSession } from "@/src/auth/current";
import { logoutAction } from "./login/actions";
import { Avatar } from "@/src/components/ui";
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
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <div className="md:flex">
          <aside className="hidden w-60 shrink-0 border-r border-line bg-surface-2 md:sticky md:top-0 md:flex md:h-screen md:flex-col">
            <div className="px-4 pb-4 pt-4">
              <Link href="/calendar" className="rounded-lg"><Logo /></Link>
              <div className="mt-3 truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium shadow-xs" title={session.organizationName}>
                {session.organizationName}
              </div>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto px-3 pb-3"><SideNav /></div>
            <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
              <Avatar name={who} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] font-medium">{who}</div>
                <div className="truncate text-xs text-muted">{session.role.toLowerCase()}</div>
              </div>
              <form action={logoutAction}>
                <button aria-label="Sign out" title="Sign out" className="inline-flex size-8 items-center justify-center rounded-lg text-faint hover:bg-surface-3 hover:text-fg">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur md:hidden">
              <Link href="/calendar"><Logo /></Link>
              <form action={logoutAction}>
                <button aria-label="Sign out" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-3">
                  <LogOut className="size-[18px]" aria-hidden />
                </button>
              </form>
            </header>
            <main className="mx-auto max-w-[76rem] px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
