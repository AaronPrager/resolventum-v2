import { prisma } from "../src/db";
import { makeAnchorsActive } from "../src/test/anchors";

/** Runs once before the suite: the anchor students must be active. What they were is kept for global.teardown.ts. */
export default async function globalSetup() {
  process.env.E2E_ANCHORS_BEFORE = JSON.stringify(await makeAnchorsActive(prisma));
  await prisma.$disconnect();
}
