import { z } from "zod";
import type { RawItem } from "../../schemas";
import { cleanTitle, truncate } from "../../util/text";
import type { SourceAdapter, SourceContext, SourceDefOf } from "../types";

const ResponseSchema = z.object({
  data: z.object({
    posts: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            id: z.string(),
            name: z.string(),
            tagline: z.string(),
            url: z.string(),
            website: z.string().nullable().optional(),
            createdAt: z.string(),
          }),
        }),
      ),
    }),
  }),
});

const QUERY = `query RecentPosts($postedAfter: DateTime) {
  posts(first: 30, order: NEWEST, postedAfter: $postedAfter) {
    edges { node { id name tagline url website createdAt } }
  }
}`;

/**
 * OPTIONAL PLUGIN (bring your own key). Product Hunt API v2 with your developer token.
 * You are responsible for complying with Product Hunt's API terms.
 */
export function createProductHuntAdapter(
  def: SourceDefOf<"producthunt">,
  ctx: SourceContext,
): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "producthunt",
    quality: def.quality,
    async fetch(since) {
      const token = (ctx.env ?? process.env)[def.token_env];
      if (!token) {
        ctx.logger.warn({ source: def.id }, `${def.token_env} not set, skipping`);
        return [];
      }
      const res = await ctx.http.request("https://api.producthunt.com/v2/api/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query: QUERY, variables: { postedAfter: since.toISOString() } }),
      });
      if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
      return ResponseSchema.parse(JSON.parse(res.text)).data.posts.edges.map(
        ({ node }): RawItem => ({
          source_id: def.id,
          source_name: def.name,
          title: cleanTitle(`${node.name} launches on Product Hunt: ${node.tagline}`),
          url: node.url,
          published_at: new Date(node.createdAt).toISOString(),
          snippet: truncate(node.tagline, 200),
          guid: node.id,
          extra: { company: node.name, website: node.website },
        }),
      );
    },
  };
}
