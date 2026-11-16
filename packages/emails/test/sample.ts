import { SignalSchema, type ScoredSignal, type Signal, buildUserLinks } from "@opp-radar/core";

export const NOW = new Date("2026-11-16T03:00:00Z");

const base = {
  canonical_url: "https://inc42.com/buzz/zeta-pay",
  source_id: "inc42",
  source_name: "Inc42",
  source_quality: 80,
  published_at: "2026-11-16T01:00:00.000Z",
  fetched_at: "2026-11-16T03:00:00.000Z",
  other_sources: [{ source_name: "Entrackr", url: "https://entrackr.com/zeta" }],
  company_domain: null,
  confidence: 0.8,
  classifier: "llm" as const,
};

export function sig(over: Partial<Signal>): Signal {
  return SignalSchema.parse({
    ...base,
    id: "sig_zeta",
    content_hash: "zeta",
    cluster_id: "zeta-pay-funding-x",
    title: "Zeta Pay raises $20 Mn in Series B led by Northstar Ventures",
    company_name: "Zeta Pay",
    event_type: "funding",
    amount_usd: 20_000_000,
    round: "Series B",
    investors: ["Northstar Ventures"],
    geographies: ["India", "Bengaluru"],
    sectors: ["fintech"],
    roles_likely: ["engineering", "product"],
    hiring_likelihood: 84,
    hiring_reason:
      "New Series B money usually funds engineering and sales hiring in the next two quarters.",
    summary:
      "Zeta Pay closed a $20M Series B led by Northstar Ventures. It plans to grow its lending product for small merchants.",
    suggested_action:
      "Check Zeta Pay's careers page and reach out to the engineering lead this week.",
    outreach_opener:
      "Congrats on the Series B, Zeta Pay team! I'd love to help you scale engineering.",
    open_roles_count: 12,
    open_roles_url: "https://boards.greenhouse.io/zetapay",
    open_roles_sample: [
      "Senior Backend Engineer, Lending",
      "Product Designer",
      "Engineering Manager, Payments",
    ],
    ...over,
  });
}

export const scored = (s: Signal, final: number): ScoredSignal => ({
  signal: s,
  score: {
    final,
    hiring: s.hiring_likelihood,
    relevance: 90,
    recency: 92,
    source_quality: 80,
    watchlist_hit: false,
    excluded: false,
    reasons: ["Likely hiring for engineering", "In fintech"],
  },
});

export const SAMPLE = [
  scored(sig({}), 88),
  scored(
    sig({
      id: "sig_orbit",
      cluster_id: "orbit",
      company_name: "Orbit Health",
      event_type: "acquisition",
      amount_usd: 30_000_000,
      round: null,
      investors: [],
      title: "Orbit Health acquires Lumen Labs",
      summary:
        "Orbit Health bought AI diagnostics startup Lumen Labs. The deal adds an imaging team to Orbit.",
      open_roles_count: null,
      open_roles_url: null,
      open_roles_sample: [],
    }),
    77,
  ),
  scored(
    sig({
      id: "sig_ship",
      cluster_id: "shelfwise",
      company_name: "ShelfWise",
      event_type: "expansion",
      amount_usd: null,
      round: null,
      investors: [],
      title: "ShelfWise opens new office in Hyderabad, to hire 150",
      summary: "ShelfWise is opening a Hyderabad office and plans to hire about 150 people.",
      open_roles_count: null,
    }),
    71,
  ),
];

export const LINKS = buildUserLinks("user_1", {
  publicUrl: "https://oppradar.example",
  secret: "test-secret-test-secret-123",
  mailbox: "radar@oppradar.example",
});
