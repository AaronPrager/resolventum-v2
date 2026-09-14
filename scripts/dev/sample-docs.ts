import { writeFileSync } from "node:fs";
import { prisma } from "../../src/db";
import { accountDocument } from "../../src/documents/accountDocs";
const out = process.argv[2];
const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
const today = new Date("2026-09-13T00:00:00Z");
for (const name of ["Victoria Li", "Estella Urman", "Marriott family"]) {
  const a = await prisma.account.findFirstOrThrow({ where: { name, organizationId: org.id } });
  for (const req of [{ kind: "statement" as const, from: "2026-01-01", to: "2026-09-13", today }, { kind: "invoice" as const, month: "2026-08", today }]) {
    const d = await accountDocument(prisma, org.id, a.id, req);
    writeFileSync(`${out}/${d.filename}`, d.bytes);
    console.log(d.filename, d.bytes.length);
  }
}
await prisma.$disconnect();
