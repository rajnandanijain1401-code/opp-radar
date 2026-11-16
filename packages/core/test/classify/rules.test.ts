import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyWithRules, detectEventType } from "../../src/classify/rules";
import {
  extractCompany,
  parseAmountUsd,
  parseInvestors,
  parseRound,
} from "../../src/classify/extract";
import { prefilter } from "../../src/classify/prefilter";
import { evaluateRules, type GoldenItem } from "../../src/classify/eval";
import { ClassificationSchema } from "../../src/schemas";

describe("extractors", () => {
  it("parses USD, INR crore and euro amounts", () => {
    expect(parseAmountUsd("raises $20 Mn in Series B")).toBe(20_000_000);
    expect(parseAmountUsd("nets Rs 84 crore")).toBe(10_000_000);
    expect(parseAmountUsd("raises €5.3M")).toBe(5_724_000);
    expect(parseAmountUsd("no money here")).toBeNull();
  });
  it("parses rounds and investors", () => {
    expect(parseRound("in its Series B round")).toBe("Series B");
    expect(parseRound("pre-seed round")).toBe("Pre-seed");
    expect(
      parseInvestors("Zeta Pay bags $20 Mn Series B from Northstar Ventures, Blue Peak"),
    ).toEqual(["Northstar Ventures", "Blue Peak"]);
    expect(parseInvestors("raises $20 Mn in Series B led by Northstar Ventures")).toEqual([
      "Northstar Ventures",
    ]);
  });
  it("extracts company names past descriptors", () => {
    expect(extractCompany("Fintech Startup Zeta Pay Raises $20 Mn")).toBe("Zeta Pay");
    expect(extractCompany("Bengaluru-based Kosha AI raises $3.5M seed")).toBe("Kosha AI");
    expect(extractCompany("Cloud services firm Indus Cloud files DRHP")).toBe("Indus Cloud");
    expect(extractCompany("Exclusive: Orbit Health acquires Lumen Labs")).toBe("Orbit Health");
    expect(extractCompany("Launch HN: Driftwood (YC F26) - Observability for AI agents")).toBe(
      "Driftwood",
    );
  });
});

describe("rules classifier", () => {
  it("never reports layoffs or roundups as hiring signals", () => {
    expect(detectEventType("Weekly funding report: startups raised $210 Mn").type).toBe("other");
    const c = classifyWithRules({
      content_hash: "x",
      title: "Learnly lays off 120 employees",
      source_id: "inc42",
    });
    expect(c.event_type).toBe("layoffs");
    expect(c.hiring_likelihood).toBeLessThan(20);
  });

  it("produces schema-valid, em-dash-free copy for every event type", () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, "..", "golden.json"), "utf8"),
    ) as GoldenItem[];
    for (const [i, g] of golden.entries()) {
      const c = classifyWithRules({ content_hash: String(i), title: g.title, source_id: "x" });
      expect(ClassificationSchema.safeParse(c).success, g.title).toBe(true);
      for (const s of [c.summary, c.hiring_reason, c.suggested_action, c.outreach_opener]) {
        expect(s).not.toMatch(/—/);
      }
      expect(c.summary.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
    }
  });

  it("uses structured extras from HN hiring and SEC sources", () => {
    const hn = classifyWithRules({
      content_hash: "h",
      title: "Helix Bio is hiring: ML Engineer, Data Scientist",
      source_id: "hn-hiring",
      extra: {
        company: "Helix Bio",
        roles: ["ML Engineer", "Data Scientist"],
        location: "Boston, MA",
      },
    });
    expect(hn).toMatchObject({ event_type: "hiring_announcement", company_name: "Helix Bio" });
    expect(hn.roles_likely).toEqual(expect.arrayContaining(["engineering", "data"]));
    expect(hn.geographies).toContain("United States");
    const sec = classifyWithRules({
      content_hash: "s",
      title: "Vaultline, Inc. files Form D for a private funding round",
      source_id: "sec-form-d",
      extra: { company: "Vaultline, Inc.", form: "D" },
    });
    expect(sec.event_type).toBe("funding");
  });

  it("reaches >= 70% event_type accuracy on the golden set", () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, "..", "golden.json"), "utf8"),
    ) as GoldenItem[];
    expect(golden).toHaveLength(30);
    expect(evaluateRules(golden).event_accuracy).toBeGreaterThanOrEqual(0.7);
  });
});

describe("prefilter", () => {
  it("passes plausible signals and drops market noise", () => {
    const items = [
      { title: "Zeta Pay raises $20 Mn" },
      { title: "Sensex ends 300 points higher as IT stocks gain" },
      { title: "Gold prices edge lower ahead of Fed commentary" },
      { title: "Driftwood is hiring: Founding Engineer", extra: { company: "Driftwood" } },
      { title: "Indus Cloud files DRHP" },
    ];
    const { passed, dropped } = prefilter(items);
    expect(passed.map((p) => p.title)).toEqual([
      "Zeta Pay raises $20 Mn",
      "Driftwood is hiring: Founding Engineer",
      "Indus Cloud files DRHP",
    ]);
    expect(dropped).toHaveLength(2);
  });
});
