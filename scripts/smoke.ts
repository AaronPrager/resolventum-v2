import { prisma } from "../src/db.js";

const orgs = await prisma.organization.count();
const tables = await prisma.$queryRaw<{ n: bigint }[]>`
  select count(*)::bigint as n from information_schema.tables
  where table_schema = 'public' and table_name not like '_prisma%'`;
console.log(`organizations: ${orgs}, tables: ${tables[0].n}`);
await prisma.$disconnect();
