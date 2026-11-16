import { z } from "zod";
import type { RawItem } from "../../schemas";
import { cleanTitle, truncate } from "../../util/text";
import type { SourceAdapter, SourceContext, SourceDefOf } from "../types";

const ResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        created_at: z.string(),
        author_id: z.string().optional(),
      }),
    )
    .optional(),
  includes: z
    .object({ users: z.array(z.object({ id: z.string(), username: z.string() })) })
    .optional(),
});

/**
 * OPTIONAL PLUGIN (bring your own key). Uses the official X API v2 recent search with YOUR bearer token.
 * OppRadar never scrapes x.com. You are responsible for complying with the X developer terms.
 */
export function createXApiAdapter(def: SourceDefOf<"x_api">, ctx: SourceContext): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "x_api",
    quality: def.quality,
    async fetch(since) {
      const token = (ctx.env ?? process.env)[def.token_env];
      if (!token) {
        ctx.logger.warn({ source: def.id }, `${def.token_env} not set, skipping`);
        return [];
      }
      const items: RawItem[] = [];
      for (const q of def.queries) {
        const url =
          "https://api.x.com/2/tweets/search/recent?max_results=25&tweet.fields=created_at,author_id&expansions=author_id&query=" +
          encodeURIComponent(`${q} -is:retweet lang:en`) +
          `&start_time=${encodeURIComponent(since.toISOString())}`;
        const res = await ctx.http.get(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
        const parsed = ResponseSchema.parse(JSON.parse(res.text));
        const users = new Map((parsed.includes?.users ?? []).map((u) => [u.id, u.username]));
        for (const t of parsed.data ?? []) {
          const user = (t.author_id && users.get(t.author_id)) || "i";
          items.push({
            source_id: def.id,
            source_name: def.name,
            title: truncate(cleanTitle(t.text.replace(/https?:\/\/\S+/g, "")), 180),
            url: `https://x.com/${user}/status/${t.id}`,
            published_at: new Date(t.created_at).toISOString(),
            guid: t.id,
          });
        }
      }
      return items;
    },
  };
}
