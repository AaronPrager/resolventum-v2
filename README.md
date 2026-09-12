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
app/            Next.js routes and layout
src/db.ts       the Prisma client (one per process)
src/services/   domain logic: allocation (FIFO), balances
scripts/        import-v1, verify-import, rebuild-allocations
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

## Rules the schema follows

- every data row belongs to an Organization
- money is integer cents, and balances are derived, never stored
- money rows are voided with a reason, never deleted
- dates that are dates use `@db.Date`; instants use `DateTime`
- v1 ids are kept through the import wherever a row maps one to one
