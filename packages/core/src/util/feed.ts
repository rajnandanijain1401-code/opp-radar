import { XMLParser } from "fast-xml-parser";
import { asArray, cleanTitle, stripHtml, textOf, toIso, truncate } from "./text";

export interface FeedEntry {
  title: string;
  link: string;
  published_at?: string;
  snippet?: string;
  guid?: string;
  source?: { name: string; url?: string };
  categories: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

type Node = Record<string, unknown>;

function linkOf(entry: Node): string {
  const link = entry.link;
  if (typeof link === "string") return link.trim();
  for (const l of asArray(link as Node | Node[])) {
    if (typeof l === "string") return l;
    const rel = l["@_rel"];
    if (!rel || rel === "alternate") return String(l["@_href"] ?? textOf(l)).trim();
  }
  const guid = entry.guid as Node | string | undefined;
  const g = textOf(guid);
  return g.startsWith("http") ? g : "";
}

/** Parse RSS 2.0 or Atom into flat entries. Snippets are truncated hard: we never keep article bodies. */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml) as Node;
  const rss = doc.rss as Node | undefined;
  const channel = (rss?.channel ?? (doc["rdf:RDF"] as Node | undefined)) as Node | undefined;
  const rawItems: Node[] = channel
    ? asArray((channel.item ?? (doc["rdf:RDF"] as Node | undefined)?.item) as Node | Node[])
    : asArray((doc.feed as Node | undefined)?.entry as Node | Node[]);

  return rawItems
    .map((it): FeedEntry => {
      const desc = textOf(it.description ?? it.summary ?? it["content:encoded"] ?? it.content);
      const src = it.source as Node | string | undefined;
      const categories = asArray(it.category as unknown).map((c) =>
        typeof c === "object" && c ? String((c as Node)["@_term"] ?? textOf(c)) : String(c),
      );
      return {
        title: cleanTitle(textOf(it.title)),
        link: linkOf(it),
        published_at: toIso(it.pubDate ?? it.published ?? it.updated ?? it["dc:date"]),
        snippet: desc ? truncate(stripHtml(desc), 280) : undefined,
        guid: textOf(it.guid ?? it.id) || undefined,
        source: src
          ? {
              name: cleanTitle(textOf(src)),
              url: typeof src === "object" ? (src["@_url"] as string | undefined) : undefined,
            }
          : undefined,
        categories,
      };
    })
    .filter((e) => e.title && e.link);
}
