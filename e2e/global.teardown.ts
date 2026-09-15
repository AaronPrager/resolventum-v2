import { prisma } from "../src/db";
import { type AnchorState, restoreAnchors } from "../src/test/anchors";

/** Puts the anchor students back the way global.setup.ts found them. */
export default async function globalTeardown() {
  const raw = process.env.E2E_ANCHORS_BEFORE;
  if (raw) await restoreAnchors(prisma, JSON.parse(raw) as AnchorState[]);
  await prisma.$disconnect();
}
