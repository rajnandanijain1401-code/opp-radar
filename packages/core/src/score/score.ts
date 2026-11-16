import type { RoleFamily, Signal, UserProfile } from "../schemas";
import { companyKey } from "../dedupe/cluster";

export interface ScoringConfig {
  weights: { hiring: number; relevance: number; recency: number; source_quality: number };
  /** Recency halves every N hours. */
  recency_half_life_hours: number;
  /** Below this final score an item is dropped. */
  digest_min_score: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  weights: { hiring: 0.45, relevance: 0.35, recency: 0.1, source_quality: 0.1 },
  recency_half_life_hours: 24,
  digest_min_score: 40,
};

export interface ScoreBreakdown {
  final: number;
  hiring: number;
  relevance: number;
  recency: number;
  source_quality: number;
  watchlist_hit: boolean;
  excluded: boolean;
  /** Short, human reasons for "why this matters for you". */
  reasons: string[];
}

const ROLE_NAMES: Record<RoleFamily, string> = {
  engineering: "engineering",
  product: "product",
  design: "design",
  data: "data",
  sales: "sales",
  marketing: "marketing",
  ops: "operations",
  finance: "finance",
  hr: "people",
  customer_success: "customer success",
  leadership: "leadership",
};

const norm = (s: string) => s.toLowerCase().trim();

function includesAny(haystack: string, needles: string[]): string | null {
  const h = haystack.toLowerCase();
  for (const n of needles) {
    const k = norm(n);
    if (k && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(h)) return n;
  }
  return null;
}

export function isWatchlistHit(company: string, watchlist: string[]): boolean {
  const key = companyKey(company);
  if (!key || key === "unknown") return false;
  return watchlist.some((w) => {
    const wk = companyKey(w);
    return wk === key || (wk.length >= 4 && (key.startsWith(`${wk}-`) || wk.startsWith(`${key}-`)));
  });
}

export function recencyScore(publishedAt: string, now: Date, halfLifeHours: number): number {
  const ageH = Math.max(0, (now.getTime() - Date.parse(publishedAt)) / 3_600_000);
  return 100 * Math.pow(0.5, ageH / halfLifeHours);
}

/** relevance in 0-100 from roles, sectors, geos and keywords; watchlist forces 100, excludes force 0. */
export function relevanceScore(
  s: Pick<
    Signal,
    | "company_name"
    | "title"
    | "summary"
    | "roles_likely"
    | "sectors"
    | "geographies"
    | "event_type"
    | "amount_usd"
  >,
  p: UserProfile,
): { relevance: number; watchlist_hit: boolean; excluded: boolean; reasons: string[] } {
  const text = `${s.company_name} ${s.title} ${s.summary} ${s.sectors.join(" ")}`;
  const excludedBy = p.exclude_keywords.length ? includesAny(text, p.exclude_keywords) : null;
  if (excludedBy)
    return {
      relevance: 0,
      watchlist_hit: false,
      excluded: true,
      reasons: [`Excluded by "${excludedBy}"`],
    };
  if (isWatchlistHit(s.company_name, p.watchlist_companies)) {
    return {
      relevance: 100,
      watchlist_hit: true,
      excluded: false,
      reasons: [`${s.company_name} is on your watchlist`],
    };
  }

  const reasons: string[] = [];
  const roleHits = p.roles.filter((r) => s.roles_likely.includes(r));
  const roles = p.roles.length ? (roleHits.length ? 1 : 0) : 0.6;
  if (roleHits.length)
    reasons.push(`Likely hiring for ${roleHits.map((r) => ROLE_NAMES[r]).join(", ")}`);

  const sectorHit = p.sectors.find(
    (ps) => s.sectors.some((ss) => norm(ss) === norm(ps)) || includesAny(text, [ps]),
  );
  const sectors = p.sectors.length ? (sectorHit ? 1 : 0) : 0.6;
  if (sectorHit) reasons.push(`In ${sectorHit}`);

  const geoHit = p.geographies.find((pg) =>
    s.geographies.some(
      (sg) => norm(sg) === norm(pg) || norm(sg).includes(norm(pg)) || norm(pg) === "remote",
    ),
  );
  const geos = p.geographies.length ? (geoHit ? 1 : s.geographies.length ? 0 : 0.4) : 0.6;
  if (geoHit) reasons.push(`Based in ${geoHit}`);

  const kwHit = p.include_keywords.length ? includesAny(text, p.include_keywords) : null;
  const keywords = p.include_keywords.length ? (kwHit ? 1 : 0.3) : 0.5;
  if (kwHit) reasons.push(`Mentions "${kwHit}"`);

  let rel = 100 * (0.35 * roles + 0.25 * sectors + 0.2 * geos + 0.2 * keywords);
  if (p.event_types.length && !p.event_types.includes(s.event_type)) rel *= 0.2;
  if (
    p.min_amount_usd &&
    s.event_type === "funding" &&
    s.amount_usd != null &&
    s.amount_usd < p.min_amount_usd
  )
    rel *= 0.5;
  return { relevance: Math.round(rel), watchlist_hit: false, excluded: false, reasons };
}

export function scoreSignal(
  s: Signal,
  p: UserProfile,
  now: Date,
  cfg: ScoringConfig = DEFAULT_SCORING,
): ScoreBreakdown {
  const rel = relevanceScore(s, p);
  const recency = recencyScore(s.published_at, now, cfg.recency_half_life_hours);
  const w = cfg.weights;
  const final = rel.excluded
    ? 0
    : w.hiring * s.hiring_likelihood +
      w.relevance * rel.relevance +
      w.recency * recency +
      w.source_quality * s.source_quality;
  return {
    final: Math.round(Math.max(0, Math.min(100, final))),
    hiring: s.hiring_likelihood,
    relevance: rel.relevance,
    recency: Math.round(recency),
    source_quality: s.source_quality,
    watchlist_hit: rel.watchlist_hit,
    excluded: rel.excluded,
    reasons: rel.reasons,
  };
}
