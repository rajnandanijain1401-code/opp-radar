import { createFixtureHttpClient } from "../src/http/fixtures";
import { silentLogger } from "../src/logger";
import type { SourceContext } from "../src/sources/types";

export const NOW = new Date("2026-11-16T12:00:00Z");
export const DAY_AGO = new Date(NOW.getTime() - 86_400_000);

export function fixtureCtx(overrides: Partial<SourceContext> = {}): SourceContext {
  return {
    http: createFixtureHttpClient({ now: () => NOW }),
    logger: silentLogger(),
    now: () => NOW,
    contactEmail: "test@example.com",
    watchlist: [],
    env: {},
    ...overrides,
  };
}
