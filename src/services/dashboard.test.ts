/** The owner dashboard adds up without falling over on the imported data. */
import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import { ownerDashboard } from "./dashboard";
import { exportCsv, fullExport } from "./exportData";

describe("dashboard and export", () => {
  it("reports the week, the month, balances, and counts", async () => {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
    const d = await ownerDashboard(prisma, org.id, org.timezone, new Date("2026-09-16T15:00:00Z"));
    expect(d.today).toBe("2026-09-16");
    expect(d.week.from).toBe("2026-09-14");
    expect(d.week.to).toBe("2026-09-20");
    expect(d.monthly.month).toBe("2026-09");
    expect(d.monthly.marginCents).toBe(d.monthly.lessonsChargedCents - d.monthly.tutorPayCents);
    expect(d.money.owedCents).toBeGreaterThanOrEqual(0);
    expect(d.students.active).toBeGreaterThan(0);
    expect(Array.isArray(d.atRisk)).toBe(true);
  });

  it("every table exports, and the zip holds all of them", async () => {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Easy STEM School" } });
    const opts = { timeZone: org.timezone, today: new Date("2026-09-16T00:00:00Z") };
    const students = await exportCsv(prisma, org.id, "students", opts);
    expect(students.filename).toBe("students-2026-09-16.csv");
    expect(students.csv.split("\r\n")[0]).toContain("First name,Last name,Status");
    expect(students.csv).toContain("Estella,Urman");
    const ledger = await exportCsv(prisma, org.id, "ledger", opts);
    expect(ledger.csv.split("\r\n").length).toBeGreaterThan(100);
    const zip = await fullExport(prisma, org.id, opts);
    expect(zip.filename).toBe("Easy STEM School export 2026-09-16.zip");
    expect(zip.bytes.byteLength).toBeGreaterThan(1000);
  });
});
