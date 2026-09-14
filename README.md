# Resolventum v2

Rewrite of the Resolventum tutoring business app on a fresh schema. The design
and the import plan are in [docs/schema-plan.md](docs/schema-plan.md).

## Stack

- TypeScript, Node 22
- Next.js 16 (App Router, server components) on Vercel, Tailwind 4
- Prisma 7 with the `pg` driver adapter, Postgres 17
- Vitest for unit tests

## Layout

```
app/            Next.js routes, layout, navigation, and the login page. / is the owner
                dashboard; /leads is the pipeline; /earnings is a tutor's own pay page
src/auth/       passwords, sessions, and the Next.js cookie glue
src/components/ the component set (ui.tsx): buttons, fields, cards, tables, money
src/db.ts       the Prisma client (one per process)
src/services/   domain logic: allocation, balances, statement, lessons (with the cancellation
                policy, no-shows, and make-up credits), series, holidays, calendar, payments,
                calendarFeed, files, homework, expenses, reports, payroll (pay rules per tutor
                and subject), sessionNotes, leads, dashboard, reminders, audit, exportData
src/ai/         Gemini wrapper (generate.ts) and the draft builders (drafts.ts)
src/lib/        timezone and recurrence helpers, formatting
scripts/        import-v1, verify-import, rebuild-allocations, extend-series
e2e/            Playwright tests
prisma/         schema and migrations
docs/           schema plan and import mapping
generated/      Prisma client output, not committed
```

## Local databases

All on Postgres 17 at `localhost:5432`, user `faina`, no password.

| Database | What it is | Who writes to it |
|---|---|---|
| `resolventum_v2` | this project's database | Prisma migrations, the import script |
| `resolventum_prod_copy` | restore of a v1 production dump | nobody. Drop and re-restore from a fresh dump. |
| `resolventum` | v1 app's local database (optional) | the v1 app in `../Resolventum` |

Dumps live in `~/resolventum-backups/`. Take one with:

```bash
pg_dump --format=custom --no-owner "$PROD_URL" > ~/resolventum-backups/prod-$(date +%F).dump
```

Restore the reference copy with:

```bash
dropdb --if-exists resolventum_prod_copy && createdb resolventum_prod_copy && pg_restore --no-owner -d resolventum_prod_copy ~/resolventum-backups/prod-YYYY-MM-DD.dump
```

## Commands

```bash
npm run dev            # Next.js on http://localhost:3100
npm run import         # wipe resolventum_v2 and import from resolventum_prod_copy
npm run verify         # compare v1 and v2; exits non-zero on any mismatch
npm run allocate       # rebuild FIFO allocations for every account
npm run extend-series  # generate lessons for open-ended weekly series six months ahead
npm run build          # production build (prisma generate && next build)
npm test               # unit and database tests (Vitest); needs an imported resolventum_v2
npm run test:e2e       # browser tests (Playwright) against the dev server and the imported data
npm run typecheck
npm run db:migrate     # create and apply a migration from schema changes
npm run db:generate    # regenerate the client after a schema change
npm run db:studio      # browse the v2 database
```

## How a screen gets tested

1. Look at it in the browser against a few accounts you know.
2. `npm run verify` proves the numbers under it match v1.
3. A service test in `src/services/*.test.ts` asserts known facts of the
   imported data (94 accounts, Marriott family at zero, and so on).
4. A Playwright test in `e2e/` loads the screen and checks what it shows.

The imported data is the fixture. `npm run import` takes three seconds and
puts the database back to a known state.

## Accounts, sign-in, roles

`/signup` creates a school with its owner. It is closed unless `REGISTRATION_OPEN=true`; closed, the page, the sign-in link, and the landing page say that Resolventum is currently not accepting new accounts. Invitations still work.
`/forgot` emails a one-hour reset link; `/reset/<token>` sets the password
and signs every device out. Settings has change-password, the school
profile, and tutors. Login, sign-up, and reset are rate limited per address
and per network, in memory per instance.

Roles: OWNER and TUTOR can change anything; ACCOUNTANT can read everything
and change nothing (every mutating action calls `requireWriter()`). Only the
owner edits the school profile and tutors.

## Email

`src/email/send.ts` sends through Resend (`RESEND_API_KEY`, `EMAIL_FROM`)
and logs every send as a Message row with its status. Used for statements
(from the account page, with the reply-to set to the school's address),
homework links, parent updates, and password resets. Without a key each
send fails with a clear message and the button says email is off.

## Sign-in

Cookie sessions on the `AuthSession` table (`src/auth/`). The cookie holds a
random token, the row holds its SHA-256, and sign-out revokes the row. The v1
password hashes were imported, so v1 passwords work. `proxy.ts` sends
requests without a cookie to `/login`; every page and action then calls
`requireSession()` and scopes its queries to the session's organization.

Browser tests sign in as a local user, `e2e@resolventum.local`, which
`e2e/auth.setup.ts` creates on this machine only. They start the dev server
with `DISABLE_RATE_LIMIT=1` because they sign in many times in a minute;
never set that in production.

## Calendar feed

Settings has a private ICS link (`/api/calendar/<token>.ics`) for Apple
Calendar, Google Calendar, or Outlook. The raw token is shown once; only its
SHA-256 is stored as a Token of kind CALENDAR_FEED, one per membership.
Regenerate revokes the old one. The feed covers lessons from 90 days back to
400 days ahead, times in UTC, cancelled lessons marked. `src/lib/ics.ts`
writes the file; `src/services/calendarFeed.ts` owns the tokens.

## Homework

`/homework` lists assignments; each has a public link `/h/<token>` where the
student sees the instructions and files, uploads PDFs or photos, and later
reads the feedback. No login for students. The library at `/library` holds
files to attach. Only the token's SHA-256 is stored.

## Expenses and tax

`/expenses` by month with a form that remembers each vendor's category and
treatment. `/expenses/tax?year=` is the Schedule C view: deductible amounts
by category and by treatment, the home office percent per year, a "filed"
flag, and a CSV for the accountant. `/expenses/recurring` holds monthly or
yearly templates; "Run what is due" or the daily cron creates the entries.

## Reports

`/reports?year=` shows money received, refunds, deductible expenses, profit,
lessons and hours, month by month, who owes what, students by revenue, and
tutor hours and pay.

## AI

Three features, all through Gemini (`GEMINI_API_KEY`), all "the model
drafts, you approve", all stored as Draft rows with the model and token
counts:

- Parent update: `/students/<id>/update` writes an email from the lesson
  notes, progress notes, and homework results for a period.
- Homework feedback: on an assignment, "Draft feedback with AI" reads the
  submitted PDF or photo against the assignment and proposes feedback, a
  score, and per-topic mastery. Approving saves all three.
- Receipt reading: on the expenses page, upload a receipt and the form is
  prefilled with vendor, amount, date, and category.

Without a key every AI button is disabled and says so. Tests replace the
model with a fake (`setGenerator`).

## Deploying

Google Cloud Run with Cloud SQL is the target; the exact commands are in
[docs/deploy-google-cloud.md](docs/deploy-google-cloud.md). The app is one
container (`Dockerfile`, Next.js standalone output) plus Postgres, so any
host that runs containers works the same way. Vercel also works but caps
request bodies at about 4.5 MB, which is too small for homework photo uploads
unless files are moved to blob storage first.

Whatever the host:

1. Postgres. Set `DATABASE_URL`; set `DIRECT_URL` too if `DATABASE_URL` goes
   through a pooler. Turn on point-in-time recovery at the provider.
2. Environment: `CRON_SECRET` (random), `RESEND_API_KEY` and `EMAIL_FROM`
   (a verified domain in Resend), `GEMINI_API_KEY`, and `REGISTRATION_OPEN`.
3. Migrations are a release step, not a build step: `npx prisma migrate deploy`
   with `DIRECT_URL` set, then deploy. The build is `prisma generate && next build`.
4. Something must call `/api/cron` daily with `Authorization: Bearer <CRON_SECRET>`
   (Cloud Scheduler on Google Cloud). `/api/health` is for an uptime check.
5. Security headers, HSTS, `httpOnly` `secure` cookies, and the login gate
   are on by default. Files live in Postgres; move to blob storage when the
   `File` table passes a few hundred megabytes (`storage`/`storageKey` are
   ready for it).

Going live from v1: take a final v1 dump, restore it as `resolventum_prod_copy`,
run `npm run import` and `npm run verify` against the production `DATABASE_URL`
(set `DATABASE_URL` to production for that one run), then point the DNS.
Keep the v1 database untouched for a month.

## Look and feel

Colors are runtime CSS variables in `app/globals.css`, mapped into Tailwind
with `@theme inline`, so dark mode is a media query that swaps the variables.
Semantic names only: `surface`, `fg`, `muted`, `line`, `brand`, `owed`,
`credit`, `warn`. Screens are built from `src/components/ui.tsx`. Tables
scroll sideways on a phone inside `TableWrap`; columns that matter less get
`hidden sm:table-cell`. Under 768px the side navigation becomes a bottom bar.

## How lessons and money connect

- A lesson is a Lesson row, one LessonStudent per seat, and one Charge per
  seat. The charge is created with the lesson and dated the lesson's local day.
- Editing price or date edits the charge. Cancelling voids the charge with a
  reason, or keeps it if "still charge" is ticked. Nothing is deleted.
- A weekly series is a LessonSeries row plus real lessons generated ahead of
  time. Open-ended series are generated six months ahead and extended by
  `npm run extend-series`. "This and future" edits and cancels walk the later
  lessons of the series.
- Payments and refunds are recorded on the account from its statement page.
  Credits, fees, and tips are non-lesson charges. Any of them can be voided
  with a reason; voided rows stay in the database and leave the statement.
- Every change to charges or payments rebuilds the account's FIFO allocations.

## Rules the schema follows

- every data row belongs to an Organization
- money is integer cents, and balances are derived, never stored
- money rows are voided with a reason, never deleted
- dates that are dates use `@db.Date`; instants use `DateTime`
- v1 ids are kept through the import wherever a row maps one to one
