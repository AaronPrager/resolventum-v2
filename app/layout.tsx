import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resolventum",
  description: "Tutoring business management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <header className="border-b border-gray-200">
          <nav className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-3 text-sm">
            <span className="font-semibold">Resolventum</span>
            <Link href="/" className="text-gray-700 hover:underline">Accounts</Link>
            <Link href="/students" className="text-gray-700 hover:underline">Students</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
