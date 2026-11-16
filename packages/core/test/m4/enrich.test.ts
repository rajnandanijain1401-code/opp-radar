import { describe, expect, it } from "vitest";
import { createFixtureHttpClient } from "../../src/http/fixtures";
import {
  createMapEnrichCache,
  enrichSignals,
  findOpenRoles,
  guessSlugs,
} from "../../src/enrich/jobboards";
import type { HttpClient } from "../../src/http/client";

const NOW = new Date("2026-11-16T12:00:00Z");

describe("job board enrichment (mocked HTTP)", () => {
  it("guesses slugs from names and domains", () => {
    expect(guessSlugs("Zeta Pay Pvt Ltd")).toEqual(["zetapay", "zeta-pay", "zeta"]);
    expect(guessSlugs("Vaultline, Inc.", "https://www.vaultline.io")).toEqual(["vaultline"]);
  });

  it("finds Greenhouse, Lever and Ashby boards", async () => {
    const http = createFixtureHttpClient({ now: () => NOW });
    const gh = await findOpenRoles("Zeta Pay", null, { http });
    expect(gh).toMatchObject({
      board: "greenhouse",
      count: 12,
      url: "https://boards.greenhouse.io/zetapay",
    });
    expect(gh!.sample).toHaveLength(5);
    expect((await findOpenRoles("Vaultline", null, { http }))!.board).toBe("lever");
    expect((await findOpenRoles("Fieldstack", null, { http }))!).toMatchObject({
      board: "ashby",
      count: 7,
    });
  });

  it("is silent on failure and caches per company for 24h", async () => {
    let calls = 0;
    const http: HttpClient = {
      request: async () => {
        calls++;
        throw new Error("network down");
      },
      get: async () => {
        calls++;
        throw new Error("network down");
      },
    };
    const cache = createMapEnrichCache();
    expect(await findOpenRoles("Nobody Corp", null, { http, cache, now: () => NOW })).toBeNull();
    const first = calls;
    expect(await findOpenRoles("Nobody Corp", null, { http, cache, now: () => NOW })).toBeNull();
    expect(calls).toBe(first);
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    await findOpenRoles("Nobody Corp", null, { http, cache, now: () => later });
    expect(calls).toBeGreaterThan(first);
  });

  it("only enriches hiring_likelihood >= 50", async () => {
    const http = createFixtureHttpClient({ now: () => NOW });
    const { items, enriched } = await enrichSignals(
      [
        { company_name: "Zeta Pay", hiring_likelihood: 82 },
        { company_name: "Fieldstack", hiring_likelihood: 10 },
      ],
      { http },
    );
    expect(enriched).toBe(1);
    expect(items[0]!.open_roles_count).toBe(12);
    expect(items[1]!.open_roles_count).toBeUndefined();
  });
});
