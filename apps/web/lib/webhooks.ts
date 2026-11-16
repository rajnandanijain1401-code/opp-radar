import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Svix signatures (used by Resend webhooks): HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * with the base64 secret after the "whsec_" prefix; header holds space-separated "v1,<sig>" entries.
 */
export function verifySvix(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
  toleranceSec = 300,
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSec) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest("base64");
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && !!sig && safeEqual(sig, expected);
  });
}

/** Razorpay: hex HMAC-SHA256 of the raw body with the webhook secret, in X-Razorpay-Signature. */
export function verifyRazorpay(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return safeEqual(signature, expected);
}

/** Stripe: "t=<ts>,v1=<hex>" over `${t}.${body}` (we also accept the official SDK in the route). */
export function verifyStripe(
  body: string,
  header: string | null,
  secret: string,
  now = Date.now(),
  toleranceSec = 300,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .some((p) => safeEqual(p.slice(3), expected));
}
