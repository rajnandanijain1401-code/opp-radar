import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConsoleProvider,
  createEmailProvider,
  MemoryProvider,
  ResendProvider,
  SmtpProvider,
  unsubscribeHeaders,
  type EmailMessage,
} from "../src/providers/index";
import { LINKS } from "./sample";

const msg: EmailMessage = {
  to: "me@example.com",
  from: "OppRadar <radar@example.com>",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  headers: unsubscribeHeaders(LINKS.listUnsubscribe, LINKS.oneClick),
};

describe("email providers", () => {
  it("builds RFC 8058 one-click unsubscribe headers", () => {
    expect(msg.headers!["List-Unsubscribe"]).toMatch(
      /^<https:\/\/oppradar\.example\/api\/unsubscribe\?token=.+>, <mailto:/,
    );
    expect(msg.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(unsubscribeHeaders("<mailto:x@y.z>", false)).not.toHaveProperty("List-Unsubscribe-Post");
  });

  it("smtp passes headers through nodemailer", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "<abc@x>" }));
    const p = new SmtpProvider({ host: "smtp.gmail.com", port: 465 }, { sendMail } as never);
    expect(await p.send(msg)).toEqual({ id: "<abc@x>", provider: "smtp" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ headers: msg.headers, text: "Hi" }),
    );
  });

  it("resend sends and surfaces errors", async () => {
    const ok = new ResendProvider("k", {
      emails: { send: async () => ({ data: { id: "re_1" }, error: null }) },
    });
    expect((await ok.send(msg)).id).toBe("re_1");
    const bad = new ResendProvider("k", {
      emails: { send: async () => ({ data: null, error: { message: "nope" } }) },
    });
    await expect(bad.send(msg)).rejects.toThrow("Resend error: nope");
  });

  it("console provider writes html and text files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "radar-"));
    const lines: string[] = [];
    await new ConsoleProvider(dir, (s) => lines.push(s)).send(msg);
    expect(
      readdirSync(dir)
        .sort()
        .map((f) => f.split(".").pop()),
    ).toEqual(["html", "txt"]);
    expect(lines.join("\n")).toContain("Subject: Hello");
  });

  it("chooses a provider from env", () => {
    expect(createEmailProvider({ RADAR_EMAIL_PROVIDER: "memory" })).toBeInstanceOf(MemoryProvider);
    expect(createEmailProvider({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a" }).name).toBe("smtp");
    expect(createEmailProvider({}).name).toBe("console");
    expect(() => createEmailProvider({ RADAR_EMAIL_PROVIDER: "resend" })).toThrow();
  });
});
