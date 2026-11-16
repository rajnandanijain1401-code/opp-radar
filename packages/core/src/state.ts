import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { SignalSchema } from "./schemas";
import { pruneClusters, type ClusterRecord } from "./dedupe/cluster";
import type { EnrichCacheEntry } from "./enrich/jobboards";

const iso = z.string();

const ClusterRecordSchema = z.object({
  cluster_id: z.string(),
  company_key: z.string(),
  event_type: z.string(),
  first_published_at: iso,
  canonical_url: z.string(),
  title: z.string(),
  sources: z.array(z.object({ source_name: z.string(), url: z.string() })),
});

/**
 * OSS-mode state, committed back to the repo by the GitHub Action.
 * Holds only hashes, cluster keys, counters and our own short summaries (never article text).
 */
export const StateSchema = z.object({
  version: z.literal(1).default(1),
  last_run_at: iso.nullable().default(null),
  seen: z.record(z.string(), iso).default({}),
  seen_titles: z.record(z.string(), iso).default({}),
  clusters: z.array(ClusterRecordSchema).default([]),
  sent_clusters: z.record(z.string(), iso).default({}),
  instant: z
    .object({ date: z.string().nullable(), count: z.number().int(), last_sent_at: iso.nullable() })
    .default({ date: null, count: 0, last_sent_at: null }),
  instant_queue: z.array(SignalSchema).default([]),
  digest_queue: z.array(SignalSchema).default([]),
  last_digest_sent_at: iso.nullable().default(null),
  llm_usage: z
    .object({ date: z.string().nullable(), tokens: z.number() })
    .default({ date: null, tokens: 0 }),
  enrich_cache: z
    .record(
      z.string(),
      z.object({
        at: iso,
        value: z
          .object({
            board: z.enum(["greenhouse", "lever", "ashby"]),
            slug: z.string(),
            count: z.number(),
            url: z.string(),
            sample: z.array(z.string()),
          })
          .nullable(),
      }),
    )
    .default({}),
  source_health: z
    .record(
      z.string(),
      z.object({
        last_items_at: iso.nullable(),
        last_error: z.string().nullable(),
        unhealthy_notified_at: iso.nullable(),
      }),
    )
    .default({}),
});
export type RadarState = z.infer<typeof StateSchema>;

export function emptyState(): RadarState {
  return StateSchema.parse({});
}

export function loadState(path: string): RadarState {
  if (!existsSync(path)) return emptyState();
  const text = readFileSync(path, "utf8").trim();
  if (!text) return emptyState();
  return StateSchema.parse(JSON.parse(text));
}

/** Stable, pretty JSON so git diffs stay readable. */
export function saveState(path: string, state: RadarState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

export const STATE_RETENTION_DAYS = 14;

/** Drop seen hashes, clusters and sent markers older than 14 days; enrich cache older than 24h; stale queues. */
export function pruneState(state: RadarState, now: Date): RadarState {
  const cutoff = now.getTime() - STATE_RETENTION_DAYS * 86_400_000;
  const keep = (rec: Record<string, string>) =>
    Object.fromEntries(Object.entries(rec).filter(([, t]) => Date.parse(t) >= cutoff));
  const enrichCutoff = now.getTime() - 86_400_000;
  const queueCutoff = now.getTime() - 8 * 86_400_000;
  return {
    ...state,
    seen: keep(state.seen),
    seen_titles: keep(state.seen_titles),
    sent_clusters: keep(state.sent_clusters),
    clusters: pruneClusters(state.clusters as ClusterRecord[], now, STATE_RETENTION_DAYS),
    enrich_cache: Object.fromEntries(
      Object.entries(state.enrich_cache).filter(([, e]) => Date.parse(e.at) >= enrichCutoff),
    ) as Record<string, EnrichCacheEntry>,
    digest_queue: state.digest_queue.filter((s) => Date.parse(s.published_at) >= queueCutoff),
  };
}
