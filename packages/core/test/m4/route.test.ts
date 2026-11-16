import { describe, expect, it } from "vitest";
import {
  FREE_LIMITS,
  isDigestDue,
  localParts,
  routeSignals,
  selectDigest,
  shouldFlushInstant,
} from "../../src/route/route";
import { NOW, mkSignal, profile } from "./fixtures";

const many = () => [
  mkSignal({ id: "a", cluster_id: "c-a", hiring_likelihood: 95 }),
  mkSignal({ id: "b", cluster_id: "c-b", hiring_likelihood: 92 }),
  mkSignal({ id: "c", cluster_id: "c-c", hiring_likelihood: 90 }),
  mkSignal({
    id: "d",
    cluster_id: "c-d",
    hiring_likelihood: 60,
    sectors: ["gaming"],
    geographies: ["Germany"],
    roles_likely: ["design"],
  }),
  mkSignal({
    id: "e",
    cluster_id: "c-e",
    hiring_likelihood: 5,
    sectors: [],
    geographies: [],
    roles_likely: [],
    source_quality: 10,
    published_at: "2026-11-10T00:00:00Z",
  }),
];

describe("routing", () => {
  it("routes by threshold: instant, digest, dropped", () => {
    const r = routeSignals({
      signals: many(),
      profile: profile(),
      now: NOW,
      sentClusterIds: new Set(),
      instantSentToday: 0,
    });
    expect(r.instant.map((x) => x.signal.id)).toEqual(["a", "b", "c"]);
    expect(r.digest.map((x) => x.signal.id)).toEqual(["d"]);
    expect(r.dropped.map((x) => x.signal.id)).toEqual(["e"]);
  });

  it("respects the daily instant cap and overflows to the digest", () => {
    const r = routeSignals({
      signals: many(),
      profile: profile({ max_instant_per_day: 5 }),
      now: NOW,
      sentClusterIds: new Set(),
      instantSentToday: 4,
    });
    expect(r.instant).toHaveLength(1);
    expect(r.digest.map((x) => x.signal.id)).toEqual(["b", "c", "d"]);
  });

  it("never sends the same cluster twice and picks the best item per cluster", () => {
    const r = routeSignals({
      signals: [
        mkSignal({ id: "x1", cluster_id: "same", hiring_likelihood: 60 }),
        mkSignal({ id: "x2", cluster_id: "same", hiring_likelihood: 90 }),
        mkSignal({ id: "y", cluster_id: "sent" }),
      ],
      profile: profile(),
      now: NOW,
      sentClusterIds: new Set(["sent"]),
      instantSentToday: 0,
    });
    const all = [...r.instant, ...r.digest, ...r.dropped].map((x) => x.signal.id);
    expect(all).toEqual(["x2"]);
  });

  it("free plan gets no instant alerts", () => {
    const r = routeSignals({
      signals: many(),
      profile: profile(),
      now: NOW,
      sentClusterIds: new Set(),
      instantSentToday: 0,
      limits: FREE_LIMITS,
    });
    expect(r.instant).toHaveLength(0);
    expect(r.digest.length).toBe(4);
  });

  it("disabling instant alerts sends everything to the digest", () => {
    const r = routeSignals({
      signals: many(),
      profile: profile({ instant_alerts_enabled: false }),
      now: NOW,
      sentClusterIds: new Set(),
      instantSentToday: 0,
    });
    expect(r.instant).toHaveLength(0);
  });
});

describe("batching windows and digest timing", () => {
  it("flushes instant alerts at most once per 15 minutes", () => {
    expect(shouldFlushInstant(null, NOW)).toBe(true);
    expect(shouldFlushInstant(new Date(NOW.getTime() - 10 * 60_000).toISOString(), NOW)).toBe(
      false,
    );
    expect(shouldFlushInstant(new Date(NOW.getTime() - 15 * 60_000).toISOString(), NOW)).toBe(true);
  });

  it("computes local time parts", () => {
    expect(localParts(new Date("2026-11-16T02:30:00Z"), "Asia/Kolkata")).toEqual({
      date: "2026-11-16",
      hour: 8,
      weekday: 1,
    });
  });

  it("digest is due at the local hour once per day", () => {
    const p = profile({ digest_hour_local: 8, timezone: "Asia/Kolkata" });
    const at8 = new Date("2026-11-16T02:35:00Z"); // 08:05 IST, Monday
    expect(isDigestDue(p, null, at8)).toBe(true);
    expect(isDigestDue(p, "2026-11-16T02:31:00Z", at8)).toBe(false);
    expect(isDigestDue(p, "2026-11-15T02:31:00Z", at8)).toBe(true);
    expect(isDigestDue(p, null, new Date("2026-11-16T05:00:00Z"))).toBe(false);
    expect(isDigestDue(profile({ digest_frequency: "off" }), null, at8)).toBe(false);
  });

  it("weekly digest goes out on Monday only", () => {
    const p = profile({
      digest_hour_local: 8,
      timezone: "Asia/Kolkata",
      digest_frequency: "weekly",
    });
    expect(isDigestDue(p, null, new Date("2026-11-16T02:35:00Z"))).toBe(true);
    expect(isDigestDue(p, null, new Date("2026-11-17T02:35:00Z"))).toBe(false);
  });

  it("selectDigest picks a top pick and groups the rest by type", () => {
    const r = routeSignals({
      signals: many(),
      profile: profile({ instant_alerts_enabled: false }),
      now: NOW,
      sentClusterIds: new Set(),
      instantSentToday: 0,
    });
    const d = selectDigest(r.digest, 15);
    expect(d.top!.signal.id).toBe("a");
    expect(d.groups[0]![0]).toBe("funding");
  });
});
