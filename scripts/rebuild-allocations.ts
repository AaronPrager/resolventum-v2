/**
 * Rebuild FIFO allocations for every account of every organization.
 * Safe to run any time; balances do not depend on allocations.
 *
 *   npm run allocate
 */
import { prisma } from "../src/db.js";
import { rebuildOrganizationAllocations } from "../src/services/allocation.js";

const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
for (const org of orgs) {
  const results = await rebuildOrganizationAllocations(prisma, org.id);
  const rows = results.reduce((s, r) => s + r.allocations, 0);
  const unallocated = results.reduce((s, r) => s + r.unallocatedCents, 0);
  const uncovered = results.reduce((s, r) => s + r.uncoveredCents, 0);
  console.log(
    `${org.name}: ${results.length} accounts, ${rows} allocation rows, ` +
      `${(unallocated / 100).toFixed(2)} unallocated payments, ${(uncovered / 100).toFixed(2)} uncovered charges`,
  );
}
await prisma.$disconnect();
