#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import {
  buildDigestView,
  buildInstantView,
  buildUserLinks,
  emptyState,
  loadState,
  pruneState,
  routeSignals,
  selectDigest,
  VERSION,
} from "@opp-radar/core";
import { renderDigest, renderInstant, unsubscribeHeaders } from "@opp-radar/emails";
import { createContext, mailboxOf } from "./context";
import { checkSources } from "./sources-check";
import { classifyAndBuild, collectCandidates, runOss, sendFromInput } from "./oss";

const program = new Command();
program
  .name("radar")
  .description("OppRadar: funding, acquisitions and hiring signals, scored and emailed to you.")
  .version(VERSION)
  .option("-c, --config <path>", "config file", "radar.config.yaml")
  .option("--fixtures", "use recorded fixtures instead of the network (also RADAR_FIXTURES=1)");

const ctxFor = () => {
  const o = program.opts<{ config: string; fixtures?: boolean }>();
  return createContext({ config: o.config, fixtures: o.fixtures });
};

function print(json: unknown) {
  process.stdout.write(JSON.stringify(json, null, 2) + "\n");
}

program
  .command("run")
  .description(
    "fetch, dedupe against state, classify, score, send instant alerts and the digest when due, save state",
  )
  .option("--force-digest", "send the digest now regardless of the hour")
  .option("--dry-run", "do everything except sending email and saving state")
  .action(async (o: { forceDigest?: boolean; dryRun?: boolean }) => {
    const ctx = ctxFor();
    const r = await runOss(ctx, { forceDigest: o.forceDigest, dryRun: o.dryRun });
    const c = r.counts;
    process.stderr.write(
      `\nOppRadar run (${r.mode}): fetched ${c.fetched}, deduped ${c.deduped}, prefiltered ${c.prefiltered}, classified ${c.classified}, enriched ${c.enriched}, matched ${c.matched}, sent ${c.sent}\n` +
        `instant items: ${r.instant_sent}, digest sent: ${r.digest_sent ? "yes" : "no"}, emails: ${r.emails.length}. Report: ${join(ctx.outDir, "run-report.json")}\n`,
    );
  });

program
  .command("fetch")
  .description("fetch new, deduped, pre-filtered candidate items")
  .option("--json", "print JSON to stdout")
  .option("--since-state", "dedupe against data/state.json and fetch since the last run")
  .option("--since <iso>", "fetch items published after this date")
  .option("--out <file>", "also write JSON here", "out/candidates.json")
  .action(async (o: { json?: boolean; sinceState?: boolean; since?: string; out: string }) => {
    const ctx = ctxFor();
    const state = o.sinceState ? pruneState(loadState(ctx.statePath), ctx.now) : emptyState();
    const since = o.since
      ? new Date(o.since)
      : o.sinceState
        ? undefined
        : new Date(ctx.now.getTime() - ctx.cfg.first_run_lookback_hours * 3_600_000);
    const res = await collectCandidates(ctx, state, { since });
    const out = res.candidates.map((c) => ({
      content_hash: c.content_hash,
      canonical_url: c.canonical_url,
      source_id: c.source_id,
      source_name: c.source_name,
      source_quality: c.source_quality,
      title: c.title,
      published_at: c.published_at,
      fetched_at: c.fetched_at,
      snippet: c.snippet,
      other_sources: c.other_sources,
      hints: c.extra,
    }));
    mkdirSync(join(o.out, ".."), { recursive: true });
    writeFileSync(o.out, JSON.stringify(out, null, 2) + "\n");
    if (o.json) print(out);
    else
      process.stderr.write(
        `${out.length} candidates (fetched ${res.counts.fetched}, unique ${res.counts.deduped}) written to ${o.out}\n`,
      );
  });

program
  .command("classify")
  .description("classify candidate items from a file (rules or LLM) into Signal JSON")
  .requiredOption("--input <file>", "candidates JSON (from radar fetch)")
  .option("--json", "print JSON to stdout")
  .option("--out <file>", "write JSON here", "out/classified.json")
  .action(async (o: { input: string; json?: boolean; out: string }) => {
    const ctx = ctxFor();
    const items = JSON.parse(readFileSync(o.input, "utf8")) as Record<string, unknown>[];
    const candidates = items.map((c) => ({
      ...c,
      extra: c.hints ?? c.extra,
      other_sources: c.other_sources ?? [],
    })) as never[];
    const { signals } = await classifyAndBuild(ctx, emptyState(), candidates);
    writeFileSync(o.out, JSON.stringify(signals, null, 2) + "\n");
    if (o.json) print(signals);
    else process.stderr.write(`${signals.length} signals written to ${o.out}\n`);
  });

program
  .command("send")
  .description(
    "validate classified signals (e.g. from Claude mode), score, route, email and update state",
  )
  .requiredOption("--input <file>", "Signal JSON array")
  .option("--force-digest", "send the digest now regardless of the hour")
  .option("--dry-run", "validate and route without sending or saving state")
  .action(async (o: { input: string; forceDigest?: boolean; dryRun?: boolean }) => {
    const ctx = ctxFor();
    const raw = JSON.parse(readFileSync(o.input, "utf8")) as unknown;
    const arr = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] }).items ?? []);
    const r = await sendFromInput(ctx, arr, { forceDigest: o.forceDigest, dryRun: o.dryRun });
    process.stderr.write(
      `OppRadar send: ${r.counts.classified} valid signals, matched ${r.counts.matched}, sent ${r.counts.sent}, emails ${r.emails.length}\n`,
    );
  });

program
  .command("preview")
  .description(
    "render the digest and an instant alert to out/preview.html (no email, no state changes)",
  )
  .option("--live", "use live sources instead of fixtures")
  .action(async (o: { live?: boolean }) => {
    const base = program.opts<{ config: string }>();
    const ctx = createContext({ config: base.config, fixtures: !o.live });
    const state = emptyState();
    const fetched = await collectCandidates(ctx, state);
    const { signals } = await classifyAndBuild(ctx, state, fetched.candidates);
    const p = ctx.cfg.profile;
    const routed = routeSignals({
      signals,
      profile: { ...p, instant_alerts_enabled: false },
      now: ctx.now,
      sentClusterIds: new Set(),
      instantSentToday: 0,
      scoring: ctx.cfg.scoringConfig,
    });
    const links = buildUserLinks(ctx.cfg.recipients[0]!, {
      publicUrl: ctx.cfg.publicUrl,
      secret: ctx.cfg.linkSecret,
      mailbox: mailboxOf(ctx.cfg.fromEmail),
    });
    const common = {
      links,
      pro: ctx.cfg.pro,
      physicalAddress: ctx.cfg.physicalAddress,
      appUrl: ctx.cfg.publicUrl ?? "https://github.com/rajnandanijain1401-code/opp-radar",
    };
    const digest = await renderDigest(
      buildDigestView(selectDigest(routed.digest, ctx.cfg.digest_max_items), {
        ...common,
        kind: p.digest_frequency === "weekly" ? "weekly" : "daily",
        now: ctx.now,
        timezone: p.timezone,
      }),
    );
    const top = routed.digest.slice(0, 3);
    const instant = await renderInstant(buildInstantView(top, common));
    mkdirSync(ctx.outDir, { recursive: true });
    writeFileSync(join(ctx.outDir, "preview.html"), digest.html);
    writeFileSync(join(ctx.outDir, "preview-instant.html"), instant.html);
    process.stderr.write(
      `Digest "${digest.subject}" -> ${join(ctx.outDir, "preview.html")}\nInstant "${instant.subject}" -> ${join(ctx.outDir, "preview-instant.html")}\n`,
    );
  });

program
  .command("test-email")
  .description("send a sample instant alert built from fixtures to check your email setup")
  .option("--to <email>", "recipient (defaults to the first recipient in the config)")
  .action(async (o: { to?: string }) => {
    const base = program.opts<{ config: string }>();
    const real = createContext({ config: base.config });
    const demo = createContext({ config: base.config, fixtures: true, provider: real.provider });
    const fetched = await collectCandidates(demo, emptyState());
    const { signals } = await classifyAndBuild(demo, emptyState(), fetched.candidates);
    const routed = routeSignals({
      signals,
      profile: { ...demo.cfg.profile, instant_alerts_enabled: false },
      now: demo.now,
      sentClusterIds: new Set(),
      instantSentToday: 0,
    });
    const to = o.to ?? real.cfg.recipients[0]!;
    const links = buildUserLinks(to, {
      publicUrl: real.cfg.publicUrl,
      secret: real.cfg.linkSecret,
      mailbox: mailboxOf(real.cfg.fromEmail),
    });
    const view = buildInstantView(routed.digest.slice(0, 2), {
      links,
      pro: true,
      physicalAddress: real.cfg.physicalAddress,
      appUrl: real.cfg.publicUrl ?? "https://github.com/rajnandanijain1401-code/opp-radar",
    });
    const r = await renderInstant(view);
    const res = await real.provider.send({
      to,
      from: real.cfg.fromEmail,
      subject: `[Test] ${r.subject}`,
      html: r.html,
      text: r.text,
      headers: unsubscribeHeaders(links.listUnsubscribe, links.oneClick),
    });
    process.stderr.write(`Test email sent to ${to} via ${res.provider} (${res.id})\n`);
  });

program
  .command("sources")
  .description("source utilities")
  .command("check")
  .description("fetch every source once and report status, item counts and robots.txt blocks")
  .option("--all", "include disabled sources")
  .option("--json", "print JSON")
  .action(async (o: { all?: boolean; json?: boolean }) => {
    const ctx = ctxFor();
    const rows = await checkSources(ctx, { all: o.all });
    if (o.json) return print(rows);
    const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
    process.stdout.write(
      `${pad("source", 22)}${pad("enabled", 9)}${pad("status", 10)}${pad("items", 7)}${pad("ms", 7)}note\n`,
    );
    for (const r of rows) {
      process.stdout.write(
        `${pad(r.id, 22)}${pad(r.enabled ? "yes" : "no", 9)}${pad(r.status, 10)}${pad(String(r.items), 7)}${pad(String(r.duration_ms), 7)}${r.note ?? ""}\n`,
      );
    }
  });

program.parseAsync().catch((err: unknown) => {
  process.stderr.write(`radar: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
