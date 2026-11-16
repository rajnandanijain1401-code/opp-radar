import { parseFeed } from "../util/feed";
import type { RawItem } from "../schemas";
import {
  isAfter,
  SourceBlockedError,
  type SourceAdapter,
  type SourceContext,
  type SourceDefOf,
} from "./types";

/** Generic news RSS / Atom adapter (Inc42, Entrackr, YourStory, ET, TechCrunch, ...). */
export function createRssAdapter(def: SourceDefOf<"rss">, ctx: SourceContext): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "rss",
    quality: def.quality,
    async fetch(since) {
      const res = await ctx.http.get(def.url, {
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9" },
      });
      if (res.status === 403 || res.status === 401)
        throw new SourceBlockedError(def.id, res.status);
      if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
      return parseFeed(res.text)
        .filter((e) => isAfter(e.published_at, since))
        .map((e): RawItem => ({
          source_id: def.id,
          source_name: def.name,
          title: e.title,
          url: e.link,
          published_at: e.published_at,
          snippet: e.snippet,
          guid: e.guid,
        }));
    },
  };
}
