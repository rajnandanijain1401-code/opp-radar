import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { RazorpayProvider } from "../lib/billing/razorpay";
import { StripeProvider } from "../lib/billing/stripe";
import { WebhookSignatureError } from "../lib/billing/types";
import { verifySvix } from "../lib/webhooks";

const rzp = (fetchImpl?: typeof fetch) =>
  new RazorpayProvider({
    keyId: "rzp_test_x",
    keySecret: "secret",
    webhookSecret: "whsec_rzp",
    planId: "plan_123",
    fetchImpl,
  });
const stripe = (fetchImpl?: typeof fetch) =>
  new StripeProvider({
    secretKey: "sk_test_x",
    webhookSecret: "whsec_stripe",
    priceId: "price_123",
    fetchImpl,
  });

describe("Razorpay provider", () => {
  it("creates a subscription and returns its hosted link", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "sub_1", short_url: "https://rzp.io/i/abc" }), {
          status: 200,
        }),
    );
    const res = await rzp(fetchImpl as unknown as typeof fetch).createCheckout({
      userId: "u1",
      email: "a@b.co",
      successUrl: "x",
    });
    expect(res).toEqual({ url: "https://rzp.io/i/abc", providerSubscriptionId: "sub_1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions");
    expect(JSON.parse(String(init.body))).toMatchObject({
      plan_id: "plan_123",
      notes: { user_id: "u1" },
    });
  });

  it("verifies webhook signatures and normalizes events", () => {
    const body = JSON.stringify({
      event: "subscription.activated",
      created_at: 1794800000,
      payload: {
        subscription: {
          entity: {
            id: "sub_1",
            status: "active",
            customer_id: "cust_1",
            current_end: 1797400000,
            notes: { user_id: "u1" },
          },
        },
      },
    });
    const sig = createHmac("sha256", "whsec_rzp").update(body).digest("hex");
    const evt = rzp().parseWebhook(
      body,
      new Headers({ "x-razorpay-signature": sig, "x-razorpay-event-id": "evt_1" }),
    );
    expect(evt).toMatchObject({
      eventId: "evt_1",
      provider: "razorpay",
      providerSubscriptionId: "sub_1",
      userId: "u1",
      status: "active",
    });
    expect(evt!.currentPeriodEnd!.getTime()).toBe(1797400000 * 1000);
    expect(() => rzp().parseWebhook(body, new Headers({ "x-razorpay-signature": "bad" }))).toThrow(
      WebhookSignatureError,
    );
  });

  it("ignores non-subscription events", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const sig = createHmac("sha256", "whsec_rzp").update(body).digest("hex");
    expect(rzp().parseWebhook(body, new Headers({ "x-razorpay-signature": sig }))).toBeNull();
  });
});

describe("Stripe provider", () => {
  const sign = (body: string, t = Math.floor(Date.now() / 1000)) =>
    `t=${t},v1=${createHmac("sha256", "whsec_stripe").update(`${t}.${body}`).digest("hex")}`;

  it("creates a subscription checkout session", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_1" }), {
          status: 200,
        }),
    );
    const res = await stripe(fetchImpl as unknown as typeof fetch).createCheckout({
      userId: "u1",
      email: "a@b.co",
      successUrl: "https://s",
      cancelUrl: "https://c",
    });
    expect(res.url).toBe("https://checkout.stripe.com/c/pay/cs_1");
    const body = new URLSearchParams(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("client_reference_id")).toBe("u1");
    expect(body.get("line_items[0][price]")).toBe("price_123");
  });

  it("maps checkout completion and subscription deletion", () => {
    const done = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_9", customer: "cus_1", client_reference_id: "u1" } },
    });
    expect(
      stripe().parseWebhook(done, new Headers({ "stripe-signature": sign(done) })),
    ).toMatchObject({ providerSubscriptionId: "sub_9", userId: "u1", status: "active" });
    const del = JSON.stringify({
      id: "evt_2",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_9", status: "canceled", metadata: { user_id: "u1" } } },
    });
    expect(stripe().parseWebhook(del, new Headers({ "stripe-signature": sign(del) }))!.status).toBe(
      "canceled",
    );
  });

  it("rejects bad or stale signatures", () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: {} } });
    expect(() =>
      stripe().parseWebhook(body, new Headers({ "stripe-signature": "t=1,v1=00" })),
    ).toThrow(WebhookSignatureError);
    expect(() =>
      stripe().parseWebhook(body, new Headers({ "stripe-signature": sign(body, 1000) })),
    ).toThrow(WebhookSignatureError);
  });
});

describe("Resend (Svix) webhook signatures", () => {
  it("accepts a valid v1 signature and rejects tampering", () => {
    const secret = "whsec_" + Buffer.from("resend-test-key").toString("base64");
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["x@y.z"] } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from("resend-test-key"))
      .update(`msg_1.${ts}.${body}`)
      .digest("base64");
    expect(verifySvix(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret)).toBe(
      true,
    );
    expect(
      verifySvix(body + " ", { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret),
    ).toBe(false);
  });
});
