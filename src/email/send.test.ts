import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { EmailError, EmailNotConfiguredError, emailProvider, sendEmail, setTransport, textToHtml } from "./send";

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

  it("sends everything to one inbox when EMAIL_REDIRECT_TO is set, and says who it was for", async () => {
    const seen: { to: string; subject: string }[] = [];
    setTransport(async (m) => { seen.push({ to: m.to, subject: m.subject }); return { providerMessageId: "msg_r" }; });
    process.env.EMAIL_REDIRECT_TO = "me@example.com";
    try {
      const org = await prisma.organization.findFirstOrThrow();
      const id = await sendEmail(prisma, org.id, "OTHER", { to: "parent@example.com", subject: "Hello", text: "Hi" });
      made.push(id);
      expect(seen).toEqual([{ to: "me@example.com", subject: "[for parent@example.com] Hello" }]);
      // The log keeps the real recipient.
      expect((await prisma.message.findUniqueOrThrow({ where: { id } })).toEmail).toBe("parent@example.com");
    } finally {
      delete process.env.EMAIL_REDIRECT_TO;
    }
  });

  it("picks SMTP over Resend when both are set, and nothing when neither is", () => {
    const keep = { ...process.env };
    try {
      for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "RESEND_API_KEY", "EMAIL_FROM"]) delete process.env[k];
      expect(emailProvider()).toBeNull();
      process.env.EMAIL_FROM = "School <me@icloud.com>";
      process.env.RESEND_API_KEY = "re_x";
      expect(emailProvider()).toBe("resend");
      Object.assign(process.env, { SMTP_HOST: "smtp.mail.me.com", SMTP_USER: "me@icloud.com", SMTP_PASS: "app-pass" });
      expect(emailProvider()).toBe("smtp");
    } finally {
      for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "RESEND_API_KEY", "EMAIL_FROM"]) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
    }
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
