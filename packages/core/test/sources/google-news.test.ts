import { describe, expect, it } from "vitest";
import {
  buildGoogleNewsQueries,
  createGoogleNewsAdapter,
  googleNewsUrl,
  splitPublisher,
} from "../../src/sources/google-news";
import { DAY_AGO, fixtureCtx } from "../helpers";

describe("google news adapter", () => {
  it("builds IN and US edition URLs", () => {
    expect(googleNewsUrl('"raises" "Series A"', "IN")).toBe(
      "https://news.google.com/rss/search?q=%22raises%22%20%22Series%20A%22%20when%3A2d&hl=en-IN&gl=IN&ceid=IN:en",
    );
    expect(googleNewsUrl("x", "US", "")).toContain("hl=en-US&gl=US&ceid=US:en");
  });

  it("dedupes templates and adds watchlist queries", () => {
    const q = buildGoogleNewsQueries(
      ['"acquires" startup', '"acquires" startup'],
      ["Zeta Pay", "zeta pay ", "Acme"],
    );
    expect(q[0]).toBe('"acquires" startup');
    expect(q).toContain('"Acme" raises');
    expect(q).toContain('"Zeta Pay" raises');
    expect(q.filter((x) => x.includes("Zeta"))).toHaveLength(2); // deduped case-insensitively
  });

  it("splits the publisher suffix off titles", () => {
    expect(splitPublisher("Acme raises $5M - TechCrunch", "TechCrunch")).toEqual({
      title: "Acme raises $5M",
      publisher: "TechCrunch",
    });
    expect(splitPublisher("Acme raises $5M - Some Paper")).toEqual({
      title: "Acme raises $5M",
      publisher: "Some Paper",
    });
  });

  it("parses the recorded feed with publisher attribution", async () => {
    const adapter = createGoogleNewsAdapter(
      {
        id: "google-news",
        kind: "google_news",
        name: "Google News",
        queries: ["x"],
        editions: ["IN"],
        include_watchlist: false,
        window: "2d",
        quality: 60,
        enabled: true,
      },
      fixtureCtx(),
    );
    const items = await adapter.fetch(DAY_AGO);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      title: "Zeta Pay raises $20 million in Series B round to expand lending stack",
      publisher: "The Economic Times",
      source_name: "The Economic Times via Google News",
    });
    expect(items[0]!.url).toContain("news.google.com/rss/articles/");
  });
});
