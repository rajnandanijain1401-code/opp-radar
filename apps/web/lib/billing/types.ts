export type BillingProviderName = "razorpay" | "stripe";

export interface CheckoutInput {
  userId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}

/** Normalized subscription change, whatever the provider. */
export interface SubscriptionEvent {
  eventId: string;
  provider: BillingProviderName;
  providerSubscriptionId: string;
  providerCustomerId?: string | null;
  userId?: string | null;
  status: string;
  currentPeriodEnd?: Date | null;
}

export interface PaymentProvider {
  name: BillingProviderName;
  /** Create a hosted checkout / subscription link and return the URL to redirect to. */
  createCheckout(input: CheckoutInput): Promise<{ url: string; providerSubscriptionId?: string }>;
  /** Verify the webhook signature and normalize the event. Returns null for events we ignore. Throws on bad signature. */
  parseWebhook(rawBody: string, headers: Headers): SubscriptionEvent | null;
}

export class WebhookSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
    this.name = "WebhookSignatureError";
  }
}

export type FetchLike = typeof fetch;
