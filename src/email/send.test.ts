import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { EmailError, EmailNotConfiguredError, sendEmail, setTransport, textToHtml } from "./send";

let orgId: string;
const made: string[] = [];
beforeAll(async () => { orgId = (await prisma.organization.findFirstOrThrow()).id; });
afterEach(async () => { setTransport(null); await prisma.message.deleteMany({ where: { id: { in: made.splice(0) } } }); });

describe("email", () => {
  it("logs a sent message with the provider id", async () => {
    const seen: string[] = [];
    setTransport(async (m) => { seen.push(m.to); return { providerMessageId: "msg_1" }; });
    const id = await sendEmail(prisma, orgId, "OTHER", { to: "parent@example.com", subject: "Hi", text: "Hello there" }, { type: "test", id: "x" });
    made.push(id);
    const row = await prisma.message.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("SENT");
    expect(row.providerMessageId).toBe("msg_1");
    expect(row.toEmail).toBe("parent@example.com");
    expect(seen).toEqual(["parent@example.com"]);
  });

  it("logs a failure and rethrows", async () => {
    setTransport(async () => { throw new EmailError("boom"); });
    await expect(sendEmail(prisma, orgId, "OTHER", { to: "a@b.co", subject: "x", text: "y" })).rejects.toThrow("boom");
    const row = await prisma.message.findFirstOrThrow({ where: { organizationId: orgId, toEmail: "a@b.co" }, orderBy: { createdAt: "desc" } });
    made.push(row.id);
    expect(row.status).toBe("FAILED");
    expect(row.error).toBe("boom");
  });

  it("refuses a bad address before logging, and says when unconfigured", async () => {
    await expect(sendEmail(prisma, orgId, "OTHER", { to: "not an email", subject: "x", text: "y" })).rejects.toThrow(/not an email address/);
    const saved = { k: process.env.RESEND_API_KEY, f: process.env.EMAIL_FROM };
    delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
    await expect(sendEmail(prisma, orgId, "OTHER", { to: "a@b.co", subject: "x", text: "y" })).rejects.toThrow(EmailNotConfiguredError);
    const row = await prisma.message.findFirstOrThrow({ where: { organizationId: orgId, toEmail: "a@b.co" }, orderBy: { createdAt: "desc" } });
    made.push(row.id);
    if (saved.k) process.env.RESEND_API_KEY = saved.k; if (saved.f) process.env.EMAIL_FROM = saved.f;
  });

  it("turns text into safe html", () => {
    const html = textToHtml("Hi <b>\n\nSee https://x.test/a?b=1");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('<a href="https://x.test/a?b=1">');
    expect(html.split("<p").length - 1).toBe(2);
  });
});
