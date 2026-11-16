import { z } from "zod";
import type { RawItem } from "../schemas";
import { cleanTitle, toIso } from "../util/text";
import type { SourceAdapter, SourceContext, SourceDefOf } from "./types";

const HitSchema = z.object({
  objectID: z.string(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  created_at: z.string(),
  created_at_i: z.number().optional(),
  points: z.number().nullable().optional(),
});
const SearchSchema = z.object({ hits: z.array(HitSchema) });

/** Hacker News via the public Algolia API: Launch HN, raises, YC. */
export function createHnSearchAdapter(
  def: SourceDefOf<"hn_search">,
  ctx: SourceContext,
): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "hn_search",
    quality: def.quality,
    async fetch(since) {
      const seen = new Set<string>();
      const items: RawItem[] = [];
      const sinceSec = Math.floor(since.getTime() / 1000);
      for (const q of def.queries) {
        const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${sinceSec}&hitsPerPage=50`;
        const res = await ctx.http.get(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
        const parsed = SearchSchema.parse(JSON.parse(res.text));
        for (const h of parsed.hits) {
          if (!h.title || seen.has(h.objectID)) continue;
          if (Date.parse(h.created_at) < since.getTime()) continue;
          seen.add(h.objectID);
          const hnUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
          items.push({
            source_id: def.id,
            source_name: def.name,
            title: cleanTitle(h.title),
            url: h.url || hnUrl,
            published_at: toIso(h.created_at),
            guid: h.objectID,
            extra: { hn_url: hnUrl, points: h.points ?? 0, query: q },
          });
        }
      }
      return items;
    },
  };
}
