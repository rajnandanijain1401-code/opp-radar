import { describe, expect, it } from "vitest";
import { assignClusters, companyKey, pruneClusters } from "../../src/dedupe/cluster";

const mk = (
  company: string,
  event: "funding" | "acquisition" | "other",
  at: string,
  url: string,
) => ({
  company_name: company,
  event_type: event,
  published_at: at,
  canonical_url: url,
  source_name: new URL(url).hostname,
  title: `${company} ${event}`,
});

describe("clustering", () => {
  it("normalizes company names", () => {
    expect(companyKey("Zeta Pay Pvt. Ltd.")).toBe("zeta-pay");
    expect(companyKey("Vaultline, Inc.")).toBe(companyKey("vaultline"));
  });

  it("groups same company + event within 72h and keeps the earliest as primary", () => {
    const { items, clusters } = assignClusters([
      mk("Orbit Health", "acquisition", "2026-11-16T07:00:00Z", "https://inc42.com/orbit"),
      mk(
        "Orbit Health Pvt Ltd",
        "acquisition",
        "2026-11-16T08:00:00Z",
        "https://moneycontrol.com/orbit",
      ),
      mk("Orbit Health", "funding", "2026-11-16T08:00:00Z", "https://x.com/orbit-funding"),
      mk("Orbit Health", "acquisition", "2026-11-25T08:00:00Z", "https://x.com/orbit-later"),
    ]);
    const acq = items.filter((i) => i.event_type === "acquisition");
    expect(acq[0]!.cluster_id).toBe(acq[1]!.cluster_id);
    expect(acq[0]!.is_primary).toBe(true);
    expect(acq[1]!.is_primary).toBe(false);
    expect(acq[2]!.cluster_id).not.toBe(acq[0]!.cluster_id); // outside 72h
    expect(items.find((i) => i.event_type === "funding")!.cluster_id).not.toBe(acq[0]!.cluster_id);
    expect(clusters.find((c) => c.cluster_id === acq[0]!.cluster_id)!.sources).toEqual([
      { source_name: "moneycontrol.com", url: "https://moneycontrol.com/orbit" },
    ]);
  });

  it("joins an existing cluster from a previous run", () => {
    const first = assignClusters([
      mk("Acme", "funding", "2026-11-15T07:00:00Z", "https://a.com/1"),
    ]);
    const second = assignClusters(
      [mk("ACME Inc", "funding", "2026-11-16T07:00:00Z", "https://b.com/2")],
      first.clusters,
    );
    expect(second.items[0]!.cluster_id).toBe(first.items[0]!.cluster_id);
    expect(second.items[0]!.is_primary).toBe(false);
  });

  it("never clusters 'other' events together", () => {
    const { items } = assignClusters([
      mk("Acme", "other", "2026-11-16T07:00:00Z", "https://a.com/1"),
      mk("Acme", "other", "2026-11-16T08:00:00Z", "https://a.com/2"),
    ]);
    expect(items[0]!.cluster_id).not.toBe(items[1]!.cluster_id);
  });

  it("prunes old clusters", () => {
    const { clusters } = assignClusters([
      mk("Acme", "funding", "2026-10-01T07:00:00Z", "https://a.com/1"),
    ]);
    expect(pruneClusters(clusters, new Date("2026-11-16T00:00:00Z"))).toHaveLength(0);
  });
});
