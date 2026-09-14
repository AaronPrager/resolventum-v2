import type { Metadata, Viewport } from "next";
import { BottomNav, SideNav } from "./Nav";
import { currentSession } from "@/src/auth/current";
import { logoutAction } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resolventum",
  description: "Tutoring business management",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) {
    return (
      <html lang="en"><body className="min-h-screen antialiased"><main className="px-4">{children}</main></body></html>
    );
  }
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="md:flex">
          <aside className="hidden w-56 shrink-0 border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col">
            <div className="px-4 py-4 text-base font-semibold tracking-tight">Resolventum</div>
            <div className="px-2"><SideNav /></div>
            <div className="mt-auto border-t border-line px-4 py-3 text-xs text-muted">
              <div className="truncate font-medium text-fg">{session.organizationName}</div>
              <div className="truncate">{session.email}</div>
              <form action={logoutAction}><button className="mt-1 text-brand hover:underline">Sign out</button></form>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
              <span className="text-base font-semibold tracking-tight">Resolventum</span>
              <form action={logoutAction}><button className="text-xs text-brand hover:underline">Sign out</button></form>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
