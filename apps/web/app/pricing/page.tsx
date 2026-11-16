import type { Metadata } from "next";
import { PricingTable } from "@/components/pricing-table";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free weekly digest or Pro instant alerts, daily digest, open roles and outreach openers. Or self-host for free.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="font-display text-5xl sm:text-6xl">Pricing</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Start free. Upgrade when you are actively searching. Prefer to run it yourself? The whole
        project is MIT licensed and runs on GitHub Actions or your own Claude at zero cost.
      </p>
      <div className="mt-10">
        <PricingTable billingEnabled={process.env.BILLING_ENABLED === "true"} />
      </div>
      <p className="mt-8 text-sm text-muted">
        Prices in INR are billed through Razorpay (UPI, cards, netbanking). International cards are
        billed in USD through Stripe. Cancel any time.
      </p>
    </div>
  );
}
