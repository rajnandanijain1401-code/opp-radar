import { describe, expect, it } from "vitest";
import { createHnSearchAdapter } from "../../src/sources/hackernews";
import { DAY_AGO, fixtureCtx } from "../helpers";

describe("hn search adapter", () => {
  it("returns stories once even across multiple queries", async () => {
    const adapter = createHnSearchAdapter(
      {
        id: "hn",
        kind: "hn_search",
        name: "Hacker News",
        queries: ["Launch HN", "raises", "YC"],
        quality: 65,
        enabled: true,
      },
      fixtureCtx(),
    );
    const items = await adapter.fetch(DAY_AGO);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      title: "Launch HN: Driftwood (YC F26) - Observability for AI agents",
      url: "https://driftwood.dev",
    });
    const ask = items.find((i) => i.title.startsWith("Ask HN"));
    expect(ask!.url).toBe("https://news.ycombinator.com/item?id=50600003");
  });
});
