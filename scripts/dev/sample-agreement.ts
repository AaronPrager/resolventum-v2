import { writeFileSync } from "node:fs";
import { prisma } from "../../src/db";
import { agreementPdf } from "../../src/documents/agreement";
const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
const st = await prisma.student.findFirstOrThrow({ where: { organizationId: org.id, firstName: "Victoria" } });
const d = await agreementPdf(prisma, org.id, st.id, new Date("2026-09-14T00:00:00Z"));
writeFileSync(process.argv[2], d.bytes);
await prisma.$disconnect();
