import { prisma } from "../db";
import { makeAnchorsActive, restoreAnchors } from "./anchors";

export default async function setup() {
  const before = await makeAnchorsActive(prisma);
  return async () => {
    await restoreAnchors(prisma, before);
    await prisma.$disconnect();
  };
}
