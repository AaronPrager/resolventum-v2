/** Runs against the local resolventum_v2 database. Creates a user and removes it afterwards. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "./password";
import { AuthError, sessionFromToken, signIn, signOut } from "./session";

const email = `session-test-${Date.now()}@example.com`;
let userId: string;

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow();
  const u = await prisma.user.create({ data: { email, name: "Session Test", passwordHash: await hashPassword("correct horse"), emailVerifiedAt: new Date() } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, organizationId: org.id, role: "OWNER" } });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }); // memberships and sessions cascade
});

describe("passwords", () => {
  it("verifies a bcrypt hash and rejects the wrong password", async () => {
    const h = await hashPassword("secret");
    expect(h.startsWith("$2")).toBe(true);
    expect(await verifyPassword("secret", h)).toBe(true);
    expect(await verifyPassword("Secret", h)).toBe(false);
    expect(await verifyPassword("secret", null)).toBe(false);
  });

  it("reads the imported v1 hash format", async () => {
    const u = await prisma.user.findFirstOrThrow({ where: { email: { not: email } } });
    expect(u.passwordHash?.startsWith("$2b$10$")).toBe(true);
    expect(await verifyPassword("definitely not the password", u.passwordHash)).toBe(false);
  });
});

describe("sessions", () => {
  it("signs in, resolves the token to the user and organization, and signs out", async () => {
    const token = await signIn(prisma, email.toUpperCase(), "correct horse", { userAgent: "vitest" });
    expect(token.length).toBeGreaterThan(30);
    const s = await sessionFromToken(prisma, token);
    expect(s?.email).toBe(email);
    expect(s?.role).toBe("OWNER");
    expect(s?.organizationName).toBe("Easy STEM School");
    expect(s?.timezone).toBe("America/New_York");
    await signOut(prisma, token);
    expect(await sessionFromToken(prisma, token)).toBeNull();
  });

  it("rejects a wrong password with the same message as an unknown email", async () => {
    await expect(signIn(prisma, email, "wrong")).rejects.toThrow(AuthError);
    await expect(signIn(prisma, email, "wrong")).rejects.toThrow("Email or password is wrong");
    await expect(signIn(prisma, "nobody@example.com", "wrong")).rejects.toThrow("Email or password is wrong");
  });

  it("ignores garbage and expired tokens", async () => {
    expect(await sessionFromToken(prisma, "not-a-token")).toBeNull();
    expect(await sessionFromToken(prisma, "")).toBeNull();
    const token = await signIn(prisma, email, "correct horse");
    await prisma.authSession.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await sessionFromToken(prisma, token)).toBeNull();
  });
});
