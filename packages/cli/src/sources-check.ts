import { createAdapter, runSources } from "@opp-radar/core";
import type { CliContext } from "./context";

export interface SourceCheckRow {
  id: string;
  enabled: boolean;
  status: "ok" | "empty" | "blocked" | "error";
  items: number;
  duration_ms: number;
  note?: string;
}

/** Fetch each source once (last 72h) and summarize. Used to verify feeds and for docs. */
export async function checkSources(
  ctx: CliContext,
  opts: { all?: boolean } = {},
): Promise<SourceCheckRow[]> {
  const defs = ctx.sources.sources.filter((s) => opts.all || s.enabled);
  const sctx = {
    http: ctx.http,
    logger: ctx.logger,
    now: () => ctx.now,
    contactEmail: ctx.cfg.contactEmail,
    watchlist: ctx.cfg.profile.watchlist_companies,
    env: ctx.env,
  };
  const since = new Date(ctx.now.getTime() - 72 * 3_600_000);
  const results = await runSources(
    defs.map((d) => createAdapter(d, sctx)),
    since,
    ctx,
  );
  return results.map((r) => {
    const def = defs.find((d) => d.id === r.source_id)!;
    return {
      id: r.source_id,
      enabled: def.enabled,
      status: r.blocked ? "blocked" : r.error ? "error" : r.items_fetched ? "ok" : "empty",
      items: r.items_fetched,
      duration_ms: r.duration_ms,
      note: r.error ?? (def.enabled ? undefined : def.note?.slice(0, 80)),
    };
  });
}
