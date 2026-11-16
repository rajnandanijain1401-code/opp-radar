import { and, desc, gte, inArray, sql } from "drizzle-orm";
import {
  SignalSchema,
  titleKey,
  type ClassifiedCandidate,
  type ClassificationCache,
  type ClusterRecord,
  type EnrichCache,
  type EnrichCacheEntry,
  type Signal,
} from "@opp-radar/core";
import { db, schema } from "./db";

type SignalRow = typeof schema.signals.$inferSelect;

export function rowToSignal(r: SignalRow): Signal {
  return SignalSchema.parse({
    id: r.id,
    content_hash: r.contentHash,
    canonical_url: r.canonicalUrl,
    source_id: r.sourceId,
    source_name: r.sourceName,
    source_quality: r.sourceQuality,
    title: r.title,
    published_at: r.publishedAt.toISOString(),
    fetched_at: r.fetchedAt.toISOString(),
    other_sources: r.otherSources,
    company_name: r.companyName,
    company_domain: r.companyDomain,
    event_type: r.eventType,
    amount_usd: r.amountUsd,
    round: r.round,
    investors: r.investors,
    geographies: r.geographies,
    sectors: r.sectors,
    roles_likely: r.rolesLikely,
    hiring_likelihood: r.hiringLikelihood,
    hiring_reason: r.hiringReason,
    summary: r.summary,
    suggested_action: r.suggestedAction,
    outreach_opener: r.outreachOpener,
    confidence: r.confidence,
    cluster_id: r.clusterId,
    classifier: r.classifier,
    open_roles_count: r.openRolesCount,
    open_roles_url: r.openRolesUrl,
    open_roles_sample: r.openRolesSample ?? undefined,
  });
}

export function signalToRow(s: Signal, isPrimary: boolean): typeof schema.signals.$inferInsert {
  return {
    id: s.id,
    contentHash: s.content_hash,
    canonicalUrl: s.canonical_url,
    sourceId: s.source_id,
    sourceName: s.source_name,
    sourceQuality: Math.round(s.source_quality),
    title: s.title,
    titleKey: titleKey(s.title),
    publishedAt: new Date(s.published_at),
    fetchedAt: new Date(s.fetched_at),
    companyName: s.company_name,
    companyDomain: s.company_domain ?? null,
    eventType: s.event_type,
    amountUsd: s.amount_usd ?? null,
    round: s.round ?? null,
    investors: s.investors,
    geographies: s.geographies,
    sectors: s.sectors,
    rolesLikely: s.roles_likely,
    hiringLikelihood: s.hiring_likelihood,
    hiringReason: s.hiring_reason,
    summary: s.summary,
    suggestedAction: s.suggested_action,
    outreachOpener: s.outreach_opener,
    confidence: s.confidence,
    clusterId: s.cluster_id,
    isPrimary,
    classifier: s.classifier,
    otherSources: s.other_sources,
    openRolesCount: s.open_roles_count ?? null,
    openRolesUrl: s.open_roles_url ?? null,
    openRolesSample: s.open_roles_sample ?? null,
  };
}

export async function insertSignals(signals: Signal[], primaryIds: Set<string>) {
  if (!signals.length) return 0;
  const rows = signals.map((s) => signalToRow(s, primaryIds.has(s.id)));
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(schema.signals)
      .values(rows.slice(i, i + 200))
      .onConflictDoNothing();
  }
  return rows.length;
}

export async function seenIndex(days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({ h: schema.signals.contentHash, t: schema.signals.titleKey })
    .from(schema.signals)
    .where(gte(schema.signals.fetchedAt, since));
  return { hashes: new Set(rows.map((r) => r.h)), titleKeys: new Set(rows.map((r) => r.t)) };
}

export async function loadClusters(days = 14): Promise<ClusterRecord[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select()
    .from(schema.signalClusters)
    .where(gte(schema.signalClusters.firstPublishedAt, since));
  return rows.map((r) => ({
    cluster_id: r.clusterId,
    company_key: r.companyKey,
    event_type: r.eventType as ClusterRecord["event_type"],
    first_published_at: r.firstPublishedAt.toISOString(),
    canonical_url: r.canonicalUrl,
    title: r.title,
    sources: r.sources,
  }));
}

export async function saveClusters(clusters: ClusterRecord[]) {
  for (const c of clusters) {
    await db
      .insert(schema.signalClusters)
      .values({
        clusterId: c.cluster_id,
        companyKey: c.company_key,
        eventType: c.event_type,
        firstPublishedAt: new Date(c.first_published_at),
        canonicalUrl: c.canonical_url,
        title: c.title,
        sources: c.sources,
      })
      .onConflictDoUpdate({ target: schema.signalClusters.clusterId, set: { sources: c.sources } });
  }
}

/** Classification cache backed by the signals table: each item is classified once, globally. */
export function dbClassificationCache(): ClassificationCache {
  return {
    async get(hash) {
      const rows = await db
        .select()
        .from(schema.signals)
        .where(sql`${schema.signals.contentHash} = ${hash}`)
        .limit(1);
      const r = rows[0];
      if (!r) return undefined;
      const s = rowToSignal(r);
      return { ...s, classifier: s.classifier };
    },
    async set() {
      /* persisted via insertSignals */
    },
  };
}

/** Enrichment cache in Postgres, loaded once per run. */
export async function loadEnrichCache(): Promise<
  EnrichCache & { dirty: Map<string, EnrichCacheEntry> }
> {
  const rows = await db
    .select()
    .from(schema.enrichCache)
    .where(gte(schema.enrichCache.at, new Date(Date.now() - 86_400_000)));
  const m = new Map<string, EnrichCacheEntry>(
    rows.map((r) => [
      r.companyKey,
      { at: r.at.toISOString(), value: r.value as EnrichCacheEntry["value"] },
    ]),
  );
  const dirty = new Map<string, EnrichCacheEntry>();
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      m.set(k, v);
      dirty.set(k, v);
    },
    dirty,
  };
}

export async function saveEnrichCache(dirty: Map<string, EnrichCacheEntry>) {
  for (const [k, v] of dirty) {
    await db
      .insert(schema.enrichCache)
      .values({ companyKey: k, value: v.value, at: new Date(v.at) })
      .onConflictDoUpdate({
        target: schema.enrichCache.companyKey,
        set: { value: v.value, at: new Date(v.at) },
      });
  }
}

export async function recentSignals(opts: {
  sinceHours: number;
  limit?: number;
  primaryOnly?: boolean;
}) {
  const since = new Date(Date.now() - opts.sinceHours * 3_600_000);
  const where = opts.primaryOnly
    ? and(gte(schema.signals.publishedAt, since), sql`${schema.signals.isPrimary} = true`)
    : gte(schema.signals.publishedAt, since);
  const rows = await db
    .select()
    .from(schema.signals)
    .where(where)
    .orderBy(desc(schema.signals.publishedAt))
    .limit(opts.limit ?? 500);
  return rows.map(rowToSignal);
}

export async function signalsByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select().from(schema.signals).where(inArray(schema.signals.id, ids));
  return rows.map(rowToSignal);
}

export type { ClassifiedCandidate };
