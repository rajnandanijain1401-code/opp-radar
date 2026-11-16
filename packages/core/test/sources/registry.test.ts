import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildAdapters, loadSourcesFile, runSources } from "../../src/sources/registry";
import { DAY_AGO, fixtureCtx } from "../helpers";
import { silentLogger } from "../../src/logger";

const SOURCES_YAML = join(__dirname, "..", "..", "..", "..", "sources.yaml");

describe("sources.yaml + registry", () => {
  it("loads and validates the shipped sources.yaml", () => {
    const file = loadSourcesFile(SOURCES_YAML);
    expect(file.sources.length).toBeGreaterThanOrEqual(15);
    const disabled = file.sources.filter((s) => !s.enabled).map((s) => s.id);
    expect(disabled).toEqual(
      expect.arrayContaining([
        "vccircle",
        "business-standard",
        "reddit",
        "producthunt",
        "x",
        "apify",
      ]),
    );
    expect(
      disabled.every(
        (id) =>
          file.sources.find((s) => s.id === id)!.note || ["producthunt", "x", "apify"].includes(id),
      ),
    ).toBe(true);
  });

  it("runs all enabled sources in parallel and isolates failures", async () => {
    const file = loadSourcesFile(SOURCES_YAML);
    const adapters = buildAdapters(file, fixtureCtx());
    const results = await runSources(adapters, DAY_AGO, { logger: silentLogger() });
    const total = results.reduce((n, r) => n + r.items_fetched, 0);
    expect(total).toBeGreaterThan(25);
    expect(results.every((r) => !r.error)).toBe(true);
  });

  it("captures a failing source without throwing", async () => {
    const file = loadSourcesFile(SOURCES_YAML);
    const adapters = buildAdapters(file, fixtureCtx(), ["vccircle", "business-standard"]);
    const results = await runSources(adapters, DAY_AGO, { logger: silentLogger() });
    expect(results.find((r) => r.source_id === "vccircle")!.error).toContain("404");
    expect(results.find((r) => r.source_id === "business-standard")!.blocked).toBe(true);
  });
});
