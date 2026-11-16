import { parseFeed } from "../util/feed";
import type { RawItem } from "../schemas";
import { isAfter, type SourceAdapter, type SourceContext, type SourceDefOf } from "./types";

const EDITIONS = {
  IN: "hl=en-IN&gl=IN&ceid=IN:en",
  US: "hl=en-US&gl=US&ceid=US:en",
} as const;

export const WATCHLIST_TEMPLATES = [
  '"{company}" raises',
  '"{company}" hiring OR appoints OR expands',
];

/** Build the final, deduped query list: static templates plus watchlist-derived queries. */
export function buildGoogleNewsQueries(
  templates: string[],
  watchlist: string[] = [],
  includeWatchlist = true,
): string[] {
  const out = new Set(templates.map((q) => q.trim()).filter(Boolean));
  if (includeWatchlist) {
    const byKey = new Map<string, string>();
    for (const c of watchlist.map((x) => x.trim()).filter(Boolean)) {
      if (!byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c);
    }
    const companies = [...byKey.values()].sort();
    for (const company of companies) {
      for (const t of WATCHLIST_TEMPLATES)
        out.add(t.replace("{company}", company.replace(/"/g, "")));
    }
  }
  return [...out];
}

export function googleNewsUrl(
  query: string,
  edition: keyof typeof EDITIONS,
  window = "2d",
): string {
  const q = window ? `${query} when:${window}` : query;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${EDITIONS[edition]}`;
}

/** Google aggregates many publishers. Titles look like "Headline - Publisher". */
export function splitPublisher(
  title: string,
  publisher?: string,
): { title: string; publisher?: string } {
  if (publisher && title.endsWith(` - ${publisher}`)) {
    return { title: title.slice(0, -(publisher.length + 3)).trim(), publisher };
  }
  const m = title.match(/^(.*\S)\s+-\s+([^-]{2,60})$/);
  if (m) return { title: m[1]!, publisher: publisher ?? m[2]!.trim() };
  return { title, publisher };
}

export function createGoogleNewsAdapter(
  def: SourceDefOf<"google_news">,
  ctx: SourceContext,
): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "google_news",
    quality: def.quality,
    async fetch(since) {
      const queries = buildGoogleNewsQueries(def.queries, ctx.watchlist, def.include_watchlist);
      const items: RawItem[] = [];
      for (const query of queries) {
        for (const edition of def.editions) {
          const res = await ctx.http.get(googleNewsUrl(query, edition, def.window));
          if (!res.ok) {
            ctx.logger.warn(
              { source: def.id, query, status: res.status },
              "google news query failed",
            );
            continue;
          }
          for (const e of parseFeed(res.text)) {
            if (!isAfter(e.published_at, since)) continue;
            const { title, publisher } = splitPublisher(e.title, e.source?.name);
            items.push({
              source_id: def.id,
              source_name: publisher ? `${publisher} via Google News` : def.name,
              publisher,
              title,
              url: e.link,
              published_at: e.published_at,
              guid: e.guid,
              extra: { query, edition },
            });
          }
        }
      }
      return items;
    },
  };
}
