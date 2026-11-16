import type { EventType, OtherSource } from "../schemas";
import { shortHash } from "../util/hash";
import { slugify } from "../util/text";

export const CLUSTER_WINDOW_HOURS = 72;

const LEGAL_SUFFIX =
  /\b(inc|incorporated|llc|ltd|limited|pvt|private|corp|corporation|co|plc|gmbh|sa|ag|bv|pte|llp)\b\.?/g;

/** "Zeta Pay Pvt. Ltd." and "zeta pay" share a key. */
export function companyKey(name: string): string {
  return slugify(name.toLowerCase().replace(/[.,]/g, " ").replace(LEGAL_SUFFIX, " "));
}

export interface ClusterRecord {
  cluster_id: string;
  company_key: string;
  event_type: EventType;
  first_published_at: string;
  canonical_url: string;
  title: string;
  sources: OtherSource[];
}

export interface Clusterable {
  company_name: string;
  event_type: EventType;
  published_at: string;
  canonical_url: string;
  source_name: string;
  title: string;
  cluster_id?: string;
}

/**
 * Same company + same event type within 72h = same event. Existing clusters (from state or DB)
 * are matched first so a story that arrives a day later joins its original cluster and is never
 * sent twice. Returns the items with cluster_id set and the updated cluster list.
 * Items for unknown companies or "other" events get their own cluster.
 */
export function assignClusters<T extends Clusterable>(
  items: T[],
  existing: ClusterRecord[] = [],
): { items: (T & { cluster_id: string; is_primary: boolean })[]; clusters: ClusterRecord[] } {
  const clusters = existing.map((c) => ({ ...c, sources: [...c.sources] }));
  const windowMs = CLUSTER_WINDOW_HOURS * 3_600_000;
  const sorted = [...items].sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  const out: (T & { cluster_id: string; is_primary: boolean })[] = [];

  for (const it of sorted) {
    const key = companyKey(it.company_name);
    const clusterable = key && key !== "unknown" && it.event_type !== "other";
    const t = Date.parse(it.published_at);
    const match = clusterable
      ? clusters.find(
          (c) =>
            c.company_key === key &&
            c.event_type === it.event_type &&
            Math.abs(Date.parse(c.first_published_at) - t) <= windowMs,
        )
      : undefined;
    if (match) {
      if (
        !match.sources.some((s) => s.url === it.canonical_url) &&
        match.canonical_url !== it.canonical_url
      )
        match.sources.push({ source_name: it.source_name, url: it.canonical_url });
      out.push({ ...it, cluster_id: match.cluster_id, is_primary: false });
      continue;
    }
    const cluster_id = clusterable
      ? `${key}-${it.event_type}-${shortHash(`${key}|${it.event_type}|${it.published_at.slice(0, 10)}`, 8)}`
      : `item-${shortHash(it.canonical_url, 16)}`;
    clusters.push({
      cluster_id,
      company_key: key,
      event_type: it.event_type,
      first_published_at: it.published_at,
      canonical_url: it.canonical_url,
      title: it.title,
      sources: [],
    });
    out.push({ ...it, cluster_id, is_primary: true });
  }
  return { items: out, clusters };
}

/** Drop clusters older than `days` (state pruning). */
export function pruneClusters(clusters: ClusterRecord[], now: Date, days = 14): ClusterRecord[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return clusters.filter((c) => Date.parse(c.first_published_at) >= cutoff);
}
