import { describe, expect, it } from "vitest";
import { createProductHuntAdapter } from "../../src/sources/plugins/producthunt";
import { createXApiAdapter } from "../../src/sources/plugins/x-api";
import { createApifyAdapter } from "../../src/sources/plugins/apify";
import { DAY_AGO, fixtureCtx } from "../helpers";

const base = { quality: 50, enabled: true };

describe("optional plugin adapters", () => {
  it("skip silently without a token", async () => {
    const a = createProductHuntAdapter(
      { ...base, id: "producthunt", kind: "producthunt", name: "PH", token_env: "PH" },
      fixtureCtx(),
    );
    expect(await a.fetch(DAY_AGO)).toEqual([]);
  });

  it("product hunt maps launches", async () => {
    const a = createProductHuntAdapter(
      { ...base, id: "producthunt", kind: "producthunt", name: "Product Hunt", token_env: "PH" },
      fixtureCtx({ env: { PH: "t" } }),
    );
    const items = await a.fetch(DAY_AGO);
    expect(items[0]!.title).toBe(
      "Tessellate launches on Product Hunt: AI design tool for product teams",
    );
  });

  it("x api maps tweets to x.com links via the official API", async () => {
    const a = createXApiAdapter(
      { ...base, id: "x", kind: "x_api", name: "X", token_env: "X", queries: ["hiring"] },
      fixtureCtx({ env: { X: "t" } }),
    );
    const items = await a.fetch(DAY_AGO);
    expect(items[0]!.url).toBe("https://x.com/driftwood_dev/status/1900000000000000001");
    expect(items[0]!.title).not.toContain("t.co");
  });

  it("apify maps dataset items and drops invalid ones", async () => {
    const a = createApifyAdapter(
      {
        ...base,
        id: "apify",
        kind: "apify",
        name: "Apify",
        token_env: "A",
        actor: "me/actor",
        input: {},
        title_field: "title",
        url_field: "url",
        date_field: "date",
      },
      fixtureCtx({ env: { A: "t" } }),
    );
    const items = await a.fetch(DAY_AGO);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Brightloop Labs announces new Austin hub");
  });
});
