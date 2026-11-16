import { describe, expect, it } from "vitest";
import { createRssAdapter } from "../../src/sources/rss";
import { DAY_AGO, NOW, fixtureCtx } from "../helpers";
import { createFixtureHttpClient } from "../../src/http/fixtures";
import { SourceBlockedError } from "../../src/sources/types";

const def = {
  id: "inc42",
  kind: "rss" as const,
  name: "Inc42",
  url: "https://inc42.com/feed/",
  quality: 80,
  enabled: true,
};

describe("rss adapter", () => {
  it("parses a recorded feed into raw items", async () => {
    const items = await createRssAdapter(def, fixtureCtx()).fetch(DAY_AGO);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({
      source_id: "inc42",
      source_name: "Inc42",
      title: "Fintech Startup Zeta Pay Raises $20 Mn In Series B Led By Northstar Ventures",
    });
    expect(items[0]!.url).toContain("inc42.com/buzz/fintech-startup-zeta-pay");
    expect(Date.parse(items[0]!.published_at!)).toBe(NOW.getTime() - 3 * 3_600_000);
    expect(items[0]!.snippet!.length).toBeLessThanOrEqual(283);
  });

  it("filters items older than since", async () => {
    const since = new Date(NOW.getTime() - 4 * 3_600_000);
    const items = await createRssAdapter(def, fixtureCtx()).fetch(since);
    expect(items.map((i) => i.title)).toEqual([
      "Fintech Startup Zeta Pay Raises $20 Mn In Series B Led By Northstar Ventures",
    ]);
  });

  it("reports 403 as a blocked source", async () => {
    const http = createFixtureHttpClient({
      routes: [{ match: "example", status: 403, body: "no" }],
    });
    const adapter = createRssAdapter(
      { ...def, url: "https://example.com/feed" },
      fixtureCtx({ http }),
    );
    await expect(adapter.fetch(DAY_AGO)).rejects.toBeInstanceOf(SourceBlockedError);
  });

  it("parses every recorded news feed", async () => {
    const feeds = [
      "entrackr.com/rss",
      "yourstory.com/feed",
      "techcrunch.com/category/venture/feed/",
      "news.crunchbase.com/feed/",
      "economictimes.indiatimes.com/tech/startups/rssfeeds/78570550.cms",
      "www.moneycontrol.com/rss/business.xml",
    ];
    for (const f of feeds) {
      const items = await createRssAdapter(
        { ...def, id: "x", url: `https://${f}` },
        fixtureCtx(),
      ).fetch(DAY_AGO);
      expect(items.length, f).toBeGreaterThan(0);
    }
  });
});
