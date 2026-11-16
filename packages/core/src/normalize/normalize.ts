import type { Candidate, RawItem } from "../schemas";
import { shortHash } from "../util/hash";
import { cleanTitle, toIso } from "../util/text";
import { canonicalizeUrl, urlKey } from "./url";

const STOPWORDS = new Set(
  "a an the of in on at to for from by with and or as is are was were be its it this that via after amid over into new says report exclusive".split(
    " ",
  ),
);

const SYNONYMS: Record<string, string> = {
  raised: "raise",
  raises: "raise",
  raising: "raise",
  bags: "raise",
  secures: "raise",
  secured: "raise",
  lands: "raise",
  nets: "raise",
  closes: "raise",
  gets: "raise",
  mn: "m",
  mln: "m",
  million: "m",
  bn: "b",
  billion: "b",
  cr: "crore",
  rs: "inr",
  acquires: "acquire",
  acquired: "acquire",
  buys: "acquire",
  appoints: "appoint",
  names: "appoint",
  hires: "hire",
  hiring: "hire",
  launches: "launch",
  launched: "launch",
  unveils: "launch",
};

/** Normalized token list used for near-duplicate detection. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[$€£₹]/g, " ")
    .replace(/(\d+(?:\.\d+)?)\s*(mn|m|million|mln|bn|b|billion|cr|crore)\b/g, "$1 $2")
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => SYNONYMS[t] ?? t);
}

export function titleKey(title: string): string {
  return titleTokens(title).join(" ");
}

export interface NormalizeOptions {
  fetchedAt: Date;
  qualityBySource: Record<string, number>;
}

/** Raw item -> candidate: canonical URL, clean title, ISO dates, content hash. */
export function normalizeItem(raw: RawItem, opts: NormalizeOptions): Candidate {
  const canonical = canonicalizeUrl(raw.url);
  const fetched = opts.fetchedAt.toISOString();
  const published = toIso(raw.published_at) ?? fetched;
  return {
    content_hash: shortHash(urlKey(canonical), 24),
    canonical_url: canonical,
    source_id: raw.source_id,
    source_name: raw.source_name,
    source_quality: opts.qualityBySource[raw.source_id] ?? 50,
    title: cleanTitle(raw.title),
    // Never trust future dates from feeds.
    published_at: Date.parse(published) > opts.fetchedAt.getTime() ? fetched : published,
    fetched_at: fetched,
    snippet: raw.snippet,
    other_sources: [],
    extra: raw.extra,
  };
}
