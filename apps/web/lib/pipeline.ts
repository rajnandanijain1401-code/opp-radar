import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  buildInstantView,
  buildSignals,
  buildUserAgent,
  classifyCandidates,
  createAnthropicClassifier,
  createFixtureHttpClient,
  createHttpClient,
  createLogger,
  createTokenBudget,
  enrichSignals,
  fetchCandidates,
  loadSourcesFile,
  localParts,
  regionBySource,
  routeSignals,
  shouldFlushInstant,
  SignalSchema,
  type ScoredSignal,
  type Signal,
  type SourcesFile,
  type UserProfile,
} from "@opp-radar/core";
import { renderInstant } from "@opp-radar/emails";
import { db, schema } from "./db";
import { adminEmails, env } from "./env";
import { linksFor, sendEmail } from "./mailer";
import { FEATURES, planFor } from "./plan";
import {
  dbClassificationCache,
  insertSignals,
  loadClusters,
  loadEnrichCache,
  recentSignals,
  saveClusters,
  saveEnrichCache,
  seenIndex,
} from "./store";

const logger = createLogger(process.env.LOG_LEVEL ?? "info");

export function sourcesPath(): string {
  const candidates = [
    process.env.RADAR_SOURCES_FILE,
    join(process.cwd(), "sources.yaml"),
    join(process.cwd(), "..", "..", "sources.yaml"),
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("sources.yaml not found; set RADAR_SOURCES_FILE");
  return found;
}

export function fixturesDir(): string {
  return (
    process.env.RADAR_FIXTURES_DIR ??
    join(process.cwd(), "..", "..", "packages", "core", "fixtures")
  );
}

export async function syncSources(file: SourcesFile) {
  for (const s of file.sources) {
    await db
      .insert(schema.sources)
      .values({ id: s.id, name: s.name, kind: s.kind, enabled: s.enabled, quality: s.quality })
      .onConflictDoUpdate({
        target: schema.sources.id,
        set: {
          name: s.name,
          kind: s.kind,
          enabled: s.enabled,
          quality: s.quality,
          updatedAt: new Date(),
        },
      });
  }
}

export interface PipelineReport {
  runId: string;
  mode: "llm" | "rules";
  counts: Record<string, number>;
  instantEmails: number;
  budgetExceeded: boolean;
}

/** The hosted "pipeline run": ingest -> dedupe -> classify once globally -> store -> instant alerts. */
export async function runPipeline(
  opts: { trigger?: string; now?: Date; fixtures?: boolean; deliver?: boolean } = {},
): Promise<PipelineReport> {
  const e = env();
  const now = opts.now ?? new Date();
  const fixtures = opts.fixtures ?? e.RADAR_FIXTURES;
  const mode: "llm" | "rules" = e.ANTHROPIC_API_KEY ? "llm" : "rules";
  const [run] = await db
    .insert(schema.pipelineRuns)
    .values({ mode, trigger: opts.trigger ?? "cron", startedAt: now })
    .returning({ id: schema.pipelineRuns.id });
  const runId = run!.id;
  const counts: Record<string, number> = {};
  try {
    const sources = loadSourcesFile(sourcesPath());
    await syncSources(sources);
    const http = fixtures
      ? createFixtureHttpClient({ dir: fixturesDir(), now: () => now })
      : createHttpClient({
          userAgent: buildUserAgent(e.RADAR_CONTACT_EMAIL),
          perHostIntervalMs: sources.defaults.rate_limit_ms,
          hostIntervals: sources.defaults.host_rate_limits,
          timeoutMs: sources.defaults.timeout_ms,
          logger,
        });

    // Aggregated, deduped watchlist across users feeds watchlist queries (Google News adapter).
    const profileRows = await db.select({ data: schema.profiles.data }).from(schema.profiles);
    const watchlist = [...new Set(profileRows.flatMap((p) => p.data.watchlist_companies ?? []))];

    const lastRun = await db
      .select({ at: schema.pipelineRuns.startedAt })
      .from(schema.pipelineRuns)
      .where(and(isNotNull(schema.pipelineRuns.finishedAt), isNull(schema.pipelineRuns.error)))
      .orderBy(sql`${schema.pipelineRuns.startedAt} desc`)
      .limit(1);
    const since = lastRun[0]
      ? new Date(lastRun[0].at.getTime() - 2 * 3_600_000)
      : new Date(now.getTime() - 48 * 3_600_000);

    const fetched = await fetchCandidates({
      sources,
      http,
      logger,
      now,
      since,
      seen: await seenIndex(),
      watchlist,
      contactEmail: e.RADAR_CONTACT_EMAIL,
    });
    Object.assign(counts, fetched.counts);

    for (const r of fetched.sourceRuns) {
      await db.insert(schema.sourceRuns).values({
        runId,
        sourceId: r.source_id,
        startedAt: now,
        durationMs: r.duration_ms,
        itemsFetched: r.items_fetched,
        error: r.error ?? null,
        blocked: !!r.blocked,
      });
    }
    await updateSourceHealth(fetched.sourceRuns, now);

    // LLM budget for today (UTC day).
    const today = localParts(now, "UTC").date;
    const usage = (
      await db.select().from(schema.llmUsage).where(eq(schema.llmUsage.date, today))
    )[0];
    const budget = createTokenBudget(
      e.LLM_DAILY_TOKEN_BUDGET,
      (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    );
    const cls = await classifyCandidates(fetched.candidates, {
      mode,
      llm:
        mode === "llm"
          ? createAnthropicClassifier({ apiKey: e.ANTHROPIC_API_KEY, model: e.RADAR_MODEL })
          : undefined,
      cache: dbClassificationCache(),
      budget,
      logger,
      rules: { regionBySource: regionBySource(sources) },
    });
    counts.classified = cls.items.length;
    await db
      .insert(schema.llmUsage)
      .values({
        date: today,
        inputTokens: cls.stats.input_tokens,
        outputTokens: cls.stats.output_tokens,
        calls: cls.stats.llm_calls,
      })
      .onConflictDoUpdate({
        target: schema.llmUsage.date,
        set: {
          inputTokens: sql`${schema.llmUsage.inputTokens} + ${cls.stats.input_tokens}`,
          outputTokens: sql`${schema.llmUsage.outputTokens} + ${cls.stats.output_tokens}`,
          calls: sql`${schema.llmUsage.calls} + ${cls.stats.llm_calls}`,
        },
      });
    if (cls.stats.budget_exceeded) await alertBudget(today);

    const built = buildSignals(cls.items, await loadClusters());
    const cache = await loadEnrichCache();
    const enriched = await enrichSignals(built.signals, { http, cache, now: () => now, logger });
    counts.enriched = enriched.enriched;
    const signals = enriched.items.map((s) => SignalSchema.parse(s));
    await insertSignals(signals, built.primaryIds);
    await saveClusters(built.clusters);
    await saveEnrichCache(cache.dirty);

    const delivered =
      opts.deliver === false ? { emails: 0, matched: 0, sent: 0 } : await deliverInstant(now);
    counts.matched = delivered.matched;
    counts.sent = delivered.sent;

    await db
      .update(schema.pipelineRuns)
      .set({
        finishedAt: new Date(),
        counts,
        llmCalls: cls.stats.llm_calls,
        inputTokens: cls.stats.input_tokens,
        outputTokens: cls.stats.output_tokens,
      })
      .where(eq(schema.pipelineRuns.id, runId));
    logger.info({ runId, counts, mode }, "hosted pipeline run complete");
    return {
      runId,
      mode,
      counts,
      instantEmails: delivered.emails,
      budgetExceeded: cls.stats.budget_exceeded,
    };
  } catch (err) {
    await db
      .update(schema.pipelineRuns)
      .set({
        finishedAt: new Date(),
        counts,
        error: String(err instanceof Error ? err.message : err),
      })
      .where(eq(schema.pipelineRuns.id, runId));
    logger.error({ err: String(err) }, "pipeline failed");
    throw err;
  }
}

async function updateSourceHealth(
  runs: { source_id: string; items_fetched: number; error?: string }[],
  now: Date,
) {
  const unhealthy: string[] = [];
  for (const r of runs) {
    const row = (
      await db.select().from(schema.sources).where(eq(schema.sources.id, r.source_id))
    )[0];
    if (!row) continue;
    const lastItemsAt = r.items_fetched > 0 ? now : (row.lastItemsAt ?? row.updatedAt);
    const quiet = now.getTime() - lastItemsAt.getTime() >= 24 * 3_600_000;
    let notified = r.items_fetched > 0 ? null : row.unhealthyNotifiedAt;
    if (quiet && !notified) {
      unhealthy.push(`${r.source_id}${r.error ? ` (${r.error})` : ""}`);
      notified = now;
    }
    await db
      .update(schema.sources)
      .set({
        lastItemsAt,
        lastError: r.error ?? null,
        unhealthyNotifiedAt: notified,
        updatedAt: now,
      })
      .where(eq(schema.sources.id, r.source_id));
  }
  if (unhealthy.length) {
    const text = `These sources returned no items for 24 hours:\n- ${unhealthy.join("\n- ")}\n\nSee /admin for details.`;
    for (const to of adminEmails()) {
      await sendEmail({
        to,
        subject: `[OppRadar] ${unhealthy.length} source(s) unhealthy`,
        text,
        html: `<pre>${text}</pre>`,
        category: "admin",
      });
    }
  }
}

async function alertBudget(today: string) {
  const row = (await db.select().from(schema.llmUsage).where(eq(schema.llmUsage.date, today)))[0];
  if (row?.budgetAlertedAt) return;
  await db
    .update(schema.llmUsage)
    .set({ budgetAlertedAt: new Date() })
    .where(eq(schema.llmUsage.date, today));
  const text = `The daily LLM token budget (${env().LLM_DAILY_TOKEN_BUDGET}) was reached. The pipeline switched to rules mode for the rest of the day.`;
  for (const to of adminEmails()) {
    await sendEmail({
      to,
      subject: "[OppRadar] LLM budget reached",
      text,
      html: `<p>${text}</p>`,
      category: "admin",
    });
  }
}

/** Users who can receive email: onboarded, not unsubscribed, not suppressed. */
export async function activeUsers() {
  return db
    .select()
    .from(schema.users)
    .where(
      and(
        isNotNull(schema.users.onboardedAt),
        isNull(schema.users.unsubscribedAt),
        isNull(schema.users.suppressedAt),
      ),
    );
}

export async function userProfiles(
  userId: string,
  maxProfiles: number,
): Promise<{ id: string; data: UserProfile }[]> {
  const rows = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .orderBy(sql`${schema.profiles.isPrimary} desc, ${schema.profiles.createdAt} asc`);
  return rows.slice(0, maxProfiles).map((r) => ({ id: r.id, data: r.data }));
}

export async function deliveredClusters(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ c: schema.deliveries.clusterId })
    .from(schema.deliveries)
    .where(
      and(
        eq(schema.deliveries.userId, userId),
        inArray(schema.deliveries.status, ["sent", "queued"]),
      ),
    );
  return new Set(rows.map((r) => r.c));
}

/** Merge routing across a user's profiles: best score per cluster wins. */
export function mergeRouted(lists: { profileId: string; items: ScoredSignal[] }[]) {
  const best = new Map<string, ScoredSignal & { profileId: string }>();
  for (const l of lists)
    for (const it of l.items) {
      const prev = best.get(it.signal.cluster_id);
      if (!prev || it.score.final > prev.score.final)
        best.set(it.signal.cluster_id, { ...it, profileId: l.profileId });
    }
  return [...best.values()].sort((a, b) => b.score.final - a.score.final);
}

/** Instant alerts: one batched email per user per 15-minute window, capped per local day. */
export async function deliverInstant(now: Date) {
  const signals = await recentSignals({ sinceHours: 48 });
  let emails = 0;
  let matched = 0;
  let sent = 0;
  for (const user of await activeUsers()) {
    const features = FEATURES[await planFor(user.id)];
    if (!features.instant) continue;
    const profiles = await userProfiles(user.id, features.maxProfiles);
    if (!profiles.length) continue;
    const primary = profiles[0]!.data;
    const today = localParts(now, primary.timezone).date;
    const countToday = user.instantCountDate === today ? user.instantCount : 0;
    const sentClusters = await deliveredClusters(user.id);
    const queued = await db
      .select()
      .from(schema.deliveries)
      .where(and(eq(schema.deliveries.userId, user.id), eq(schema.deliveries.status, "queued")));

    const routed = mergeRouted(
      profiles.map((p) => ({
        profileId: p.id,
        items: routeSignals({
          signals: signals.filter((s) => !sentClusters.has(s.cluster_id)),
          profile: p.data,
          now,
          sentClusterIds: sentClusters,
          instantSentToday: countToday + queued.length,
          limits: features,
        }).instant,
      })),
    ).slice(0, Math.max(0, primary.max_instant_per_day - countToday - queued.length));
    matched += routed.length;

    for (const r of routed) {
      await db
        .insert(schema.deliveries)
        .values({
          userId: user.id,
          profileId: r.profileId,
          signalId: r.signal.id,
          clusterId: r.signal.cluster_id,
          channel: "instant",
          status: "queued",
          score: r.score.final,
        })
        .onConflictDoNothing();
    }
    if (!shouldFlushInstant(user.lastInstantAt?.toISOString(), now)) continue;

    const pending = await db
      .select()
      .from(schema.deliveries)
      .where(and(eq(schema.deliveries.userId, user.id), eq(schema.deliveries.status, "queued")));
    if (!pending.length) continue;
    const byId = new Map(signals.map((s) => [s.id, s]));
    const items: ScoredSignal[] = pending
      .map((d) => {
        const s = byId.get(d.signalId);
        const fromRouted = routed.find((r) => r.signal.id === d.signalId);
        return s ? (fromRouted ?? scoredFallback(s, d.score)) : null;
      })
      .filter((x): x is ScoredSignal => !!x)
      .sort((a, b) => b.score.final - a.score.final);
    if (!items.length) continue;
    const view = buildInstantView(items, {
      links: linksFor(user.id),
      pro: features.openers,
      physicalAddress: env().RADAR_PHYSICAL_ADDRESS,
      appUrl: env().RADAR_PUBLIC_URL,
    });
    const rendered = await renderInstant(view);
    try {
      await sendEmail({ to: user.email, userId: user.id, ...rendered, category: "instant" });
      await db
        .update(schema.deliveries)
        .set({ status: "sent", sentAt: now })
        .where(and(eq(schema.deliveries.userId, user.id), eq(schema.deliveries.status, "queued")));
      await db
        .update(schema.users)
        .set({
          lastInstantAt: now,
          instantCountDate: today,
          instantCount: countToday + items.length,
        })
        .where(eq(schema.users.id, user.id));
      emails++;
      sent += items.length;
    } catch (err) {
      logger.error({ user: user.id, err: String(err) }, "instant send failed");
    }
  }
  return { emails, matched, sent };
}

function scoredFallback(s: Signal, score: number): ScoredSignal {
  return {
    signal: s,
    score: {
      final: score,
      hiring: s.hiring_likelihood,
      relevance: 0,
      recency: 0,
      source_quality: s.source_quality,
      watchlist_hit: false,
      excluded: false,
      reasons: [],
    },
  };
}

export async function pipelineRunsSince(hours: number) {
  return db
    .select()
    .from(schema.pipelineRuns)
    .where(gte(schema.pipelineRuns.startedAt, new Date(Date.now() - hours * 3_600_000)))
    .orderBy(sql`${schema.pipelineRuns.startedAt} desc`);
}
