import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { RawItem } from "../schemas";
import { RawItemSchema } from "../schemas";
import { RobotsDisallowedError } from "../http/client";
import { createGoogleNewsAdapter } from "./google-news";
import { createHnSearchAdapter } from "./hackernews";
import { createHnWhoIsHiringAdapter } from "./hn-who-is-hiring";
import { createApifyAdapter } from "./plugins/apify";
import { createProductHuntAdapter } from "./plugins/producthunt";
import { createXApiAdapter } from "./plugins/x-api";
import { createRedditAdapter } from "./reddit";
import { createRssAdapter } from "./rss";
import { createSecFormDAdapter } from "./sec-edgar";
import {
  SourceBlockedError,
  SourcesFileSchema,
  type SourceAdapter,
  type SourceContext,
  type SourceDef,
  type SourcesFile,
} from "./types";

export function loadSourcesFile(path: string): SourcesFile {
  return SourcesFileSchema.parse(parseYaml(readFileSync(path, "utf8")));
}

export function createAdapter(def: SourceDef, ctx: SourceContext): SourceAdapter {
  switch (def.kind) {
    case "rss":
      return createRssAdapter(def, ctx);
    case "google_news":
      return createGoogleNewsAdapter(def, ctx);
    case "hn_search":
      return createHnSearchAdapter(def, ctx);
    case "hn_who_is_hiring":
      return createHnWhoIsHiringAdapter(def, ctx);
    case "reddit":
      return createRedditAdapter(def, ctx);
    case "sec_form_d":
      return createSecFormDAdapter(def, ctx);
    case "producthunt":
      return createProductHuntAdapter(def, ctx);
    case "x_api":
      return createXApiAdapter(def, ctx);
    case "apify":
      return createApifyAdapter(def, ctx);
  }
}

/** Adapters for enabled sources, optionally filtered to an allow-list of ids. */
export function buildAdapters(
  file: SourcesFile,
  ctx: SourceContext,
  only?: string[],
): SourceAdapter[] {
  return file.sources
    .filter((s) => (only?.length ? only.includes(s.id) : s.enabled))
    .map((s) => createAdapter(s, ctx));
}

export interface SourceRunResult {
  source_id: string;
  source_name: string;
  items: RawItem[];
  items_fetched: number;
  error?: string;
  blocked?: boolean;
  duration_ms: number;
}

/** Run all adapters in parallel. One failing source never fails the run. Invalid items are dropped. */
export async function runSources(
  adapters: SourceAdapter[],
  since: Date,
  ctx: Pick<SourceContext, "logger">,
): Promise<SourceRunResult[]> {
  return Promise.all(
    adapters.map(async (a): Promise<SourceRunResult> => {
      const started = Date.now();
      try {
        const raw = await a.fetch(since);
        const items = raw.filter((it) => RawItemSchema.safeParse(it).success);
        ctx.logger.debug({ source: a.id, count: items.length }, "source fetched");
        return {
          source_id: a.id,
          source_name: a.name,
          items,
          items_fetched: items.length,
          duration_ms: Date.now() - started,
        };
      } catch (err) {
        const blocked = err instanceof SourceBlockedError || err instanceof RobotsDisallowedError;
        ctx.logger.warn({ source: a.id, err: String(err), blocked }, "source failed");
        return {
          source_id: a.id,
          source_name: a.name,
          items: [],
          items_fetched: 0,
          error: String(err instanceof Error ? err.message : err),
          blocked,
          duration_ms: Date.now() - started,
        };
      }
    }),
  );
}
