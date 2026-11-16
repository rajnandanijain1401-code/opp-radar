import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Signed, stateless tokens for one-click unsubscribe and email feedback links.
 * Format: base64url(json payload) + "." + base64url(HMAC-SHA256(payload)).
 */
export const LinkPayloadSchema = z.object({
  u: z.string(), // user id or email
  a: z.enum(["unsub", "fb", "prefs"]),
  s: z.string().optional(), // signal id (feedback)
  e: z.number().optional(), // expiry, unix seconds
});
export type LinkPayload = z.infer<typeof LinkPayloadSchema>;

function mac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signToken(payload: LinkPayload, secret: string): string {
  if (!secret || secret.length < 16) throw new Error("link secret must be at least 16 characters");
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${mac(data, secret)}`;
}

export function verifyToken(token: string, secret: string, now = new Date()): LinkPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(mac(data, secret));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const payload = LinkPayloadSchema.parse(
      JSON.parse(Buffer.from(data, "base64url").toString("utf8")),
    );
    if (payload.e && payload.e * 1000 < now.getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface LinkBuilderOptions {
  /** Hosted app base URL. When absent (OSS mode), mailto links are used instead. */
  publicUrl?: string;
  secret?: string;
  /** Reply-to address for mailto fallbacks (OSS mode). */
  mailbox: string;
}

export interface UserLinks {
  unsubscribeUrl: string;
  manageUrl: string;
  listUnsubscribe: string;
  oneClick: boolean;
  feedback(signalId: string, rating: "up" | "down"): string | null;
}

/** Build the per-recipient links used in emails and List-Unsubscribe headers. */
export function buildUserLinks(userKey: string, opts: LinkBuilderOptions): UserLinks {
  const mailto = (subject: string) =>
    `mailto:${opts.mailbox}?subject=${encodeURIComponent(subject)}`;
  const base = opts.publicUrl?.replace(/\/$/, "");
  if (!base || !opts.secret || !/^https?:\/\//.test(base)) {
    return {
      unsubscribeUrl: mailto("unsubscribe"),
      manageUrl: "https://github.com/rajnandanijain1401-code/opp-radar#configuration",
      listUnsubscribe: `<${mailto("unsubscribe")}>`,
      oneClick: false,
      feedback: () => null,
    };
  }
  const secret = opts.secret;
  const unsub = `${base}/unsubscribe?token=${signToken({ u: userKey, a: "unsub" }, secret)}`;
  return {
    unsubscribeUrl: unsub,
    manageUrl: `${base}/dashboard?tab=delivery`,
    listUnsubscribe: `<${base}/api/unsubscribe?token=${signToken({ u: userKey, a: "unsub" }, secret)}>, <${mailto("unsubscribe")}>`,
    oneClick: base.startsWith("https://"),
    feedback: (signalId, rating) =>
      `${base}/api/email/feedback?token=${signToken({ u: userKey, a: "fb", s: signalId }, secret)}&r=${rating}`,
  };
}
