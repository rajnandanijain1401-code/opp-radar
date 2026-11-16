import type { Candidate } from "../schemas";
import { titleKey, titleTokens } from "../normalize/normalize";
import { urlKey } from "../normalize/url";

export const NEAR_DUP_THRESHOLD = 0.8;

/** Word unigrams + bigrams. Titles are short, so bigrams add order sensitivity without being brittle. */
export function shingles(title: string): Set<string> {
  const toks = titleTokens(title);
  const out = new Set<string>(toks);
  for (let i = 0; i < toks.length - 1; i++) out.add(`${toks[i]} ${toks[i + 1]}`);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function better(a: Candidate, b: Candidate): Candidate {
  const ta = Date.parse(a.published_at);
  const tb = Date.parse(b.published_at);
  if (ta !== tb) return ta < tb ? a : b; // keep the earliest report
  return a.source_quality >= b.source_quality ? a : b;
}

function merge(keep: Candidate, drop: Candidate): Candidate {
  const others = [...keep.other_sources];
  const add = (name: string, url: string) => {
    if (url !== keep.canonical_url && !others.some((o) => o.url === url))
      others.push({ source_name: name, url });
  };
  add(drop.source_name, drop.canonical_url);
  for (const o of drop.other_sources) add(o.source_name, o.url);
  return { ...keep, other_sources: others };
}

export interface DedupeStats {
  input: number;
  exact_dupes: number;
  near_dupes: number;
  already_seen: number;
  output: number;
}

export interface SeenIndex {
  hashes: Set<string>;
  titleKeys: Set<string>;
}

/**
 * Exact dedupe (content hash / canonical URL / identical normalized title), then near-duplicate
 * dedupe (Jaccard on title shingles >= 0.8). Items in `seen` (from state or DB) are dropped.
 */
export function dedupe(
  items: Candidate[],
  seen?: SeenIndex,
  threshold = NEAR_DUP_THRESHOLD,
): { items: Candidate[]; stats: DedupeStats } {
  const stats: DedupeStats = {
    input: items.length,
    exact_dupes: 0,
    near_dupes: 0,
    already_seen: 0,
    output: 0,
  };
  const sorted = [...items].sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  // Each kept group remembers every hash, URL key and title key it absorbed, so a third report
  // matching the second (not the first) still collapses exactly.
  const kept: { c: Candidate; sh: Set<string>; keys: Set<string> }[] = [];

  for (const c of sorted) {
    const tk = titleKey(c.title);
    if (seen && (seen.hashes.has(c.content_hash) || seen.titleKeys.has(tk))) {
      stats.already_seen++;
      continue;
    }
    const uk = urlKey(c.canonical_url);
    const myKeys = [`h:${c.content_hash}`, `u:${uk}`, `t:${tk}`];
    const exact = kept.findIndex((k) => myKeys.some((key) => k.keys.has(key)));
    if (exact !== -1) {
      const k = kept[exact]!;
      myKeys.forEach((key) => k.keys.add(key));
      const winner = better(k.c, c);
      k.c = winner === k.c ? merge(k.c, c) : merge(c, k.c);
      stats.exact_dupes++;
      continue;
    }
    const sh = shingles(c.title);
    const near = kept.findIndex((k) => jaccard(k.sh, sh) >= threshold);
    if (near !== -1) {
      const k = kept[near]!;
      myKeys.forEach((key) => k.keys.add(key));
      const winner = better(k.c, c);
      k.c = winner === k.c ? merge(k.c, c) : merge(c, k.c);
      stats.near_dupes++;
      continue;
    }
    kept.push({ c, sh, keys: new Set(myKeys) });
  }
  stats.output = kept.length;
  return { items: kept.map((k) => k.c), stats };
}
