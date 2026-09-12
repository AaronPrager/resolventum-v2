/**
 * Generate lessons for open-ended weekly series up to the horizon (six months).
 * Safe to run any time; meant for a daily cron.
 *
 *   npm run extend-series
 */
import { prisma } from "../src/db";
import { extendOpenSeries } from "../src/services/series";

const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
for (const org of orgs) {
  const made = await extendOpenSeries(prisma, org.id);
  console.log(`${org.name}: ${made} lessons created`);
}
await prisma.$disconnect();
