import { z } from "zod";
import type { RawItem } from "../../schemas";
import { cleanTitle, toIso } from "../../util/text";
import type { SourceAdapter, SourceContext, SourceDefOf } from "../types";

const ItemsSchema = z.array(z.record(z.string(), z.unknown()));

/**
 * OPTIONAL PLUGIN (bring your own key). Runs one of YOUR Apify actors synchronously and maps
 * its dataset items to candidates. You are responsible for the actor's compliance with the
 * target site's terms. Do not point this at LinkedIn, X, Instagram or Facebook scrapers.
 */
export function createApifyAdapter(def: SourceDefOf<"apify">, ctx: SourceContext): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "apify",
    quality: def.quality,
    async fetch(since) {
      const token = (ctx.env ?? process.env)[def.token_env];
      if (!token) {
        ctx.logger.warn({ source: def.id }, `${def.token_env} not set, skipping`);
        return [];
      }
      const actor = def.actor.replace("/", "~");
      const res = await ctx.http.request(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?format=json&clean=true`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(def.input),
          timeoutMs: 120_000,
        },
      );
      if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
      const out: RawItem[] = [];
      for (const it of ItemsSchema.parse(JSON.parse(res.text))) {
        const title =
          typeof it[def.title_field] === "string" ? cleanTitle(it[def.title_field] as string) : "";
        const url = typeof it[def.url_field] === "string" ? (it[def.url_field] as string) : "";
        const published = toIso(it[def.date_field]);
        if (!title || !/^https?:\/\//.test(url)) continue;
        if (published && Date.parse(published) < since.getTime()) continue;
        out.push({ source_id: def.id, source_name: def.name, title, url, published_at: published });
      }
      return out;
    },
  };
}
