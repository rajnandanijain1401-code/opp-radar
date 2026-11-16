import type { HttpClient } from "../http/client";
import type { Logger } from "../logger";
import type { Candidate } from "../schemas";
import { buildAdapters, runSources, type SourceRunResult } from "../sources/registry";
import type { SourcesFile } from "../sources/types";
import { normalizeItem } from "../normalize/normalize";
import { dedupe, type DedupeStats, type SeenIndex } from "../dedupe/dedupe";
import { prefilter } from "../classify/prefilter";

export interface FetchStageOptions {
  sources: SourcesFile;
  http: HttpClient;
  logger: Logger;
  now: Date;
  since: Date;
  seen?: SeenIndex;
  watchlist?: string[];
  contactEmail?: string;
  /** Only these source ids (still must exist in sources.yaml). */
  only?: string[];
  env?: Record<string, string | undefined>;
}

export interface FetchStageResult {
  candidates: Candidate[];
  /** Every unique item (before the pre-filter), so callers can mark them all as seen. */
  unique: Candidate[];
  sourceRuns: SourceRunResult[];
  counts: { fetched: number; deduped: number; prefiltered: number };
  dedupe: DedupeStats;
}

/** Ingest -> normalize -> dedupe (incl. against state) -> pre-filter. */
export async function fetchCandidates(opts: FetchStageOptions): Promise<FetchStageResult> {
  const ctx = {
    http: opts.http,
    logger: opts.logger,
    now: () => opts.now,
    contactEmail: opts.contactEmail,
    watchlist: opts.watchlist,
    env: opts.env,
  };
  const adapters = buildAdapters(opts.sources, ctx, opts.only);
  const sourceRuns = await runSources(adapters, opts.since, ctx);
  const qualityBySource = Object.fromEntries(opts.sources.sources.map((s) => [s.id, s.quality]));
  const raw = sourceRuns.flatMap((r) => r.items);
  const normalized = raw.map((r) => normalizeItem(r, { fetchedAt: opts.now, qualityBySource }));
  const { items: unique, stats } = dedupe(normalized, opts.seen);
  const { passed } = prefilter(unique);
  return {
    candidates: passed,
    unique,
    sourceRuns,
    counts: { fetched: raw.length, deduped: unique.length, prefiltered: passed.length },
    dedupe: stats,
  };
}

/** Region hint per source (for geographies when a headline names none). */
export function regionBySource(sources: SourcesFile): Record<string, string | undefined> {
  return Object.fromEntries(sources.sources.map((s) => [s.id, s.region]));
}
