import { z } from "zod";
import type { RawItem } from "../schemas";
import { cleanTitle, stripHtml, truncate } from "../util/text";
import {
  SourceBlockedError,
  type SourceAdapter,
  type SourceContext,
  type SourceDefOf,
} from "./types";

const ListingSchema = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.object({
          id: z.string(),
          title: z.string(),
          permalink: z.string(),
          url: z.string().optional(),
          selftext: z.string().optional(),
          created_utc: z.number(),
          stickied: z.boolean().optional(),
        }),
      }),
    ),
  }),
});

/**
 * Reddit public .json listings. Low frequency, descriptive User-Agent.
 * If Reddit blocks unauthenticated access (403/429), the adapter throws SourceBlockedError
 * and the pipeline disables it for the run instead of retrying.
 */
export function createRedditAdapter(def: SourceDefOf<"reddit">, ctx: SourceContext): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "reddit",
    quality: def.quality,
    async fetch(since) {
      const items: RawItem[] = [];
      for (const sub of def.subreddits) {
        const res = await ctx.http.get(
          `https://www.reddit.com/r/${sub}/new.json?limit=50&raw_json=1`,
          {
            headers: { Accept: "application/json" },
          },
        );
        if (res.status === 403 || res.status === 429)
          throw new SourceBlockedError(def.id, res.status);
        if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
        let json: unknown;
        try {
          json = JSON.parse(res.text);
        } catch {
          throw new SourceBlockedError(def.id, res.status);
        }
        for (const { data: p } of ListingSchema.parse(json).data.children) {
          if (p.stickied || p.created_utc * 1000 < since.getTime()) continue;
          items.push({
            source_id: def.id,
            source_name: `r/${sub}`,
            title: cleanTitle(p.title),
            url: `https://www.reddit.com${p.permalink}`,
            published_at: new Date(p.created_utc * 1000).toISOString(),
            snippet: p.selftext ? truncate(stripHtml(p.selftext), 280) : undefined,
            guid: p.id,
          });
        }
      }
      return items;
    },
  };
}
