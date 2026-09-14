import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, FileDown, HandCoins, Landmark, NotebookPen, ScrollText, Shield, Sparkles, UserPlus } from "lucide-react";
import { Logo } from "./Logo";

/**
 * The signed-out front page. Dark, one accent, the same shape as the first
 * Resolventum's: a header, a hero with a preview card, six highlights, a
 * closing band, and a footer. Copy describes what the app does today.
 */
const CONTACT = "info@resolventum.com";

const highlights = [
  { icon: CalendarDays, title: "A calendar that stays clear", description: "Day, week, and month views, weekly series that skip school holidays, and a feed for Apple, Google, or Outlook. No spreadsheet on the side.", span: true },
  { icon: NotebookPen, title: "One note after every lesson", description: "What was covered, a win, a struggle, the next goal. Written in a minute, sent to the family the same day." },
  { icon: Landmark, title: "Money, reconciled", description: "Every lesson is a charge, every payment is a line, and the balance is always derived from them. Nothing is deleted, only voided with a reason." },
  { icon: HandCoins, title: "Tutor pay without the argument", description: "Per hour or a percent of the lesson, per tutor or per subject. A pay run you approve, a slip for each tutor, and their own page so nobody has to ask.", span: true },
  { icon: BarChart3, title: "Reports when you need them", description: "Statements and invoices families can read, a year summary, and a tax page your accountant will accept." },
  { icon: UserPlus, title: "From inquiry to enrolled", description: "A sign-up link for your website, a pipeline for consults and trials, and one click to make the student and the family account." },
];

export function Landing({ signupOpen }: { signupOpen: boolean }) {
  const primary = signupOpen ? { href: "/signup", label: "Create your account" } : { href: "/login", label: "Sign in" };
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-indigo-600/35 blur-[100px]" />
        <div className="absolute -left-32 top-1/3 h-[380px] w-[380px] rounded-full bg-violet-600/25 blur-[90px]" />
        <div className="absolute bottom-0 left-1/2 h-[280px] w-[120%] -translate-x-1/2 bg-gradient-to-t from-indigo-950/80 to-transparent" />
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center rounded-lg text-white [&_span:last-child]:text-white"><Logo /></Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Account">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white">Log in</Link>
            {signupOpen && (
              <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100">
                Get started<ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-200 ring-1 ring-white/10">
                <Sparkles className="size-3.5 text-amber-300" aria-hidden />
                Built for tutors, studios, and small schools
              </p>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">Run your teaching practice without the busywork.</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
                Resolventum keeps the calendar, the students, the session notes, the money, and tutor pay in one place, so they agree with each other. Less admin, more time for the lessons.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={primary.href} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-400">
                  {primary.label}<ArrowRight className="size-4" aria-hidden />
                </Link>
                {signupOpen && <Link href="/login" className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">I already have an account</Link>}
              </div>
              <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-400">
                <span className="inline-flex items-center gap-2"><Shield className="size-4 text-emerald-400/90" aria-hidden />Every charge and payment kept, never deleted</span>
                <span className="inline-flex items-center gap-2"><ScrollText className="size-4 text-indigo-300/90" aria-hidden />Statements, invoices, and agreements as PDFs</span>
                <span className="inline-flex items-center gap-2"><FileDown className="size-4 text-sky-300/90" aria-hidden />Your data exports whenever you like</span>
              </div>
            </div>

            <div className="relative lg:justify-self-end">
              <div className="relative mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-1 shadow-2xl shadow-black/50 backdrop-blur">
                <div className="rounded-[14px] bg-slate-950/80 p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">This week</p>
                      <p className="mt-1 text-sm font-semibold text-white">Lessons and cash flow</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">On track</span>
                  </div>
                  <div className="mt-5 space-y-3">
                    {[
                      { label: "Lessons this week", value: "18", accent: "from-indigo-500/80 to-violet-500/70" },
                      { label: "Notes sent to families", value: "16", accent: "from-sky-500/70 to-indigo-500/70" },
                      { label: "Collected this month", value: "$7,350", accent: "from-emerald-500/70 to-teal-600/70" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <span className="text-sm text-slate-300">{row.label}</span>
                        <span className={`rounded-lg bg-gradient-to-r px-3 py-1 text-sm font-bold text-white ${row.accent}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4">
                    <p className="text-xs font-medium text-slate-400">What changes with Resolventum</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-200">
                      One lesson entry does three jobs: it draws on the family&apos;s balance, sends the parent a note, and lands on the tutor&apos;s pay run. Fewer evenings reconstructing who paid for what.
                    </p>
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-6 -right-4 hidden size-24 rounded-2xl bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/30 blur-2xl sm:block" aria-hidden />
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.03] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Everything in one workspace</h2>
              <p className="mt-3 text-slate-300">Replace the patchwork of calendars, invoices, folders, and spreadsheets with one flow, from the first inquiry to the year-end summary.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className={`group rounded-2xl border border-white/10 bg-slate-950/40 p-6 shadow-lg shadow-black/20 transition hover:border-indigo-400/35 hover:bg-slate-950/70 ${item.span ? "md:col-span-2" : ""}`}>
                    <div className="flex size-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/25 transition group-hover:bg-indigo-500/25"><Icon className="size-5" aria-hidden /></div>
                    <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-indigo-400/25 bg-gradient-to-br from-indigo-600/90 via-violet-700/85 to-slate-900 px-6 py-12 sm:px-10 sm:py-14">
            <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
              <div className="absolute -right-10 -top-10 size-56 rounded-full bg-white/25 blur-3xl" />
              <div className="absolute bottom-0 left-10 h-40 w-72 rounded-full bg-indigo-400/30 blur-3xl" />
            </div>
            <div className="relative max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Ready to simplify your back office?</h2>
              <p className="mt-3 text-indigo-100/95">Free for one tutor. Type in your students and their balances, and the first lesson is ten minutes away. Nothing to import, nothing to migrate.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={primary.href} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-900 shadow-lg transition hover:bg-slate-100">
                  {primary.label}<ArrowRight className="size-4" aria-hidden />
                </Link>
                {signupOpen && <Link href="/login" className="inline-flex items-center rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">Sign in</Link>}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-slate-950/80">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-white [&_span:last-child]:text-white"><Logo /></div>
              <p className="mt-3 max-w-sm text-sm text-slate-400">Scheduling, session notes, billing, tutor pay, and homework for tutoring schools.</p>
              <p className="mt-4 text-sm text-slate-500">© {new Date().getFullYear()} Resolventum. All rights reserved.</p>
            </div>
            <div className="text-sm">
              <p className="font-semibold text-slate-200">Contact</p>
              <a href={`mailto:${CONTACT}`} className="mt-3 block text-slate-400 transition hover:text-white">{CONTACT}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
