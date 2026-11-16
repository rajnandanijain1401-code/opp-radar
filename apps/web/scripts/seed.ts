/*
 * Seed realistic signals: the recorded fixtures (today) plus a week of historical headlines,
 * classified by the rules engine. Usage: pnpm db:seed [--if-empty]
 */
import { sql } from "drizzle-orm";
import { buildSignals, classifyCandidates, normalizeItem, type RawItem } from "@opp-radar/core";
import { db, schema } from "../lib/db";
import { runPipeline } from "../lib/pipeline";
import { insertSignals, loadClusters, saveClusters } from "../lib/store";

const HISTORY: [number, string, string, string][] = [
  // [days ago, source_id, title, url]
  [
    1,
    "inc42",
    "Healthtech startup Medora raises $28 Mn Series B to expand diagnostics network",
    "https://example.com/seed/medora-series-b",
  ],
  [
    1,
    "entrackr",
    "Stackmint plans to hire 300 people this year as demand grows",
    "https://example.com/seed/stackmint-hiring",
  ],
  [
    1,
    "techcrunch-venture",
    "Ledgerlight raises $18M Series A to automate revenue accounting",
    "https://example.com/seed/ledgerlight-series-a",
  ],
  [
    1,
    "yourstory",
    "Kestrel to acquire lending platform Credora for $90 million",
    "https://example.com/seed/kestrel-credora",
  ],
  [
    2,
    "et-startups",
    "Agrova is hiring 200 engineers across Bengaluru and Pune",
    "https://example.com/seed/agrova-hiring",
  ],
  [
    2,
    "crunchbase-news",
    "Pinecrest Labs Raises $40M Series B For AI Code Review",
    "https://example.com/seed/pinecrest-series-b",
  ],
  [
    2,
    "inc42",
    "Gurugram-based Plotline nets Rs 40 crore in funding from Sahyadri Capital",
    "https://example.com/seed/plotline-funding",
  ],
  [
    2,
    "techcrunch-startups",
    "Northwind Data opens London office to serve European banks",
    "https://example.com/seed/northwind-london",
  ],
  [
    3,
    "entrackr",
    "Fleetcore partners with Tata Motors to power EV fleet analytics",
    "https://example.com/seed/fleetcore-tata",
  ],
  [
    3,
    "yourstory",
    "Lumio sets up R&D centre in Pune, plans to hire 120 engineers",
    "https://example.com/seed/lumio-pune",
  ],
  [
    3,
    "techcrunch-venture",
    "Quanta Grid lands $60M Series C to build battery storage software",
    "https://example.com/seed/quanta-grid",
  ],
  [
    4,
    "et-tech",
    "Healthtech unicorn Medora appoints Arjun Mehta as CFO",
    "https://example.com/seed/medora-cfo",
  ],
  [
    4,
    "inc42",
    "D2C brand Hearthly raises $6 Mn seed round led by Ember Capital",
    "https://example.com/seed/hearthly-seed",
  ],
  [
    4,
    "crunchbase-news",
    "Brightloop Buys Analytics Startup Nimbus",
    "https://example.com/seed/brightloop-nimbus",
  ],
  [
    5,
    "hn",
    "Launch HN: Tidepool (YC F26) - Customer support agents for fintechs",
    "https://example.com/seed/tidepool-launch",
  ],
  [
    5,
    "entrackr",
    "Cartwheel cuts 15% of workforce in second round of job cuts",
    "https://example.com/seed/cartwheel-layoffs",
  ],
  [
    5,
    "yourstory",
    "Kosha AI launches agentic close for mid-market finance teams",
    "https://example.com/seed/kosha-launch",
  ],
  [
    6,
    "techcrunch-startups",
    "Vaultline names former Okta exec as chief product officer",
    "https://example.com/seed/vaultline-cpo",
  ],
  [
    6,
    "et-startups",
    "Ridewise bags Rs 120 crore Series B to expand to tier-2 cities",
    "https://example.com/seed/ridewise-series-b",
  ],
  [
    6,
    "inc42",
    "Indus Cloud expands to Singapore, to hire 60 for sales and support",
    "https://example.com/seed/indus-singapore",
  ],
];

async function main() {
  const ifEmpty = process.argv.includes("--if-empty");
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.signals);
  const existing = Number(row?.n ?? 0);
  if (ifEmpty && existing > 0) {
    console.log(`seed skipped: ${existing} signals already present`);
    process.exit(0);
  }
  const now = new Date();
  // Today's signals from the recorded fixtures, through the real hosted pipeline (no emails).
  const report = await runPipeline({ trigger: "seed", now, fixtures: true, deliver: false });

  // A week of history so onboarding previews and /signals archives have content.
  const quality = {
    inc42: 80,
    entrackr: 80,
    yourstory: 75,
    "et-tech": 75,
    "et-startups": 80,
    "techcrunch-venture": 85,
    "techcrunch-startups": 80,
    "crunchbase-news": 85,
    hn: 65,
  } as Record<string, number>;
  const names: Record<string, string> = {
    inc42: "Inc42",
    entrackr: "Entrackr",
    yourstory: "YourStory",
    "et-tech": "Economic Times Tech",
    "et-startups": "Economic Times Startups",
    "techcrunch-venture": "TechCrunch Venture",
    "techcrunch-startups": "TechCrunch Startups",
    "crunchbase-news": "Crunchbase News",
    hn: "Hacker News",
  };
  const raws = HISTORY.map(([days, source_id, title, url], i): RawItem => ({
    source_id,
    source_name: names[source_id] ?? source_id,
    title,
    url,
    published_at: new Date(now.getTime() - days * 86_400_000 - i * 1_800_000).toISOString(),
  }));
  const candidates = raws.map((r) =>
    normalizeItem(r, {
      fetchedAt: new Date(Date.parse(r.published_at!) + 600_000),
      qualityBySource: quality,
    }),
  );
  const cls = await classifyCandidates(candidates, { mode: "rules" });
  const built = buildSignals(cls.items, await loadClusters());
  await insertSignals(built.signals, built.primaryIds);
  await saveClusters(built.clusters);
  console.log(
    `seeded: ${report.counts.classified ?? 0} fixture signals + ${built.signals.length} historical signals`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
