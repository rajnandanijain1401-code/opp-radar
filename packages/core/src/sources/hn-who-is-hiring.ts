import { z } from "zod";
import type { RawItem } from "../schemas";
import { stripHtml, toIso, truncate } from "../util/text";
import type { SourceAdapter, SourceContext, SourceDefOf } from "./types";

const ThreadSearchSchema = z.object({
  hits: z.array(z.object({ objectID: z.string(), title: z.string(), created_at: z.string() })),
});

interface ItemNode {
  id: number;
  created_at: string;
  text?: string | null;
  author?: string | null;
  children?: ItemNode[];
}
const ItemSchema: z.ZodType<ItemNode> = z.lazy(() =>
  z.object({
    id: z.number(),
    created_at: z.string(),
    text: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    children: z.array(ItemSchema).optional(),
  }),
);

const ROLE_HINT =
  /(engineer|developer|designer|product|manager|scientist|analyst|sales|account exec|marketing|recruit|ops|operations|devops|sre|lead|head of|founding|intern|cto|vp)/i;

/**
 * Parse a "Who is hiring" top-level comment. Convention: first line is
 * "Company | Role(s) | Location | ONSITE/REMOTE | ...". We keep only company + roles.
 */
export function parseHiringComment(
  html: string,
): { company: string; roles: string[]; location?: string } | null {
  const firstLine = stripHtml(html.split(/<p>|\n/i)[0] ?? "");
  const parts = firstLine
    .split(/\s+\|\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0]!.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (!company || company.length > 60) return null;
  const roleParts = parts.slice(1).filter((p) => ROLE_HINT.test(p));
  const roles = roleParts
    .flatMap((p) => p.split(/,|;|\/| and /))
    .map((r) => r.trim())
    .filter((r) => r && ROLE_HINT.test(r))
    .slice(0, 6);
  const location = parts
    .slice(1)
    .find((p) => !ROLE_HINT.test(p) && !/^(onsite|remote|hybrid|full[- ]time|\$)/i.test(p));
  if (!roles.length) return null;
  return { company, roles, location };
}

/** The monthly HN "Who is hiring" thread: each top-level comment becomes a hiring_announcement candidate. */
export function createHnWhoIsHiringAdapter(
  def: SourceDefOf<"hn_who_is_hiring">,
  ctx: SourceContext,
): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "hn_who_is_hiring",
    quality: def.quality,
    async fetch(since) {
      const searchUrl =
        "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=" +
        encodeURIComponent("Who is hiring") +
        "&hitsPerPage=5";
      const res = await ctx.http.get(searchUrl, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
      const thread = ThreadSearchSchema.parse(JSON.parse(res.text)).hits.find((h) =>
        /who is hiring/i.test(h.title),
      );
      if (!thread) return [];
      const ageDays = (ctx.now().getTime() - Date.parse(thread.created_at)) / 86_400_000;
      if (ageDays > 35) return [];
      const itemRes = await ctx.http.get(`https://hn.algolia.com/api/v1/items/${thread.objectID}`, {
        headers: { Accept: "application/json" },
      });
      if (!itemRes.ok) throw new Error(`${def.id}: HTTP ${itemRes.status}`);
      const item = ItemSchema.parse(JSON.parse(itemRes.text));
      const out: RawItem[] = [];
      for (const c of (item.children ?? []).slice(0, def.max_comments)) {
        if (!c.text || Date.parse(c.created_at) < since.getTime()) continue;
        const parsed = parseHiringComment(c.text);
        if (!parsed) continue;
        out.push({
          source_id: def.id,
          source_name: def.name,
          title: truncate(`${parsed.company} is hiring: ${parsed.roles.join(", ")}`, 200),
          url: `https://news.ycombinator.com/item?id=${c.id}`,
          published_at: toIso(c.created_at),
          guid: String(c.id),
          extra: {
            company: parsed.company,
            roles: parsed.roles,
            location: parsed.location,
            thread: thread.objectID,
          },
        });
      }
      return out;
    },
  };
}
