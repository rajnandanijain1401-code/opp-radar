import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { UserProfileSchema } from "./schemas";
import { DEFAULT_SCORING, type ScoringConfig } from "./score/score";
import { DEFAULT_MODEL } from "./classify/llm";

export const RadarConfigSchema = z.object({
  /** llm: use Claude when ANTHROPIC_API_KEY is set, else rules. rules: never call an LLM. */
  mode: z.enum(["llm", "rules"]).default("llm"),
  recipients: z.array(z.string().email()).min(1),
  from: z.string().optional(),
  profile: UserProfileSchema.default(UserProfileSchema.parse({})),
  /** OSS mode unlocks every Pro feature. */
  pro: z.boolean().default(true),
  digest_max_items: z.number().int().min(1).max(50).default(15),
  /** How far back to look on the very first run. */
  first_run_lookback_hours: z.number().min(1).max(168).default(24),
  state_file: z.string().default("data/state.json"),
  sources: z
    .object({
      file: z.string().default("sources.yaml"),
      enable: z.array(z.string()).default([]),
      disable: z.array(z.string()).default([]),
    })
    .default({ file: "sources.yaml", enable: [], disable: [] }),
  scoring: z
    .object({
      weights: z
        .object({
          hiring: z.number(),
          relevance: z.number(),
          recency: z.number(),
          source_quality: z.number(),
        })
        .partial()
        .optional(),
      recency_half_life_hours: z.number().optional(),
      digest_min_score: z.number().optional(),
    })
    .default({}),
  llm: z
    .object({
      model: z.string().optional(),
      daily_token_budget: z.number().int().positive().optional(),
    })
    .default({}),
});
export type RadarConfig = z.infer<typeof RadarConfigSchema>;

export interface ResolvedConfig extends RadarConfig {
  effectiveMode: "llm" | "rules";
  model: string;
  dailyTokenBudget: number;
  fromEmail: string;
  contactEmail?: string;
  scoringConfig: ScoringConfig;
  fixtures: boolean;
  publicUrl?: string;
  linkSecret?: string;
  physicalAddress: string;
}

/** Load radar.config.yaml and apply environment overrides (secrets only ever come from env). */
export function loadConfig(
  path: string,
  env: Record<string, string | undefined> = process.env,
): ResolvedConfig {
  if (!existsSync(path))
    throw new Error(
      `Config not found: ${path}. Create one from the commented radar.config.yaml in the repo.`,
    );
  const raw = parseYaml(readFileSync(path, "utf8")) ?? {};
  const cfg = RadarConfigSchema.parse(raw);
  const hasKey = Boolean(env.ANTHROPIC_API_KEY);
  const w = { ...DEFAULT_SCORING.weights, ...(cfg.scoring.weights ?? {}) };
  return {
    ...cfg,
    effectiveMode: cfg.mode === "llm" && hasKey ? "llm" : "rules",
    model: env.RADAR_MODEL || cfg.llm.model || DEFAULT_MODEL,
    dailyTokenBudget: Number(env.LLM_DAILY_TOKEN_BUDGET || cfg.llm.daily_token_budget || 400_000),
    fromEmail:
      env.RADAR_FROM_EMAIL || cfg.from || `OppRadar <${env.SMTP_USER || "radar@localhost"}>`,
    contactEmail: env.RADAR_CONTACT_EMAIL || env.SMTP_USER || cfg.recipients[0],
    scoringConfig: {
      weights: w,
      recency_half_life_hours:
        cfg.scoring.recency_half_life_hours ?? DEFAULT_SCORING.recency_half_life_hours,
      digest_min_score: cfg.scoring.digest_min_score ?? DEFAULT_SCORING.digest_min_score,
    },
    fixtures: env.RADAR_FIXTURES === "1" || env.RADAR_FIXTURES === "true",
    publicUrl: env.RADAR_PUBLIC_URL || undefined,
    linkSecret: env.RADAR_LINK_SECRET || undefined,
    physicalAddress:
      env.RADAR_PHYSICAL_ADDRESS || "OppRadar, add your postal address via RADAR_PHYSICAL_ADDRESS",
  };
}
