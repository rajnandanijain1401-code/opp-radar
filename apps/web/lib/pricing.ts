export interface PricingPlan {
  id: "free" | "pro";
  name: string;
  priceInr: string;
  priceUsd: string;
  period: string;
  blurb: string;
  features: string[];
}

export const PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    priceInr: "₹0",
    priceUsd: "$0",
    period: "forever",
    blurb: "A weekly scan of the signals that match you.",
    features: [
      "Weekly digest, top 10 signals",
      "1 profile",
      "5 watchlist companies",
      "Public signals page",
      "Self-host it all (MIT)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceInr: "₹299",
    priceUsd: "$5",
    period: "per month",
    blurb: "For an active search: hear about it the hour it happens.",
    features: [
      "Instant alerts for high-score signals",
      "Daily digest at your hour, top 15",
      "Open roles from Greenhouse, Lever and Ashby",
      "Suggested next step and outreach openers",
      "3 profiles, 25 watchlist companies",
    ],
  },
];
