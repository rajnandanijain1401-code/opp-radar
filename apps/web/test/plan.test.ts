import { describe, expect, it } from "vitest";
import { FEATURES } from "../lib/features";

describe("plan gating", () => {
  it("free: weekly digest, 1 profile, top 10, no instant, no openers or open roles", () => {
    expect(FEATURES.free).toMatchObject({
      instant: false,
      digest_max_items: 10,
      maxProfiles: 1,
      openers: false,
      openRoles: false,
    });
    expect(FEATURES.free.digestFrequencies).not.toContain("daily");
  });
  it("pro: daily + instant, 3 profiles, 25 watchlist companies, openers, open roles", () => {
    expect(FEATURES.pro).toMatchObject({
      instant: true,
      digest_max_items: 15,
      maxProfiles: 3,
      maxWatchlist: 25,
      openers: true,
      openRoles: true,
    });
  });
});
