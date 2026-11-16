import { z } from "zod";
import { verifyStripe } from "../webhooks";
import {
  WebhookSignatureError,
  type FetchLike,
  type PaymentProvider,
  type SubscriptionEvent,
} from "./types";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  fetchImpl?: FetchLike;
}

const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

/** Stripe Checkout in subscription mode (USD, international cards). */
export class StripeProvider implements PaymentProvider {
  name = "stripe" as const;
  constructor(private cfg: StripeConfig) {}

  async createCheckout(input: {
    userId: string;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const form = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": this.cfg.priceId,
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      customer_email: input.email,
      "subscription_data[metadata][user_id]": input.userId,
      allow_promotion_codes: "true",
    });
    const res = await (this.cfg.fetchImpl ?? fetch)("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) throw new Error(`Stripe error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { url?: string };
    if (!json.url) throw new Error("Stripe did not return a checkout URL");
    return { url: json.url };
  }

  parseWebhook(rawBody: string, headers: Headers): SubscriptionEvent | null {
    if (!verifyStripe(rawBody, headers.get("stripe-signature"), this.cfg.webhookSecret)) {
      throw new WebhookSignatureError();
    }
    const evt = EventSchema.parse(JSON.parse(rawBody));
    const o = evt.data.object as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    if (evt.type === "checkout.session.completed") {
      const sub = str(o.subscription);
      if (!sub) return null;
      return {
        eventId: evt.id,
        provider: "stripe",
        providerSubscriptionId: sub,
        providerCustomerId: str(o.customer),
        userId: str(o.client_reference_id),
        status: "active",
      };
    }
    if (evt.type.startsWith("customer.subscription.")) {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const end = typeof o.current_period_end === "number" ? o.current_period_end : null;
      return {
        eventId: evt.id,
        provider: "stripe",
        providerSubscriptionId: String(o.id),
        providerCustomerId: str(o.customer),
        userId: str(meta.user_id),
        status:
          evt.type === "customer.subscription.deleted" ? "canceled" : (str(o.status) ?? "active"),
        currentPeriodEnd: end ? new Date(end * 1000) : null,
      };
    }
    return null;
  }
}
