import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORING,
  isWatchlistHit,
  recencyScore,
  relevanceScore,
  scoreSignal,
} from "../../src/score/score";
import { NOW, mkSignal, profile } from "./fixtures";

describe("scoring", () => {
  it("applies the configured weights", () => {
    expect(DEFAULT_SCORING.weights).toEqual({
      hiring: 0.45,
      relevance: 0.35,
      recency: 0.1,
      source_quality: 0.1,
    });
    const s = mkSignal();
    const b = scoreSignal(s, profile(), NOW);
    const expected = 0.45 * 82 + 0.35 * b.relevance + 0.1 * b.recency + 0.1 * 80;
    expect(Math.abs(b.final - expected)).toBeLessThanOrEqual(1);
  });

  it("watchlist forces relevance to 100", () => {
    const r = relevanceScore(
      mkSignal({ sectors: ["gaming"], roles_likely: [] }),
      profile({ watchlist_companies: ["zeta pay"] }),
    );
    expect(r).toMatchObject({ relevance: 100, watchlist_hit: true });
    expect(isWatchlistHit("Zeta Pay Pvt Ltd", ["Zeta Pay"])).toBe(true);
    expect(isWatchlistHit("Zetamax", ["Zeta"])).toBe(false);
  });

  it("exclude keywords force relevance and final score to 0", () => {
    const b = scoreSignal(
      mkSignal(),
      profile({ exclude_keywords: ["series b"], include_keywords: [] }),
      NOW,
    );
    expect(b.final).toBe(0);
    const b2 = scoreSignal(
      mkSignal({ summary: "A crypto lending desk." }),
      profile({ exclude_keywords: ["crypto"] }),
      NOW,
    );
    expect(b2).toMatchObject({ final: 0, excluded: true, relevance: 0 });
  });

  it("matches roles, sectors and geos with human reasons", () => {
    const r = relevanceScore(mkSignal(), profile());
    expect(r.relevance).toBeGreaterThanOrEqual(80);
    expect(r.reasons).toEqual(["Likely hiring for engineering", "In fintech", "Based in India"]);
    const miss = relevanceScore(
      mkSignal(),
      profile({ roles: ["design"], sectors: ["gaming"], geographies: ["Germany"] }),
    );
    expect(miss.relevance).toBeLessThan(25);
  });

  it("penalizes event types the user did not ask for and small rounds", () => {
    const base = relevanceScore(mkSignal(), profile()).relevance;
    expect(
      relevanceScore(mkSignal(), profile({ event_types: ["acquisition"] })).relevance,
    ).toBeLessThan(base * 0.3);
    expect(relevanceScore(mkSignal(), profile({ min_amount_usd: 50_000_000 })).relevance).toBe(
      Math.round(base * 0.5),
    );
  });

  it("recency halves every 24h", () => {
    expect(recencyScore(NOW.toISOString(), NOW, 24)).toBe(100);
    expect(Math.round(recencyScore("2026-11-15T12:00:00Z", NOW, 24))).toBe(50);
  });
});
