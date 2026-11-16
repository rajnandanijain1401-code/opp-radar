import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { RazorpayProvider } from "./razorpay";
import { StripeProvider } from "./stripe";
import type { BillingProviderName, PaymentProvider, SubscriptionEvent } from "./types";

export * from "./types";

/** Returns the configured provider, or null when billing is off or keys are missing. */
export function paymentProvider(name: BillingProviderName): PaymentProvider | null {
  const e = env();
  if (!e.BILLING_ENABLED) return null;
  if (name === "razorpay") {
    if (
      !e.RAZORPAY_KEY_ID ||
      !e.RAZORPAY_KEY_SECRET ||
      !e.RAZORPAY_WEBHOOK_SECRET ||
      !e.RAZORPAY_PLAN_ID
    )
      return null;
    return new RazorpayProvider({
      keyId: e.RAZORPAY_KEY_ID,
      keySecret: e.RAZORPAY_KEY_SECRET,
      webhookSecret: e.RAZORPAY_WEBHOOK_SECRET,
      planId: e.RAZORPAY_PLAN_ID,
    });
  }
  if (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET || !e.STRIPE_PRICE_ID) return null;
  return new StripeProvider({
    secretKey: e.STRIPE_SECRET_KEY,
    webhookSecret: e.STRIPE_WEBHOOK_SECRET,
    priceId: e.STRIPE_PRICE_ID,
  });
}

/** Webhook verification must work even if BILLING_ENABLED was just switched off, so it ignores the flag. */
export function webhookProvider(name: BillingProviderName): PaymentProvider | null {
  const e = env();
  if (name === "razorpay" && e.RAZORPAY_WEBHOOK_SECRET)
    return new RazorpayProvider({
      keyId: e.RAZORPAY_KEY_ID ?? "",
      keySecret: e.RAZORPAY_KEY_SECRET ?? "",
      webhookSecret: e.RAZORPAY_WEBHOOK_SECRET,
      planId: e.RAZORPAY_PLAN_ID ?? "",
    });
  if (name === "stripe" && e.STRIPE_WEBHOOK_SECRET)
    return new StripeProvider({
      secretKey: e.STRIPE_SECRET_KEY ?? "",
      webhookSecret: e.STRIPE_WEBHOOK_SECRET,
      priceId: e.STRIPE_PRICE_ID ?? "",
    });
  return null;
}

/** Idempotent upsert of a subscription from a webhook. Unknown users are ignored (logged). */
export async function applySubscriptionEvent(
  evt: SubscriptionEvent,
): Promise<"applied" | "ignored"> {
  const existing = (
    await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.providerSubscriptionId, evt.providerSubscriptionId))
  )[0];
  const userId = evt.userId ?? existing?.userId;
  if (!userId) return "ignored";
  const user = (
    await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId))
  )[0];
  if (!user) return "ignored";
  await db
    .insert(schema.subscriptions)
    .values({
      userId,
      provider: evt.provider,
      providerSubscriptionId: evt.providerSubscriptionId,
      providerCustomerId: evt.providerCustomerId ?? null,
      status: evt.status,
      currentPeriodEnd: evt.currentPeriodEnd ?? null,
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.providerSubscriptionId,
      set: {
        status: evt.status,
        providerCustomerId: evt.providerCustomerId ?? existing?.providerCustomerId ?? null,
        currentPeriodEnd: evt.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null,
        updatedAt: new Date(),
      },
    });
  return "applied";
}
