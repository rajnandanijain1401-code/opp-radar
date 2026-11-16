import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDigestView,
  buildInstantView,
  buildSignals,
  buildUserLinks,
  classifyCandidates,
  createMapEnrichCache,
  createMemoryCache,
  createTokenBudget,
  enrichSignals,
  fetchCandidates,
  FREE_LIMITS,
  isDigestDue,
  loadState,
  localParts,
  pruneState,
  PRO_LIMITS,
  regionBySource,
  routeSignals,
  saveState,
  selectDigest,
  shouldFlushInstant,
  SignalInputSchema,
  SignalSchema,
  shortHash,
  titleKey,
  type Candidate,
  type ClassifiedCandidate,
  type ClusterRecord,
  type RadarState,
  type ScoredSignal,
  type Signal,
  type SignalInput,
} from "@opp-radar/core";
import { renderDigest, renderInstant, unsubscribeHeaders } from "@opp-radar/emails";
import { mailboxOf, type CliContext } from "./context";

export interface StageCounts {
  fetched: number;
  deduped: number;
  prefiltered: number;
  classified: number;
  enriched: number;
  matched: number;
  sent: number;
}

export interface RunReport {
  started_at: string;
  mode: "llm" | "rules" | "claude";
  counts: StageCounts;
  instant_sent: number;
  digest_sent: boolean;
  llm: { calls: number; input_tokens: number; output_tokens: number; budget_exceeded: boolean };
  sources: { id: string; items: number; error?: string; blocked?: boolean; duration_ms: number }[];
  emails: { to: string; subject: string; kind: string }[];
}

const OVERLAP_MS = 2 * 3_600_000;

export function sinceFor(state: RadarState, now: Date, lookbackHours: number): Date {
  if (state.last_run_at) return new Date(Date.parse(state.last_run_at) - OVERLAP_MS);
  return new Date(now.getTime() - lookbackHours * 3_600_000);
}

function seenIndex(state: RadarState) {
  return {
    hashes: new Set(Object.keys(state.seen)),
    titleKeys: new Set(Object.keys(state.seen_titles)),
  };
}

function markSeen(
  state: RadarState,
  items: Pick<Candidate, "content_hash" | "title">[],
  now: Date,
) {
  const t = now.toISOString();
  for (const c of items) {
    state.seen[c.content_hash] = t;
    state.seen_titles[titleKey(c.title)] = t;
  }
}

/** Stage 1 (shared by `run` and `fetch --since-state`): new, deduped, pre-filtered candidates. */
export async function collectCandidates(
  ctx: CliContext,
  state: RadarState,
  opts: { since?: Date } = {},
) {
  const since = opts.since ?? sinceFor(state, ctx.now, ctx.cfg.first_run_lookback_hours);
  return fetchCandidates({
    sources: ctx.sources,
    http: ctx.http,
    logger: ctx.logger,
    now: ctx.now,
    since,
    seen: seenIndex(state),
    watchlist: ctx.cfg.profile.watchlist_companies,
    contactEmail: ctx.cfg.contactEmail,
    env: ctx.env,
  });
}

/** Stage 2: classify (LLM with budget, or rules), cluster against state, enrich. */
export async function classifyAndBuild(
  ctx: CliContext,
  state: RadarState,
  candidates: Candidate[],
) {
  const today = localParts(ctx.now, "UTC").date;
  const usedToday = state.llm_usage.date === today ? state.llm_usage.tokens : 0;
  const budget = createTokenBudget(ctx.cfg.dailyTokenBudget, usedToday);
  const cls = await classifyCandidates(candidates, {
    mode: ctx.cfg.effectiveMode,
    llm: ctx.llm,
    cache: createMemoryCache(),
    budget,
    logger: ctx.logger,
    rules: { regionBySource: regionBySource(ctx.sources) },
  });
  state.llm_usage = { date: today, tokens: budget.used() };
  return { ...(await buildAndEnrich(ctx, state, cls.items)), cls };
}

export async function buildAndEnrich(
  ctx: CliContext,
  state: RadarState,
  classified: ClassifiedCandidate[],
) {
  const built = buildSignals(classified, state.clusters as ClusterRecord[]);
  state.clusters = built.clusters;
  const cache = createMapEnrichCache(state.enrich_cache);
  const enriched = await enrichSignals(built.signals, {
    http: ctx.http,
    cache,
    now: () => ctx.now,
    logger: ctx.logger,
  });
  state.enrich_cache = cache.toJSON();
  return {
    signals: enriched.items.map((s) => SignalSchema.parse(s)),
    enrichedCount: enriched.enriched,
  };
}

function linksFor(ctx: CliContext, recipient: string) {
  return buildUserLinks(recipient, {
    publicUrl: ctx.cfg.publicUrl,
    secret: ctx.cfg.linkSecret,
    mailbox: mailboxOf(ctx.cfg.fromEmail),
  });
}

async function sendTo(
  ctx: CliContext,
  recipient: string,
  rendered: { subject: string; html: string; text: string },
  kind: string,
  report: RunReport,
) {
  const links = linksFor(ctx, recipient);
  await ctx.provider.send({
    to: recipient,
    from: ctx.cfg.fromEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: unsubscribeHeaders(links.listUnsubscribe, links.oneClick),
  });
  report.emails.push({ to: recipient, subject: rendered.subject, kind });
}

export interface DeliverOptions {
  forceDigest?: boolean;
  dryRun?: boolean;
}

/** Stage 3: score + route per profile, queue, flush instant alerts and the digest when due. */
export async function routeAndDeliver(
  ctx: CliContext,
  state: RadarState,
  signals: Signal[],
  report: RunReport,
  opts: DeliverOptions = {},
) {
  const p = ctx.cfg.profile;
  const limits = ctx.cfg.pro ? PRO_LIMITS : FREE_LIMITS;
  const local = localParts(ctx.now, p.timezone);
  if (state.instant.date !== local.date)
    state.instant = { ...state.instant, date: local.date, count: 0 };
  const sentClusterIds = new Set(Object.keys(state.sent_clusters));
  const queued = new Set([...state.instant_queue, ...state.digest_queue].map((s) => s.cluster_id));
  const fresh = signals.filter((s) => !queued.has(s.cluster_id));

  const routed = routeSignals({
    signals: fresh,
    profile: p,
    now: ctx.now,
    sentClusterIds,
    instantSentToday: state.instant.count + state.instant_queue.length,
    limits,
    scoring: ctx.cfg.scoringConfig,
  });
  report.counts.matched += routed.instant.length + routed.digest.length;
  state.instant_queue.push(...routed.instant.map((x) => x.signal));
  state.digest_queue.push(...routed.digest.map((x) => x.signal));

  // Instant: one batched email per recipient per 15-minute window.
  if (state.instant_queue.length && shouldFlushInstant(state.instant.last_sent_at, ctx.now)) {
    const rescored = routeSignals({
      signals: state.instant_queue,
      profile: { ...p, instant_threshold: 0, max_instant_per_day: 1000 },
      now: ctx.now,
      sentClusterIds,
      instantSentToday: 0,
      limits,
      scoring: ctx.cfg.scoringConfig,
    }).instant;
    if (rescored.length && !opts.dryRun) {
      for (const to of ctx.cfg.recipients) {
        const view = buildInstantView(rescored, {
          links: linksFor(ctx, to),
          pro: ctx.cfg.pro,
          physicalAddress: ctx.cfg.physicalAddress,
          appUrl: ctx.cfg.publicUrl ?? "https://github.com/rajnandanijain1401-code/opp-radar",
        });
        await sendTo(ctx, to, await renderInstant(view), "instant", report);
      }
      for (const s of rescored) state.sent_clusters[s.signal.cluster_id] = ctx.now.toISOString();
      state.instant = {
        ...state.instant,
        count: state.instant.count + rescored.length,
        last_sent_at: ctx.now.toISOString(),
      };
      report.instant_sent = rescored.length;
      report.counts.sent += rescored.length;
    }
    if (!opts.dryRun) state.instant_queue = [];
  }

  // Digest: at the chosen local hour, once per day (or Monday for weekly), or when forced.
  const due = opts.forceDigest || isDigestDue(p, state.last_digest_sent_at, ctx.now);
  if (due && !opts.dryRun) {
    const pending = state.digest_queue.filter((s) => !(s.cluster_id in state.sent_clusters));
    const again = routeSignals({
      signals: pending,
      profile: { ...p, instant_alerts_enabled: false },
      now: ctx.now,
      sentClusterIds: new Set(Object.keys(state.sent_clusters)),
      instantSentToday: 0,
      limits,
      scoring: ctx.cfg.scoringConfig,
    }).digest;
    const picked = selectDigest(again, Math.min(ctx.cfg.digest_max_items, limits.digest_max_items));
    if (picked.top) {
      const kind = p.digest_frequency === "weekly" ? "weekly" : "daily";
      for (const to of ctx.cfg.recipients) {
        const view = buildDigestView(picked, {
          links: linksFor(ctx, to),
          pro: ctx.cfg.pro,
          physicalAddress: ctx.cfg.physicalAddress,
          appUrl: ctx.cfg.publicUrl ?? "https://github.com/rajnandanijain1401-code/opp-radar",
          kind,
          now: ctx.now,
          timezone: p.timezone,
        });
        await sendTo(ctx, to, await renderDigest(view), kind, report);
      }
      const all: ScoredSignal[] = [picked.top, ...picked.groups.flatMap(([, g]) => g)];
      for (const s of all) state.sent_clusters[s.signal.cluster_id] = ctx.now.toISOString();
      report.counts.sent += all.length;
      report.digest_sent = true;
      state.last_digest_sent_at = ctx.now.toISOString();
      state.digest_queue = [];
    } else {
      ctx.logger.info("digest due but nothing matched; skipping a quiet-day email");
    }
  }
}

/** Source health: a source with 0 items for 24h is unhealthy; the owner gets one email per episode. */
async function checkSourceHealth(
  ctx: CliContext,
  state: RadarState,
  report: RunReport,
  dryRun?: boolean,
) {
  const now = ctx.now.toISOString();
  const unhealthy: string[] = [];
  for (const r of report.sources) {
    const h = state.source_health[r.id] ?? {
      last_items_at: now,
      last_error: null,
      unhealthy_notified_at: null,
    };
    if (r.items > 0) {
      h.last_items_at = now;
      h.unhealthy_notified_at = null;
    }
    h.last_error = r.error ?? null;
    const quietMs = ctx.now.getTime() - Date.parse(h.last_items_at ?? now);
    if (quietMs >= 24 * 3_600_000 && !h.unhealthy_notified_at) {
      unhealthy.push(`${r.id}${r.error ? ` (${r.error})` : ""}`);
      h.unhealthy_notified_at = now;
    }
    state.source_health[r.id] = h;
  }
  if (unhealthy.length && !dryRun) {
    const owner = ctx.cfg.recipients[0]!;
    const text = `These OppRadar sources returned no items for 24 hours:\n\n- ${unhealthy.join("\n- ")}\n\nRun \`pnpm radar sources check\` to see details. You will not get this email again until the source recovers and fails again.`;
    await ctx.provider.send({
      to: owner,
      from: ctx.cfg.fromEmail,
      subject: `[OppRadar] ${unhealthy.length} source(s) unhealthy`,
      text,
      html: `<pre style="font-family:monospace">${text.replace(/</g, "&lt;")}</pre>`,
    });
    report.emails.push({ to: owner, subject: "source health", kind: "admin" });
  }
}

async function notifyBudget(ctx: CliContext, report: RunReport, dryRun?: boolean) {
  if (!report.llm.budget_exceeded || dryRun) return;
  const owner = ctx.cfg.recipients[0]!;
  const text = `OppRadar hit its daily LLM token budget (${ctx.cfg.dailyTokenBudget} tokens) and switched to the free rules classifier for the rest of the day. Raise LLM_DAILY_TOKEN_BUDGET if you want more LLM classifications.`;
  await ctx.provider.send({
    to: owner,
    from: ctx.cfg.fromEmail,
    subject: "[OppRadar] LLM budget reached, using rules mode",
    text,
    html: `<p>${text}</p>`,
  });
  report.emails.push({ to: owner, subject: "llm budget", kind: "admin" });
}

function newReport(ctx: CliContext, mode: RunReport["mode"]): RunReport {
  return {
    started_at: ctx.now.toISOString(),
    mode,
    counts: {
      fetched: 0,
      deduped: 0,
      prefiltered: 0,
      classified: 0,
      enriched: 0,
      matched: 0,
      sent: 0,
    },
    instant_sent: 0,
    digest_sent: false,
    llm: { calls: 0, input_tokens: 0, output_tokens: 0, budget_exceeded: false },
    sources: [],
    emails: [],
  };
}

function writeOut(ctx: CliContext, name: string, data: unknown) {
  mkdirSync(ctx.outDir, { recursive: true });
  writeFileSync(join(ctx.outDir, name), JSON.stringify(data, null, 2) + "\n");
}

/** `radar run`: fetch -> dedupe against state -> classify -> score -> instant -> digest if due -> save state. */
export async function runOss(ctx: CliContext, opts: DeliverOptions = {}): Promise<RunReport> {
  const state = pruneState(loadState(ctx.statePath), ctx.now);
  const report = newReport(ctx, ctx.cfg.effectiveMode);
  const fetched = await collectCandidates(ctx, state);
  report.sources = fetched.sourceRuns.map((r) => ({
    id: r.source_id,
    items: r.items_fetched,
    error: r.error,
    blocked: r.blocked,
    duration_ms: r.duration_ms,
  }));
  Object.assign(report.counts, fetched.counts);

  const { signals, enrichedCount, cls } = await classifyAndBuild(ctx, state, fetched.candidates);
  report.counts.classified = cls.items.length;
  report.counts.enriched = enrichedCount;
  report.llm = {
    calls: cls.stats.llm_calls,
    input_tokens: cls.stats.input_tokens,
    output_tokens: cls.stats.output_tokens,
    budget_exceeded: cls.stats.budget_exceeded,
  };

  // Fixture mode is a demo: always show the digest too.
  await routeAndDeliver(ctx, state, signals, report, {
    ...opts,
    forceDigest: opts.forceDigest || ctx.cfg.fixtures,
  });
  await checkSourceHealth(ctx, state, report, opts.dryRun || ctx.cfg.fixtures);
  await notifyBudget(ctx, report, opts.dryRun);

  markSeen(state, fetched.unique, ctx.now);
  state.last_run_at = ctx.now.toISOString();
  if (!opts.dryRun) saveState(ctx.statePath, state);
  writeOut(ctx, "signals.json", signals);
  writeOut(ctx, "run-report.json", report);
  ctx.logger.info(
    { counts: report.counts, mode: report.mode, llm: report.llm },
    "pipeline run complete",
  );
  return report;
}

/** `radar send --input`: validate external (Claude-mode) classifications, then cluster, enrich, route, email. */
export async function sendFromInput(
  ctx: CliContext,
  inputs: unknown[],
  opts: DeliverOptions = {},
): Promise<RunReport> {
  const state = pruneState(loadState(ctx.statePath), ctx.now);
  const report = newReport(ctx, "claude");
  const parsed: SignalInput[] = [];
  const errors: string[] = [];
  inputs.forEach((raw, i) => {
    const r = SignalInputSchema.safeParse(raw);
    if (r.success) parsed.push(r.data);
    else
      errors.push(
        `item ${i}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`,
      );
  });
  if (errors.length)
    ctx.logger.warn(
      { errors: errors.slice(0, 10), invalid: errors.length },
      "skipping invalid items",
    );
  const quality = Object.fromEntries(ctx.sources.sources.map((s) => [s.id, s.quality]));
  const classified: ClassifiedCandidate[] = parsed.map((s) => ({
    ...s,
    fetched_at: s.fetched_at ?? ctx.now.toISOString(),
    source_quality: s.source_quality ?? quality[s.source_id] ?? 50,
    other_sources: s.other_sources ?? [],
    classifier: s.classifier ?? "claude",
    content_hash: s.content_hash || shortHash(s.canonical_url, 24),
  }));
  report.counts.classified = classified.length;
  const { signals, enrichedCount } = await buildAndEnrich(ctx, state, classified);
  report.counts.enriched = enrichedCount;
  await routeAndDeliver(ctx, state, signals, report, opts);
  markSeen(state, classified, ctx.now);
  state.last_run_at = ctx.now.toISOString();
  if (!opts.dryRun) saveState(ctx.statePath, state);
  writeOut(ctx, "run-report.json", report);
  ctx.logger.info({ counts: report.counts, invalid: errors.length }, "send complete");
  if (errors.length) (report as RunReport & { invalid: string[] }).invalid = errors;
  return report;
}
