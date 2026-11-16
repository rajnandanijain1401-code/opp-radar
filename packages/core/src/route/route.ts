import type { Signal, UserProfile } from "../schemas";
import {
  DEFAULT_SCORING,
  scoreSignal,
  type ScoreBreakdown,
  type ScoringConfig,
} from "../score/score";

export interface ScoredSignal {
  signal: Signal;
  score: ScoreBreakdown;
}

export interface PlanLimits {
  instant: boolean;
  digest_max_items: number;
}

export const PRO_LIMITS: PlanLimits = { instant: true, digest_max_items: 15 };
export const FREE_LIMITS: PlanLimits = { instant: false, digest_max_items: 10 };

export interface RouteInput {
  signals: Signal[];
  profile: UserProfile;
  now: Date;
  /** Clusters already delivered to this user on any channel. Never send the same cluster twice. */
  sentClusterIds: Set<string>;
  /** Instant alerts already sent to this user today (local day). */
  instantSentToday: number;
  limits?: PlanLimits;
  scoring?: ScoringConfig;
}

export interface RouteResult {
  instant: ScoredSignal[];
  digest: ScoredSignal[];
  dropped: ScoredSignal[];
}

/**
 * Score every signal for one profile and route it:
 * final >= instant_threshold (and under the daily cap) -> instant; final >= 40 -> digest; else dropped.
 * One signal per cluster (the best-scoring one), and clusters already sent are skipped.
 */
export function routeSignals(input: RouteInput): RouteResult {
  const cfg = input.scoring ?? DEFAULT_SCORING;
  const limits = input.limits ?? PRO_LIMITS;
  const p = input.profile;
  const best = new Map<string, ScoredSignal>();
  for (const signal of input.signals) {
    if (input.sentClusterIds.has(signal.cluster_id)) continue;
    const score = scoreSignal(signal, p, input.now, cfg);
    const prev = best.get(signal.cluster_id);
    if (!prev || score.final > prev.score.final) best.set(signal.cluster_id, { signal, score });
  }
  const ranked = [...best.values()].sort((a, b) => b.score.final - a.score.final);
  const result: RouteResult = { instant: [], digest: [], dropped: [] };
  let capLeft = Math.max(0, p.max_instant_per_day - input.instantSentToday);
  const instantOn = limits.instant && p.instant_alerts_enabled;
  for (const s of ranked) {
    if (s.score.excluded || s.score.final < cfg.digest_min_score) {
      result.dropped.push(s);
    } else if (instantOn && s.score.final >= p.instant_threshold && capLeft > 0) {
      result.instant.push(s);
      capLeft--;
    } else {
      result.digest.push(s);
    }
  }
  return result;
}

export const INSTANT_WINDOW_MINUTES = 15;

/** Instant alerts are batched: at most one email per user per 15-minute window. */
export function shouldFlushInstant(
  lastSentAt: string | null | undefined,
  now: Date,
  windowMinutes = INSTANT_WINDOW_MINUTES,
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - Date.parse(lastSentAt) >= windowMinutes * 60_000;
}

/** Local calendar parts for a timezone, without external date libraries. */
export function localParts(
  now: Date,
  timeZone: string,
): { date: string; hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    weekday: weekdays.indexOf(parts.weekday ?? "Mon"),
  };
}

/**
 * Digest is due when the local hour equals the chosen hour and we have not sent one this local day
 * (daily) or this local week (weekly, sent on Mondays).
 */
export function isDigestDue(
  p: Pick<UserProfile, "digest_frequency" | "digest_hour_local" | "timezone">,
  lastDigestSentAt: string | null | undefined,
  now: Date,
): boolean {
  if (p.digest_frequency === "off") return false;
  const local = localParts(now, p.timezone);
  if (local.hour !== p.digest_hour_local) return false;
  if (p.digest_frequency === "weekly" && local.weekday !== 1) return false;
  if (!lastDigestSentAt) return true;
  const last = localParts(new Date(lastDigestSentAt), p.timezone);
  if (p.digest_frequency === "daily") return last.date !== local.date;
  return now.getTime() - Date.parse(lastDigestSentAt) > 6 * 86_400_000;
}

/** Top N for the digest, plus grouping by event type in score order. */
export function selectDigest(
  items: ScoredSignal[],
  max: number,
): { top: ScoredSignal | null; groups: [string, ScoredSignal[]][] } {
  const chosen = [...items].sort((a, b) => b.score.final - a.score.final).slice(0, max);
  const groups = new Map<string, ScoredSignal[]>();
  for (const s of chosen.slice(1)) {
    const g = groups.get(s.signal.event_type) ?? [];
    g.push(s);
    groups.set(s.signal.event_type, g);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1][0]!.score.final - a[1][0]!.score.final);
  return { top: chosen[0] ?? null, groups: ordered };
}
