import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** Free-form tags (Resend supports them; others ignore). */
  tags?: { name: string; value: string }[];
}

export interface SendResult {
  id: string;
  provider: string;
}

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<SendResult>;
}

/** List-Unsubscribe headers. One-click (RFC 8058) only when an https URL is present. */
export function unsubscribeHeaders(
  listUnsubscribe: string,
  oneClick: boolean,
): Record<string, string> {
  const h: Record<string, string> = { "List-Unsubscribe": listUnsubscribe };
  if (oneClick) h["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  return h;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure?: boolean;
}

/** SMTP via Nodemailer. Works with Gmail (smtp.gmail.com:465 + an App Password). */
export class SmtpProvider implements EmailProvider {
  name = "smtp";
  private transport: nodemailer.Transporter;
  constructor(cfg: SmtpConfig, transport?: nodemailer.Transporter) {
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure ?? cfg.port === 465,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      });
  }
  async send(msg: EmailMessage): Promise<SendResult> {
    const info = await this.transport.sendMail({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo,
      headers: msg.headers,
    });
    return { id: String(info.messageId ?? ""), provider: this.name };
  }
}

/** Minimal surface of the Resend SDK we use, so tests can inject a fake. */
export interface ResendLike {
  emails: {
    send(
      params: Record<string, unknown>,
    ): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
}

/** Resend for hosted mode (also used by Auth.js magic links). */
export class ResendProvider implements EmailProvider {
  name = "resend";
  private client: ResendLike;
  constructor(apiKey: string, client?: ResendLike) {
    this.client = client ?? (new Resend(apiKey) as unknown as ResendLike);
  }
  async send(msg: EmailMessage): Promise<SendResult> {
    const { data, error } = await this.client.emails.send({
      from: msg.from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo,
      headers: msg.headers,
      tags: msg.tags,
    });
    if (error || !data) throw new Error(`Resend error: ${error?.message ?? "unknown"}`);
    return { id: data.id, provider: this.name };
  }
}

/** Dev / demo provider: prints a summary and writes every email to out/emails as .html + .txt. */
export class ConsoleProvider implements EmailProvider {
  name = "console";
  private n = 0;
  constructor(
    private outDir = "out/emails",
    private log: (s: string) => void = (s) => process.stdout.write(s + "\n"),
  ) {}
  async send(msg: EmailMessage): Promise<SendResult> {
    this.n++;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}-${this.n}-${msg.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50)}`;
    mkdirSync(this.outDir, { recursive: true });
    writeFileSync(join(this.outDir, `${base}.html`), msg.html);
    writeFileSync(join(this.outDir, `${base}.txt`), msg.text);
    const bar = "-".repeat(72);
    this.log(
      [
        bar,
        `To:      ${msg.to}`,
        `From:    ${msg.from}`,
        `Subject: ${msg.subject}`,
        ...Object.entries(msg.headers ?? {}).map(([k, v]) => `${k}: ${v}`),
        bar,
        msg.text.trim(),
        bar,
        `(saved to ${join(this.outDir, base)}.html)`,
        "",
      ].join("\n"),
    );
    return { id: `console-${this.n}`, provider: this.name };
  }
}

/** Test provider: keeps messages in memory. */
export class MemoryProvider implements EmailProvider {
  name = "memory";
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<SendResult> {
    this.sent.push(msg);
    return { id: `mem-${this.sent.length}`, provider: this.name };
  }
}

export type ProviderKind = "smtp" | "resend" | "console" | "memory";

export function createEmailProvider(
  env: Record<string, string | undefined> = process.env,
): EmailProvider {
  const kind = (env.RADAR_EMAIL_PROVIDER ??
    (env.SMTP_HOST && env.SMTP_USER
      ? "smtp"
      : env.RESEND_API_KEY
        ? "resend"
        : "console")) as ProviderKind;
  switch (kind) {
    case "smtp":
      if (!env.SMTP_HOST) throw new Error("SMTP_HOST is required for the smtp provider");
      return new SmtpProvider({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 465),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      });
    case "resend":
      if (!env.RESEND_API_KEY)
        throw new Error("RESEND_API_KEY is required for the resend provider");
      return new ResendProvider(env.RESEND_API_KEY);
    case "memory":
      return new MemoryProvider();
    default:
      return new ConsoleProvider(
        env.RADAR_OUT_DIR ? join(env.RADAR_OUT_DIR, "emails") : "out/emails",
      );
  }
}
