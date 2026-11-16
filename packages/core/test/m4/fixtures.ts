import {
  SignalSchema,
  UserProfileSchema,
  type Signal,
  type UserProfileInput,
} from "../../src/schemas";

export const NOW = new Date("2026-11-16T12:00:00Z");

export function mkSignal(over: Partial<Signal> = {}): Signal {
  return SignalSchema.parse({
    id: "sig_1",
    content_hash: "h1",
    canonical_url: "https://inc42.com/zeta",
    source_id: "inc42",
    source_name: "Inc42",
    source_quality: 80,
    title: "Zeta Pay raises $20 Mn in Series B",
    published_at: "2026-11-16T10:00:00.000Z",
    fetched_at: "2026-11-16T12:00:00.000Z",
    other_sources: [],
    company_name: "Zeta Pay",
    company_domain: null,
    event_type: "funding",
    amount_usd: 20_000_000,
    round: "Series B",
    investors: ["Northstar Ventures"],
    geographies: ["India", "Bengaluru"],
    sectors: ["fintech"],
    roles_likely: ["engineering", "product", "sales"],
    hiring_likelihood: 82,
    hiring_reason: "Fresh capital funds hiring.",
    summary: "Zeta Pay raised $20M.",
    suggested_action: "Reach out.",
    outreach_opener: "Congrats!",
    confidence: 0.6,
    cluster_id: "zeta-pay-funding-1",
    classifier: "rules",
    ...over,
  });
}

export const profile = (over: UserProfileInput = {}) =>
  UserProfileSchema.parse({
    roles: ["engineering"],
    sectors: ["fintech"],
    geographies: ["India"],
    ...over,
  });
