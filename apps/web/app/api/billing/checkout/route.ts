import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { paymentProvider, type BillingProviderName } from "@/lib/billing";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Starts a hosted checkout and redirects there. Only active when BILLING_ENABLED=true. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/signup", req.url), 303);
  const base = env().RADAR_PUBLIC_URL.replace(/\/$/, "");
  if (!env().BILLING_ENABLED) return NextResponse.redirect(`${base}/dashboard?tab=billing`, 303);
  if (!(await rateLimit(`checkout:${user.id}`, 10, 3600)))
    return new NextResponse("Too many requests", { status: 429 });
  const form = await req.formData();
  const name = form.get("provider") === "stripe" ? "stripe" : ("razorpay" as BillingProviderName);
  const provider = paymentProvider(name);
  if (!provider)
    return NextResponse.redirect(`${base}/dashboard?tab=billing&billing=unavailable`, 303);
  try {
    const { url } = await provider.createCheckout({
      userId: user.id,
      email: user.email,
      successUrl: `${base}/dashboard?tab=billing&billing=success`,
      cancelUrl: `${base}/dashboard?tab=billing&billing=cancelled`,
    });
    return NextResponse.redirect(url, 303);
  } catch (err) {
    console.error("checkout failed", err);
    return NextResponse.redirect(`${base}/dashboard?tab=billing&billing=error`, 303);
  }
}
