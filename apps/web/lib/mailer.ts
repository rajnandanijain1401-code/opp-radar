import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildUserLinks, type UserLinks } from "@opp-radar/core";
import { createEmailProvider, unsubscribeHeaders, type EmailProvider } from "@opp-radar/emails";
import { env } from "./env";

declare global {
  var __oppradarMailer: EmailProvider | undefined;
}

/** Resend in production, console in dev (prints the email and writes it to out/emails). */
export function mailer(): EmailProvider {
  if (globalThis.__oppradarMailer) return globalThis.__oppradarMailer;
  const e = env();
  const kind = e.RADAR_EMAIL_PROVIDER ?? (e.RESEND_API_KEY ? "resend" : "console");
  globalThis.__oppradarMailer = createEmailProvider({
    ...process.env,
    RADAR_EMAIL_PROVIDER: kind,
    RADAR_OUT_DIR: join(process.cwd(), "out"),
  });
  return globalThis.__oppradarMailer;
}

export function linksFor(userId: string): UserLinks {
  const e = env();
  return buildUserLinks(userId, {
    publicUrl: e.RADAR_PUBLIC_URL,
    secret: e.RADAR_LINK_SECRET,
    mailbox: (e.EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? e.EMAIL_FROM).trim(),
  });
}

export async function sendEmail(opts: {
  to: string;
  userId?: string;
  subject: string;
  html: string;
  text: string;
  category: string;
}) {
  const headers = opts.userId
    ? (() => {
        const l = linksFor(opts.userId);
        return unsubscribeHeaders(l.listUnsubscribe, l.oneClick);
      })()
    : undefined;
  return mailer().send({
    to: opts.to,
    from: env().EMAIL_FROM,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    headers,
    tags: [{ name: "category", value: opts.category }],
  });
}

/** Dev/test only: keep the latest magic link on disk so Playwright and humans can grab it. */
export function rememberMagicLink(email: string, url: string) {
  if (env().NODE_ENV === "production" && env().RADAR_EMAIL_PROVIDER !== "console") return;
  const dir = join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "last-magic-link.json"),
    JSON.stringify({ email, url, at: new Date().toISOString() }),
  );
  process.stdout.write(`\n[OppRadar dev] Magic link for ${email}:\n${url}\n\n`);
}
