import { NextResponse, type NextRequest } from "next/server";
import { applySubscriptionEvent, WebhookSignatureError, webhookProvider } from "@/lib/billing";

export const runtime = "nodejs";

/** Verifies the signature on the raw body, then upserts the subscription. Idempotent. */
export async function POST(req: NextRequest) {
  const provider = webhookProvider("stripe");
  if (!provider) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const body = await req.text();
  try {
    const evt = provider.parseWebhook(body, req.headers);
    if (!evt) return NextResponse.json({ ok: true, ignored: true });
    const result = await applySubscriptionEvent(evt);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof WebhookSignatureError)
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    console.error("stripe webhook failed", err);
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
}
