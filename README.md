# Resolventum v2

Rewrite of the Resolventum tutoring business app on a fresh schema. The design
and the import plan are in [docs/schema-plan.md](docs/schema-plan.md).

## Stack

- TypeScript, Node 22
- Prisma 7 with the `pg` driver adapter, Postgres 17
- The app framework is not chosen yet. Only the schema and scripts exist.

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
npm run db:migrate     # create and apply a migration from schema changes
npm run db:generate    # regenerate the client after a schema change
npm run db:studio      # browse the v2 database
npm run typecheck
```

## Rules the schema follows

- every data row belongs to an Organization
- money is integer cents, and balances are derived, never stored
- money rows are voided with a reason, never deleted
- dates that are dates use `@db.Date`; instants use `DateTime`
- v1 ids are kept through the import wherever a row maps one to one
