import { z } from "zod";
import type { HttpClient } from "../http/client";
import type { Logger } from "../logger";
import type { RawItem } from "../schemas";

export const SOURCE_KINDS = [
  "rss",
  "google_news",
  "hn_search",
  "hn_who_is_hiring",
  "reddit",
  "sec_form_d",
  "producthunt",
  "x_api",
  "apify",
] as const;

const base = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  enabled: z.boolean().default(true),
  /** 0-100, feeds the source_quality part of the score. */
  quality: z.number().min(0).max(100).default(60),
  region: z.string().optional(),
  note: z.string().optional(),
};

export const SourceDefSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("rss"), url: z.string().url() }),
  z.object({
    ...base,
    kind: z.literal("google_news"),
    queries: z.array(z.string()).default([]),
    editions: z.array(z.enum(["IN", "US"])).default(["IN", "US"]),
    /** Also generate queries from watchlist companies. */
    include_watchlist: z.boolean().default(true),
    window: z.string().default("2d"),
  }),
  z.object({
    ...base,
    kind: z.literal("hn_search"),
    queries: z.array(z.string()).default(["Launch HN", "raises", "YC"]),
  }),
  z.object({ ...base, kind: z.literal("hn_who_is_hiring"), max_comments: z.number().default(300) }),
  z.object({
    ...base,
    kind: z.literal("reddit"),
    subreddits: z.array(z.string()).default(["startups", "IndianStartups", "SaaS"]),
  }),
  z.object({ ...base, kind: z.literal("sec_form_d"), count: z.number().default(100) }),
  z.object({
    ...base,
    kind: z.literal("producthunt"),
    token_env: z.string().default("PRODUCT_HUNT_TOKEN"),
  }),
  z.object({
    ...base,
    kind: z.literal("x_api"),
    token_env: z.string().default("X_BEARER_TOKEN"),
    queries: z.array(z.string()).default([]),
  }),
  z.object({
    ...base,
    kind: z.literal("apify"),
    token_env: z.string().default("APIFY_TOKEN"),
    actor: z.string(),
    input: z.record(z.string(), z.unknown()).default({}),
    /** Field names in each dataset item. */
    title_field: z.string().default("title"),
    url_field: z.string().default("url"),
    date_field: z.string().default("date"),
  }),
]);
export type SourceDef = z.infer<typeof SourceDefSchema>;
export type SourceDefOf<K extends SourceDef["kind"]> = Extract<SourceDef, { kind: K }>;

export const SourcesFileSchema = z.object({
  defaults: z
    .object({
      rate_limit_ms: z.number().default(1500),
      timeout_ms: z.number().default(15000),
      host_rate_limits: z.record(z.string(), z.number()).default({}),
    })
    .default({ rate_limit_ms: 1500, timeout_ms: 15000, host_rate_limits: {} }),
  sources: z.array(SourceDefSchema),
});
export type SourcesFile = z.infer<typeof SourcesFileSchema>;

export interface SourceContext {
  http: HttpClient;
  logger: Logger;
  now: () => Date;
  /** Contact email for SEC EDGAR's required User-Agent. */
  contactEmail?: string;
  /** Watchlist companies to build Google News queries from (aggregated across users in hosted mode). */
  watchlist?: string[];
  env?: Record<string, string | undefined>;
}

export interface SourceAdapter {
  id: string;
  name: string;
  kind: SourceDef["kind"];
  quality: number;
  fetch(since: Date): Promise<RawItem[]>;
}

export class SourceBlockedError extends Error {
  constructor(
    public sourceId: string,
    public status: number,
  ) {
    super(`source ${sourceId} blocked with HTTP ${status}`);
    this.name = "SourceBlockedError";
  }
}

export function isAfter(iso: string | undefined, since: Date): boolean {
  if (!iso) return true;
  return Date.parse(iso) >= since.getTime();
}
