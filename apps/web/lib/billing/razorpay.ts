import { z } from "zod";
import { verifyRazorpay } from "../webhooks";
import {
  WebhookSignatureError,
  type FetchLike,
  type PaymentProvider,
  type SubscriptionEvent,
} from "./types";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  planId: string;
  fetchImpl?: FetchLike;
}

const SubscriptionEntity = z.object({
  id: z.string(),
  status: z.string(),
  customer_id: z.string().nullable().optional(),
  current_end: z.number().nullable().optional(),
  notes: z.union([z.record(z.string(), z.string()), z.array(z.unknown())]).optional(),
});

const WebhookSchema = z.object({
  event: z.string(),
  created_at: z.number().optional(),
  payload: z
    .object({ subscription: z.object({ entity: SubscriptionEntity }).optional() })
    .passthrough(),
});

/** Razorpay Subscriptions (INR, UPI and cards). Primary provider for India. */
export class RazorpayProvider implements PaymentProvider {
  name = "razorpay" as const;
  constructor(private cfg: RazorpayConfig) {}

  async createCheckout(input: { userId: string; email: string; successUrl: string }) {
    const auth = Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString("base64");
    const res = await (this.cfg.fetchImpl ?? fetch)("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: this.cfg.planId,
        total_count: 120,
        customer_notify: 1,
        notes: { user_id: input.userId, email: input.email },
        notify_info: { notify_email: input.email },
      }),
    });
    if (!res.ok)
      throw new Error(`Razorpay error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { id: string; short_url?: string };
    if (!json.short_url) throw new Error("Razorpay did not return a checkout link");
    return { url: json.short_url, providerSubscriptionId: json.id };
  }

  parseWebhook(rawBody: string, headers: Headers): SubscriptionEvent | null {
    if (!verifyRazorpay(rawBody, headers.get("x-razorpay-signature"), this.cfg.webhookSecret)) {
      throw new WebhookSignatureError();
    }
    const evt = WebhookSchema.parse(JSON.parse(rawBody));
    const sub = evt.payload.subscription?.entity;
    if (!evt.event.startsWith("subscription.") || !sub) return null;
    const notes = sub.notes && !Array.isArray(sub.notes) ? sub.notes : {};
    return {
      eventId:
        headers.get("x-razorpay-event-id") ?? `${evt.event}:${sub.id}:${evt.created_at ?? ""}`,
      provider: "razorpay",
      providerSubscriptionId: sub.id,
      providerCustomerId: sub.customer_id ?? null,
      userId: notes.user_id ?? null,
      // Razorpay statuses: created, authenticated, active, pending, halted, cancelled, completed, expired
      status: sub.status,
      currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
    };
  }
}
