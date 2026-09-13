/** Runs against the local resolventum_v2 database. Creates a school and removes it afterwards. */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { setTransport } from "../email/send";
import { AccountError, changePassword, requestPasswordReset, resetPassword, signUp, slugify } from "./account";
import { verifyPassword } from "./password";
import { sessionFromToken, signIn } from "./session";

const email = `signup-${Date.now()}@example.com`;
let orgId: string | null = null;

afterAll(async () => {
  setTransport(null);
  if (orgId) {
    await prisma.message.deleteMany({ where: { organizationId: orgId } });
    await prisma.token.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
});

describe("accounts", () => {
  it("slugifies names", () => {
    expect(slugify("Easy STEM School")).toBe("easy-stem-school");
    expect(slugify("  ")).toBe("school");
  });

  it("sign-up makes an owner, a school, and a tax year, and the owner can sign in", async () => {
    const { user, organization } = await signUp(prisma, { name: "New Tutor", email: email.toUpperCase(), password: "long enough password", organizationName: "Easy STEM School" });
    orgId = organization.id;
    expect(user.email).toBe(email);
    expect(organization.slug).toMatch(/^easy-stem-school-\d+$/); // the imported school already owns the plain slug
    expect(await prisma.membership.count({ where: { userId: user.id, organizationId: organization.id, role: "OWNER" } })).toBe(1);
    expect(await prisma.taxYear.count({ where: { organizationId: organization.id } })).toBe(1);
    const token = await signIn(prisma, email, "long enough password");
    expect((await sessionFromToken(prisma, token))?.organizationName).toBe("Easy STEM School");
  });

  it("refuses short passwords and duplicate emails", async () => {
    await expect(signUp(prisma, { name: "x", email: "a@b.co", password: "short", organizationName: "y" })).rejects.toThrow(/10 characters/);
    await expect(signUp(prisma, { name: "x", email, password: "long enough password", organizationName: "y" })).rejects.toThrow(/already exists/);
  });

  it("password reset sends a link, works once, and signs everyone out", async () => {
    const sent: string[] = [];
    setTransport(async (m) => { sent.push(m.text); return { providerMessageId: "m" }; });
    const before = await signIn(prisma, email, "long enough password");
    await requestPasswordReset(prisma, email, "http://localhost:3100");
    await requestPasswordReset(prisma, "nobody@example.com", "http://localhost:3100");
    expect(sent.length).toBe(1);
    const raw = sent[0].match(/\/reset\/([A-Za-z0-9_-]+)/)![1];
    await expect(resetPassword(prisma, raw, "short")).rejects.toThrow(AccountError);
    await resetPassword(prisma, raw, "a brand new password");
    expect(await sessionFromToken(prisma, before)).toBeNull();
    await expect(resetPassword(prisma, raw, "a brand new password 2")).rejects.toThrow(/not valid/);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await verifyPassword("a brand new password", u.passwordHash)).toBe(true);
  });

  it("change password checks the current one", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    await expect(changePassword(prisma, u.id, "wrong", "another long password")).rejects.toThrow(/current password/);
    await changePassword(prisma, u.id, "a brand new password", "another long password");
    expect(await verifyPassword("another long password", (await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash)).toBe(true);
  });
});
