import { describe, expect, it } from "vitest";
import { dedupe, jaccard, shingles } from "../../src/dedupe/dedupe";
import { normalizeItem, titleKey } from "../../src/normalize/normalize";
import type { RawItem } from "../../src/schemas";

const fetchedAt = new Date("2026-11-16T12:00:00Z");
const quality = { inc42: 80, entrackr: 80, et: 75, gn: 60, hn: 65, tc: 85 };
const norm = (r: Partial<RawItem> & Pick<RawItem, "title" | "url" | "source_id">) =>
  normalizeItem({ source_name: r.source_id, ...r } as RawItem, {
    fetchedAt,
    qualityBySource: quality,
  });

describe("normalizeItem", () => {
  it("produces a stable content hash from the canonical URL", () => {
    const a = norm({ source_id: "et", title: "A", url: "https://x.com/a?utm_source=1" });
    const b = norm({ source_id: "gn", title: "A", url: "https://www.x.com/a/" });
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.content_hash).toHaveLength(24);
  });
  it("clamps future publish dates to fetch time", () => {
    const a = norm({
      source_id: "et",
      title: "A",
      url: "https://x.com/a",
      published_at: "2030-01-01T00:00:00Z",
    });
    expect(a.published_at).toBe(fetchedAt.toISOString());
  });
  it("normalizes money and verbs in title keys", () => {
    expect(titleKey("Zeta Pay Raises $20 Mn")).toBe(titleKey("Zeta Pay raised $20 million"));
  });
});

describe("dedupe", () => {
  it("collapses the same event reported by 3 outlets (UTM, Google News redirect, plain link)", () => {
    const items = [
      norm({
        source_id: "et",
        title: "Zeta Pay raises $20 million in Series B round to expand lending stack",
        url: "https://economictimes.indiatimes.com/tech/funding/zeta-pay-raises-20-million-series-b/articleshow/1100001.cms?utm_source=rss&utm_medium=feed&from=mdr",
        published_at: "2026-11-16T11:00:00Z",
      }),
      norm({
        source_id: "gn",
        source_name: "The Economic Times via Google News",
        title: "Zeta Pay raises $20 million in Series B round to expand lending stack",
        url: "https://news.google.com/rss/articles/CBMibWh0dHBzOi8vZWNvbm9taWN0aW1lcy5pbmRpYXRpbWVzLmNvbS90ZWNoL2Z1bmRpbmcvemV0YS1wYXktcmFpc2VzLTIwLW1pbGxpb24tc2VyaWVzLWIvYXJ0aWNsZXNob3cvMTEwMDAwMS5jbXPSAQA?oc=5",
        published_at: "2026-11-16T11:05:00Z",
      }),
      norm({
        source_id: "inc42",
        title: "Zeta Pay Raises $20 Mn In Series B Round To Expand Lending Stack, Hire Engineers",
        url: "https://inc42.com/buzz/zeta-pay-raises-20-mn/",
        published_at: "2026-11-16T09:00:00Z",
      }),
    ];
    const { items: out, stats } = dedupe(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.source_id).toBe("inc42"); // earliest report wins
    expect(out[0]!.other_sources.map((o) => o.url)).toEqual([
      "https://economictimes.indiatimes.com/tech/funding/zeta-pay-raises-20-million-series-b/articleshow/1100001.cms",
    ]);
    expect(stats).toMatchObject({ input: 3, exact_dupes: 1, near_dupes: 1, output: 1 });
  });

  it("keeps genuinely different stories about the same company", () => {
    const { items } = dedupe([
      norm({
        source_id: "et",
        title: "Zeta Pay raises $20 million Series B",
        url: "https://a.com/1",
      }),
      norm({
        source_id: "et",
        title: "Zeta Pay appoints new CFO ahead of IPO plans",
        url: "https://a.com/2",
      }),
    ]);
    expect(items).toHaveLength(2);
  });

  it("drops items already seen in state", () => {
    const a = norm({ source_id: "et", title: "Acme raises $5M seed", url: "https://a.com/acme" });
    const { items, stats } = dedupe([a], {
      hashes: new Set([a.content_hash]),
      titleKeys: new Set(),
    });
    expect(items).toHaveLength(0);
    expect(stats.already_seen).toBe(1);
  });

  it("jaccard is symmetric and bounded", () => {
    const a = shingles("Acme raises $5M seed round");
    const b = shingles("Acme raises $5M in seed round");
    expect(jaccard(a, b)).toBe(jaccard(b, a));
    expect(jaccard(a, b)).toBeGreaterThanOrEqual(0.8);
    expect(jaccard(a, shingles("Totally different headline here"))).toBeLessThan(0.2);
  });
});
