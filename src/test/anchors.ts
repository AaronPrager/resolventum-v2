/**
 * The tests lean on two students from the imported data, Estella Urman and
 * Lina Vernik: their balances, their lessons, and that they are active.
 * Whoever runs the app between test runs may pause or archive them. Before
 * a run they are made active; afterwards they are put back as found.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export const ANCHORS = [{ firstName: "Estella", lastName: "Urman" }, { firstName: "Lina", lastName: "Vernik" }];

export interface AnchorState { id: string; status: "ACTIVE" | "PAUSED"; archivedAt: string | null }

/** Records how the anchor students are and makes them active. Returns what to hand to `restoreAnchors`. */
export async function makeAnchorsActive(db: PrismaClient): Promise<AnchorState[]> {
  const before: AnchorState[] = [];
  for (const who of ANCHORS) {
    const s = await db.student.findFirst({ where: who, select: { id: true, status: true, archivedAt: true } });
    if (!s) continue;
    before.push({ id: s.id, status: s.status, archivedAt: s.archivedAt?.toISOString() ?? null });
    if (s.status !== "ACTIVE" || s.archivedAt) await db.student.update({ where: { id: s.id }, data: { status: "ACTIVE", archivedAt: null } });
  }
  return before;
}

export async function restoreAnchors(db: PrismaClient, before: AnchorState[]) {
  for (const s of before) await db.student.update({ where: { id: s.id }, data: { status: s.status, archivedAt: s.archivedAt ? new Date(s.archivedAt) : null } });
}
