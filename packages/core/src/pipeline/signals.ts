import { assignClusters, type ClusterRecord } from "../dedupe/cluster";
import type { ClassifiedCandidate } from "../classify/classify";
import { SignalSchema, type Signal } from "../schemas";

/** Classified candidates -> Signals with cluster ids. Duplicates of an existing cluster are marked non-primary. */
export function buildSignals(
  classified: ClassifiedCandidate[],
  existingClusters: ClusterRecord[] = [],
): { signals: Signal[]; clusters: ClusterRecord[]; primaryIds: Set<string> } {
  const { items, clusters } = assignClusters(classified, existingClusters);
  const primaryIds = new Set<string>();
  const signals = items.map((it) => {
    const cluster = clusters.find((c) => c.cluster_id === it.cluster_id);
    const others = [...it.other_sources];
    for (const s of cluster?.sources ?? []) {
      if (s.url !== it.canonical_url && !others.some((o) => o.url === s.url)) others.push(s);
    }
    if (
      cluster &&
      !it.is_primary &&
      cluster.canonical_url !== it.canonical_url &&
      !others.some((o) => o.url === cluster.canonical_url)
    ) {
      others.unshift({ source_name: "First report", url: cluster.canonical_url });
    }
    const { snippet: _s, extra: _e, is_primary, ...rest } = it;
    const signal = SignalSchema.parse({
      ...rest,
      id: `sig_${it.content_hash}`,
      other_sources: others,
    });
    if (is_primary) primaryIds.add(signal.id);
    return signal;
  });
  return { signals, clusters, primaryIds };
}
