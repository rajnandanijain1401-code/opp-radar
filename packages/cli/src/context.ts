import { join } from "node:path";
import {
  buildUserAgent,
  createAnthropicClassifier,
  createFixtureHttpClient,
  createHttpClient,
  createLogger,
  loadConfig,
  loadSourcesFile,
  type HttpClient,
  type LlmClassifier,
  type Logger,
  type ResolvedConfig,
  type SourcesFile,
} from "@opp-radar/core";
import { createEmailProvider, type EmailProvider } from "@opp-radar/emails";

export interface CliContext {
  cfg: ResolvedConfig;
  sources: SourcesFile;
  http: HttpClient;
  llm?: LlmClassifier;
  provider: EmailProvider;
  logger: Logger;
  now: Date;
  outDir: string;
  statePath: string;
  env: Record<string, string | undefined>;
}

export interface ContextOptions {
  config?: string;
  fixtures?: boolean;
  env?: Record<string, string | undefined>;
  now?: Date;
  provider?: EmailProvider;
  llm?: LlmClassifier;
  logger?: Logger;
  outDir?: string;
}

/** Resolve config + env into everything a command needs. Secrets only come from env. */
export function createContext(opts: ContextOptions = {}): CliContext {
  const env = opts.env ?? process.env;
  const cfg = loadConfig(opts.config ?? env.RADAR_CONFIG ?? "radar.config.yaml", env);
  if (opts.fixtures) cfg.fixtures = true;
  const sources = loadSourcesFile(cfg.sources.file);
  for (const s of sources.sources) {
    if (cfg.sources.enable.includes(s.id)) s.enabled = true;
    if (cfg.sources.disable.includes(s.id)) s.enabled = false;
  }
  const logger = opts.logger ?? createLogger(env.LOG_LEVEL);
  const now = opts.now ?? new Date();
  const http = cfg.fixtures
    ? createFixtureHttpClient({ now: () => now })
    : createHttpClient({
        userAgent: buildUserAgent(cfg.contactEmail),
        perHostIntervalMs: sources.defaults.rate_limit_ms,
        hostIntervals: sources.defaults.host_rate_limits,
        timeoutMs: sources.defaults.timeout_ms,
        logger,
      });
  const outDir = opts.outDir ?? env.RADAR_OUT_DIR ?? "out";
  const llm =
    opts.llm ??
    (cfg.effectiveMode === "llm"
      ? createAnthropicClassifier({ apiKey: env.ANTHROPIC_API_KEY, model: cfg.model })
      : undefined);
  return {
    cfg,
    sources,
    http,
    llm,
    provider: opts.provider ?? createEmailProvider({ ...env, RADAR_OUT_DIR: outDir }),
    logger,
    now,
    outDir,
    // Fixture runs never touch the real state file.
    statePath: cfg.fixtures ? join(outDir, "state.fixtures.json") : cfg.state_file,
    env,
  };
}

export function mailboxOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim();
}
