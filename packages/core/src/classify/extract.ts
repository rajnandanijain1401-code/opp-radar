/** Heuristic extractors shared by the rules classifier. Pure functions, easy to test. */

export const FX_TO_USD = { INR: 1 / 84, EUR: 1.08, GBP: 1.27, USD: 1 } as const;

const UNIT: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  mln: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  crore: 1e7,
  cr: 1e7,
  lakh: 1e5,
  lk: 1e5,
};

/** Parse the first money amount in a headline and convert to USD. */
export function parseAmountUsd(text: string): number | null {
  const re =
    /(us\$|\$|usd\s?|€|eur\s?|£|gbp\s?|₹|rs\.?\s?|inr\s?)\s?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|mn|mln|million|m|bn|billion|b|crore|cr|lakh|lk)?\b/i;
  const m = text.match(re);
  if (!m) {
    // "raises 20 million dollars" style
    const m2 = text.match(/\b(\d+(?:\.\d+)?)\s*(million|billion)\s*(dollars|usd)?\b/i);
    if (!m2) return null;
    return Math.round(Number(m2[1]) * UNIT[m2[2]!.toLowerCase()]!);
  }
  const cur = m[1]!.toLowerCase().replace(/[.\s]/g, "");
  const n = Number(m[2]!.replace(/,/g, ""));
  const unit = m[3] ? (UNIT[m[3].toLowerCase()] ?? 1) : 1;
  const fx =
    cur === "₹" || cur === "rs" || cur === "inr"
      ? FX_TO_USD.INR
      : cur === "€" || cur === "eur"
        ? FX_TO_USD.EUR
        : cur === "£" || cur === "gbp"
          ? FX_TO_USD.GBP
          : FX_TO_USD.USD;
  const usd = n * unit * fx;
  return Number.isFinite(usd) && usd > 0 ? Math.round(usd) : null;
}

export function parseRound(text: string): string | null {
  const m = text.match(
    /\b(pre-seed|seed|angel|pre-series [a-h]|series [a-h]\d?|bridge|venture debt|growth round|debt)\b/i,
  );
  if (!m) return null;
  return m[1]!
    .toLowerCase()
    .replace(/\b([a-h])$/, (c) => c.toUpperCase())
    .replace(/^series/, "Series")
    .replace(/^pre-series/, "Pre-Series")
    .replace(/^seed$/, "Seed")
    .replace(/^pre-seed$/, "Pre-seed")
    .replace(/^angel$/, "Angel");
}

export function parseInvestors(text: string): string[] {
  const out: string[] = [];
  const led = text.match(/\b[Ll]ed [Bb]y ([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)/);
  if (led) out.push(led[1]!.trim());
  const from = text.match(
    /\bfrom ((?:[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)(?:,\s*[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)*)/,
  );
  if (from) {
    for (const part of from[1]!.split(/,\s*|\s+and\s+/)) {
      const p = part.trim();
      if (p && !/^(regulatory|its|the)$/i.test(p) && !out.includes(p)) out.push(p);
    }
  }
  return out.slice(0, 6);
}

const GEO: [RegExp, string, string?][] = [
  [/\b(bengaluru|bangalore)\b/i, "India", "Bengaluru"],
  [/\bmumbai\b/i, "India", "Mumbai"],
  [/\b(delhi|new delhi|ncr)\b/i, "India", "Delhi NCR"],
  [/\b(gurugram|gurgaon|noida)\b/i, "India", "Delhi NCR"],
  [/\bpune\b/i, "India", "Pune"],
  [/\bhyderabad\b/i, "India", "Hyderabad"],
  [/\bchennai\b/i, "India", "Chennai"],
  [/\b(india|indian|sebi|nse|bse|upi|crore)\b/i, "India"],
  [/\b(san francisco|bay area|silicon valley)\b/i, "United States", "San Francisco"],
  [/\b(new york|nyc)\b/i, "United States", "New York"],
  [/\bboston\b/i, "United States", "Boston"],
  [/\baustin\b/i, "United States", "Austin"],
  [/\bseattle\b/i, "United States", "Seattle"],
  [/\b(u\.s\.|usa|united states|american|sec|nasdaq|nyse|s-1|form d)\b/i, "United States"],
  [/\b(uk|london|britain|british)\b/i, "United Kingdom", "London"],
  [/\bsingapore\b/i, "Singapore"],
  [/\b(dubai|uae|abu dhabi)\b/i, "UAE"],
  [/\b(europe|european|berlin|paris|amsterdam|czech)\b/i, "Europe"],
];

export function parseGeographies(text: string, regionHint?: string): string[] {
  const out = new Set<string>();
  for (const [re, country, city] of GEO) {
    if (re.test(text)) {
      out.add(country);
      if (city) out.add(city);
    }
  }
  if (!out.size && regionHint)
    out.add(regionHint === "IN" ? "India" : regionHint === "US" ? "United States" : regionHint);
  return [...out];
}

const SECTORS: [RegExp, string][] = [
  [
    /\b(fintech|payments?|lending|loans?|upi|credit|neobank|banking|insurtech|wealth|bank)\b/i,
    "fintech",
  ],
  [/\b(health|healthtech|medical|medtech|diagnostics|hospital|clinic|pharma)\b/i, "healthtech"],
  [/\b(bio|biotech|protein|drug|genomics)\b/i, "biotech"],
  [/\b(edtech|education|learning|learnly|upskilling|school)\b/i, "edtech"],
  [
    /\b(ai|artificial intelligence|ml|machine learning|llm|genai|agentic|copilots?|agents?)\b/i,
    "ai",
  ],
  [/\b(saas|software|b2b|crm|erp|accounting|bookkeeping)\b/i, "saas"],
  [/\b(observability|developer|devtools|api|infrastructure|cloud|database)\b/i, "devtools"],
  [/\b(security|cybersecurity|identity|fraud)\b/i, "cybersecurity"],
  [/\b(e-?commerce|d2c|retail|kirana|quick commerce|marketplace|grocery)\b/i, "commerce"],
  [/\b(mobility|ride|ev|electric vehicle|logistics|delivery|fleet)\b/i, "mobility"],
  [/\b(climate|solar|clean ?tech|carbon|renewable)\b/i, "climate"],
  [/\b(agri|agritech|farm|farmers?)\b/i, "agritech"],
  [/\b(construction|real estate|proptech)\b/i, "proptech"],
  [/\b(design tool|design)\b/i, "design"],
  [/\b(gaming|games?)\b/i, "gaming"],
];

export function parseSectors(text: string): string[] {
  const out: string[] = [];
  for (const [re, s] of SECTORS) if (re.test(text) && !out.includes(s)) out.push(s);
  return out.slice(0, 4);
}

const DESCRIPTOR =
  /^(startup|start-up|platform|company|firm|unicorn|soonicorn|major|giant|player|brand|marketplace|app|maker|provider|operator|lender|chain|fintech|edtech|healthtech|agritech|insurtech|proptech|saas|services|based)$/i;

const LEADING_NOISE =
  /^(exclusive|breaking|report|update|funding|deal|news|launch hn|show hn|ask hn|watch|scoop|just in)\s*:\s*/i;

const EVENT_VERBS =
  /\s(raises?|raised|bags|secures?|lands|nets|closes|is raising|in talks|acquires?|acquired|to acquire|buys|appoints?|names|hires|ropes in|elevates|opens?|launch(es|ed)?|unveils?|introduces?|rolls out|debuts?|files?|filed|lays off|laid off|to lay off|cuts|to expand|expands?|enters?|partners?|ties up|teams up|signs?|wins?|is hiring|to hire|hiring|plans|announces?|selects?|picks|joins|merges|goes|completes|receives|gets|to raise|lands|set to|shuts)\b/i;

/** Pull the company name out of a headline. Returns "Unknown" when nothing plausible is found. */
export function extractCompany(title: string): string {
  const hn = title.match(/^(?:launch|show)\s+hn:\s*([^(:\-\u2013]+)/i);
  if (hn?.[1]?.trim()) return hn[1].trim();
  let t = title.replace(LEADING_NOISE, "").trim();
  const m = t.match(EVENT_VERBS);
  let head = m && m.index !== undefined && m.index > 0 ? t.slice(0, m.index) : "";
  if (!head) {
    // No verb found: fall back to the longest run of capitalized words, skipping a leading verb.
    t = t.replace(/^(meet|how|why|what|inside|here's|these|this)\s+/i, "");
    const runs = t.match(/(?:[A-Z][\w&.'-]*)(?:\s+(?:[A-Z][\w&.'-]*|&|of|AI))*/g) ?? [];
    const best = runs.sort((a, b) => b.length - a.length)[0];
    return best ? best.trim() : "Unknown";
  }
  head = head.replace(/[,:;]\s*$/, "").trim();
  const tokens = head.split(/\s+/);
  // Drop everything up to the last descriptor ("Fintech Startup Zeta Pay" -> "Zeta Pay").
  let cut = -1;
  tokens.forEach((tok, i) => {
    const bare = tok.replace(/[^\w-]/g, "");
    if (DESCRIPTOR.test(bare) || /-based$/i.test(bare) || /tech$/i.test(bare)) cut = i;
  });
  let name = tokens.slice(cut + 1).join(" ");
  if (!name && cut >= 0) name = tokens.slice(cut).join(" ");
  // Strip lowercase leading words ("mobility platform" leftovers) and possessives.
  name = name
    .replace(/^([a-z][\w-]*\s+)+/, "")
    .replace(/'s$/, "")
    .trim();
  if (!name || name.length > 60) return "Unknown";
  return name;
}

/** "Vaultline, Inc." -> "Vaultline" for display (cluster keys already ignore suffixes). */
export function displayCompany(name: string): string {
  return (
    name.replace(/,?\s+(inc|llc|ltd|corp|corporation|co|plc|pvt\.? ltd)\.?$/i, "").trim() || name
  );
}

export function parseHireCount(text: string): number | null {
  const m = text.match(
    /\b(?:hire|hiring|add|recruit)\s+(?:over\s+|up to\s+|about\s+|around\s+)?(\d[\d,]*)\b/i,
  );
  return m ? Number(m[1]!.replace(/,/g, "")) : null;
}
