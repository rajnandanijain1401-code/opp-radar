import { describe, expect, it } from "vitest";
import { createHnWhoIsHiringAdapter, parseHiringComment } from "../../src/sources/hn-who-is-hiring";
import { DAY_AGO, fixtureCtx } from "../helpers";

describe("hn who is hiring adapter", () => {
  it("parses the company | roles convention", () => {
    expect(
      parseHiringComment("Acme (YC W24) | Senior Engineer, Designer | NYC | ONSITE<p>hi</p>"),
    ).toEqual({
      company: "Acme",
      roles: ["Senior Engineer", "Designer"],
      location: "NYC",
    });
    expect(parseHiringComment("Is anyone else seeing fewer roles?")).toBeNull();
  });

  it("turns recent top-level comments into hiring candidates", async () => {
    const adapter = createHnWhoIsHiringAdapter(
      {
        id: "hn-hiring",
        kind: "hn_who_is_hiring",
        name: "HN Who is hiring",
        max_comments: 300,
        quality: 70,
        enabled: true,
      },
      fixtureCtx(),
    );
    const items = await adapter.fetch(DAY_AGO);
    expect(items.map((i) => i.title)).toEqual([
      "Zeta Pay is hiring: Senior Backend Engineer, Product Designer",
      "Driftwood is hiring: Founding Engineer",
      "Helix Bio is hiring: ML Engineer, Data Scientist",
    ]);
    expect(items[0]!.url).toBe("https://news.ycombinator.com/item?id=50500101");
    expect(items[0]!.extra).toMatchObject({ company: "Zeta Pay" });
  });
});
