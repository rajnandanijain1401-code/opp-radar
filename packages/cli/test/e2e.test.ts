import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { silentLogger, loadState } from "@opp-radar/core";
import { MemoryProvider } from "@opp-radar/emails";
import { createContext } from "../src/context";
import { runOss, sendFromInput } from "../src/oss";

const ROOT = resolve(__dirname, "..", "..", "..");
// 08:05 in Asia/Kolkata on a Monday: digest hour.
const NOW = new Date("2026-11-16T02:35:00Z");

function setup(over: string = "") {
  const dir = mkdtempSync(join(tmpdir(), "radar-e2e-"));
  const cfg = join(dir, "radar.config.yaml");
  writeFileSync(
    cfg,
    `mode: rules
recipients: [me@example.com]
from: "OppRadar <radar@example.com>"
state_file: ${join(dir, "state.json")}
sources:
  file: ${join(ROOT, "sources.yaml")}
profile:
  roles: [engineering, product]
  sectors: [fintech, ai, devtools]
  geographies: [India, United States]
  watchlist_companies: [Zeta Pay]
  exclude_keywords: [crypto]
  instant_threshold: 75
  max_instant_per_day: 5
  digest_frequency: daily
  digest_hour_local: 8
  timezone: Asia/Kolkata
${over}`,
  );
  return { dir, cfg };
}

function ctx(
  cfg: string,
  dir: string,
  provider: MemoryProvider,
  now = NOW,
  env: Record<string, string> = {},
) {
  return createContext({
    config: cfg,
    env: { RADAR_FIXTURES: "", ...env },
    fixtures: true,
    now,
    provider,
    logger: silentLogger(),
    outDir: dir,
  });
}

describe("OSS pipeline end to end (fixtures -> fake email provider)", () => {
  it("sends one batched instant alert and the digest, then saves state", async () => {
    const { dir, cfg } = setup();
    const mail = new MemoryProvider();
    const report = await runOss(ctx(cfg, dir, mail));

    expect(report.mode).toBe("rules");
    expect(report.counts.fetched).toBeGreaterThan(25);
    expect(report.counts.deduped).toBeLessThan(report.counts.fetched);
    expect(report.counts.prefiltered).toBeLessThan(report.counts.deduped);
    expect(report.counts.enriched).toBeGreaterThan(0);
    expect(report.sources.every((s) => !s.error)).toBe(true);

    const [instant, digest] = mail.sent;
    expect(mail.sent).toHaveLength(2);
    expect(instant!.subject).toMatch(/^5 new opportunities: /);
    expect(instant!.headers!["List-Unsubscribe"]).toContain("mailto:radar@example.com");
    expect(instant!.html).toContain("Zeta Pay");
    expect(digest!.subject).toMatch(/^Your daily radar: \d+ signals, top pick /);
    expect(digest!.text).toContain("Top pick of the day");
    for (const m of mail.sent) expect(m.html + m.text).not.toMatch(/\u2014/);

    // Never full article text in emails: snippets from fixtures must not leak.
    expect(digest!.text).not.toContain("according to regulatory filings accessed by Entrackr");

    const state = loadState(join(dir, "state.fixtures.json"));
    expect(Object.keys(state.seen).length).toBe(report.counts.deduped);
    expect(state.instant.count).toBe(5);
    expect(state.last_digest_sent_at).toBe(NOW.toISOString());
    expect(Object.keys(state.sent_clusters).length).toBe(report.counts.sent);
    expect(existsSync(join(dir, "run-report.json"))).toBe(true);
  });

  it("a second run dedupes against state and sends nothing new", async () => {
    const { dir, cfg } = setup();
    const mail = new MemoryProvider();
    await runOss(ctx(cfg, dir, mail));
    const later = new Date(NOW.getTime() + 30 * 60_000);
    const mail2 = new MemoryProvider();
    const r2 = await runOss(ctx(cfg, dir, mail2, later));
    expect(r2.counts.deduped).toBe(0);
    expect(mail2.sent).toHaveLength(0);
  });

  it("respects the daily instant cap and the 15-minute batching window", async () => {
    const { dir, cfg } = setup();
    const c = ctx(cfg, dir, new MemoryProvider());
    // Pre-seed: 4 instant alerts already sent today, last one 5 minutes ago.
    writeFileSync(
      join(dir, "state.fixtures.json"),
      JSON.stringify({
        instant: {
          date: "2026-11-16",
          count: 4,
          last_sent_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
        },
        last_digest_sent_at: NOW.toISOString(),
      }),
    );
    const mail = new MemoryProvider();
    c.provider = mail;
    const r = await runOss(c);
    expect(r.instant_sent).toBe(0); // window not open yet
    const state = loadState(join(dir, "state.fixtures.json"));
    expect(state.instant_queue).toHaveLength(1); // cap leaves room for exactly one
    expect(mail.sent).toHaveLength(1); // forced demo digest only
  });

  it("send --input accepts Claude-classified signals, rejects invalid ones", async () => {
    const { dir, cfg } = setup();
    const mail = new MemoryProvider();
    const c = ctx(cfg, dir, mail);
    const good = {
      content_hash: "claude1",
      canonical_url: "https://example.com/acme-raises",
      source_id: "inc42",
      source_name: "Inc42",
      title: "Acme Robotics raises $25M Series B",
      published_at: NOW.toISOString(),
      company_name: "Acme Robotics",
      event_type: "funding",
      amount_usd: 25000000,
      round: "Series B",
      investors: [],
      geographies: ["India"],
      sectors: ["ai"],
      roles_likely: ["engineering"],
      hiring_likelihood: 88,
      hiring_reason: "Series B money funds engineering hiring.",
      summary: "Acme Robotics raised a $25M Series B to scale its warehouse robots.",
      suggested_action: "Reach out to the engineering lead this week.",
      outreach_opener: "Congrats on the Series B!",
      confidence: 0.9,
    };
    const r = await sendFromInput(c, [good, { title: "missing fields" }], { forceDigest: true });
    expect(r.mode).toBe("claude");
    expect(r.counts.classified).toBe(1);
    expect(mail.sent[0]!.subject).toBe("[Funding] Acme Robotics raised $25M Series B");
    const state = loadState(join(dir, "state.fixtures.json"));
    expect(state.seen.claude1).toBeDefined();
  });

  it("writes signals.json with only titles, links and our own summaries", async () => {
    const { dir, cfg } = setup();
    await runOss(ctx(cfg, dir, new MemoryProvider()));
    const signals = JSON.parse(readFileSync(join(dir, "signals.json"), "utf8")) as Record<
      string,
      unknown
    >[];
    expect(signals.length).toBeGreaterThan(10);
    for (const s of signals) {
      expect(s).not.toHaveProperty("snippet");
      expect(String(s.summary).split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
    }
  });
});
