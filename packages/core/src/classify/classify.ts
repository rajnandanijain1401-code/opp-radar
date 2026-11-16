import {
  ClassificationSchema,
  type Candidate,
  type Classification,
  type ClassifierKind,
} from "../schemas";
import type { Logger } from "../logger";
import { noLongDashes, truncate } from "../util/text";
import { toPromptItem } from "./prompt";
import type { LlmClassifier, LlmUsage } from "./llm";
import { classifyWithRules, type RulesOptions } from "./rules";

export type ClassifiedCandidate = Candidate & Classification & { classifier: ClassifierKind };

export interface ClassificationCache {
  get(hash: string): Promise<(Classification & { classifier: ClassifierKind }) | undefined>;
  set(hash: string, value: Classification & { classifier: ClassifierKind }): Promise<void>;
}

export function createMemoryCache(): ClassificationCache & { size(): number } {
  const m = new Map<string, Classification & { classifier: ClassifierKind }>();
  return {
    async get(h) {
      return m.get(h);
    },
    async set(h, v) {
      m.set(h, v);
    },
    size: () => m.size,
  };
}

export interface TokenBudget {
  /** Tokens still available today. */
  remaining(): number;
  record(usage: LlmUsage): void;
}

export function createTokenBudget(limit: number, usedToday = 0): TokenBudget & { used(): number } {
  let used = usedToday;
  return {
    remaining: () => Math.max(0, limit - used),
    record: (u) => {
      used += u.input_tokens + u.output_tokens;
    },
    used: () => used,
  };
}

export interface ClassifyOptions {
  mode: "llm" | "rules";
  llm?: LlmClassifier;
  cache?: ClassificationCache;
  budget?: TokenBudget;
  batchSize?: number;
  logger?: Logger;
  rules?: RulesOptions;
}

export interface ClassifyResult {
  items: ClassifiedCandidate[];
  stats: {
    cached: number;
    llm: number;
    rules: number;
    fallbacks: number;
    llm_calls: number;
    input_tokens: number;
    output_tokens: number;
    budget_exceeded: boolean;
  };
}

/** Make LLM output safe for our strict schema: clamp numbers, trim copy, strip long dashes. */
export function sanitizeClassification(raw: Record<string, unknown>): Classification | null {
  const s = (v: unknown, max: number) =>
    typeof v === "string" ? truncate(noLongDashes(v.trim()), max) : v;
  const summary =
    typeof raw.summary === "string"
      ? raw.summary
          .split(/(?<=[.!?])\s+/)
          .slice(0, 2)
          .join(" ")
      : raw.summary;
  const candidate = {
    ...raw,
    company_name: s(raw.company_name, 120),
    summary: s(summary, 320),
    hiring_reason: s(raw.hiring_reason, 240),
    suggested_action: s(raw.suggested_action, 240),
    outreach_opener: s(raw.outreach_opener, 300),
    hiring_likelihood:
      typeof raw.hiring_likelihood === "number"
        ? Math.max(0, Math.min(100, Math.round(raw.hiring_likelihood)))
        : raw.hiring_likelihood,
    confidence:
      typeof raw.confidence === "number"
        ? Math.max(0, Math.min(1, raw.confidence))
        : raw.confidence,
    investors: Array.isArray(raw.investors) ? raw.investors.slice(0, 15) : raw.investors,
    geographies: Array.isArray(raw.geographies) ? raw.geographies.slice(0, 10) : raw.geographies,
    sectors: Array.isArray(raw.sectors) ? raw.sectors.slice(0, 10) : raw.sectors,
  };
  const parsed = ClassificationSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Rough token estimate for budget checks before a call (~4 chars per token, plus output). */
function estimateTokens(batch: Candidate[]): number {
  const input =
    900 + batch.reduce((n, c) => n + (c.title.length + (c.snippet?.length ?? 0) + 120) / 4, 0);
  return Math.ceil(input + batch.length * 260);
}

/**
 * Classify candidates once, globally. Order: cache -> LLM (batched, validated, one retry) -> rules fallback.
 * When the daily token budget runs out mid-run, the remaining items use rules and budget_exceeded is set.
 */
export async function classifyCandidates(
  candidates: Candidate[],
  opts: ClassifyOptions,
): Promise<ClassifyResult> {
  const stats: ClassifyResult["stats"] = {
    cached: 0,
    llm: 0,
    rules: 0,
    fallbacks: 0,
    llm_calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    budget_exceeded: false,
  };
  const out = new Map<string, ClassifiedCandidate>();
  const todo: Candidate[] = [];

  for (const c of candidates) {
    const hit = await opts.cache?.get(c.content_hash);
    if (hit) {
      out.set(c.content_hash, { ...c, ...hit });
      stats.cached++;
    } else todo.push(c);
  }

  const useRules = async (c: Candidate, fallback: boolean) => {
    const cls = { ...classifyWithRules(c, opts.rules), classifier: "rules" as const };
    out.set(c.content_hash, { ...c, ...cls });
    if (fallback) stats.fallbacks++;
    stats.rules++;
    // Rules results are not cached when we meant to use the LLM: a later run may afford it.
    if (opts.mode === "rules") await opts.cache?.set(c.content_hash, cls);
  };

  if (opts.mode === "rules" || !opts.llm) {
    for (const c of todo) await useRules(c, false);
  } else {
    const size = Math.min(opts.batchSize ?? 20, 20);
    for (let i = 0; i < todo.length; i += size) {
      const batch = todo.slice(i, i + size);
      if (opts.budget && opts.budget.remaining() < estimateTokens(batch)) {
        if (!stats.budget_exceeded)
          opts.logger?.warn("LLM daily token budget exceeded, switching to rules mode");
        stats.budget_exceeded = true;
        for (const c of batch) await useRules(c, true);
        continue;
      }
      let byHash = new Map<string, Classification>();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { output, usage } = await opts.llm.classifyBatch(batch.map(toPromptItem));
          stats.llm_calls++;
          stats.input_tokens += usage.input_tokens;
          stats.output_tokens += usage.output_tokens;
          opts.budget?.record(usage);
          if (output) {
            byHash = new Map();
            for (const raw of output.items) {
              const clean = sanitizeClassification(raw as Record<string, unknown>);
              if (clean) byHash.set(clean.content_hash, clean);
            }
            if (byHash.size) break;
          }
          opts.logger?.warn({ attempt }, "LLM returned invalid JSON for batch, retrying once");
        } catch (err) {
          opts.logger?.warn({ err: String(err), attempt }, "LLM call failed");
          if (attempt === 1) break;
        }
      }
      for (const c of batch) {
        const cls = byHash.get(c.content_hash);
        if (cls) {
          const v = { ...cls, classifier: "llm" as const };
          out.set(c.content_hash, { ...c, ...v });
          await opts.cache?.set(c.content_hash, v);
          stats.llm++;
        } else await useRules(c, true);
      }
    }
  }

  return { items: candidates.map((c) => out.get(c.content_hash)!).filter(Boolean), stats };
}
