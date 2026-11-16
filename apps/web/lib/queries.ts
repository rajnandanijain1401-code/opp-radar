import { and, desc, gte, lt, sql } from "drizzle-orm";
import type { Signal } from "@opp-radar/core/schemas";
import { db, isBuildPhase, schema } from "./db";
import { rowToSignal } from "./store";

/** Top signals in a window, ranked by hiring likelihood then recency. Primary item per cluster only. */
export async function topSignals(opts: {
  from: Date;
  to?: Date;
  limit: number;
}): Promise<Signal[]> {
  if (isBuildPhase() && !process.env.DATABASE_URL) return [];
  try {
    const conds = [
      gte(schema.signals.publishedAt, opts.from),
      sql`${schema.signals.isPrimary} = true`,
      sql`${schema.signals.eventType} <> 'other'`,
    ];
    if (opts.to) conds.push(lt(schema.signals.publishedAt, opts.to));
    const rows = await db
      .select()
      .from(schema.signals)
      .where(and(...conds))
      .orderBy(desc(schema.signals.hiringLikelihood), desc(schema.signals.publishedAt))
      .limit(opts.limit);
    return rows.map(rowToSignal);
  } catch (err) {
    console.error("topSignals failed", err);
    return [];
  }
}

/** Latest signals for the landing page, falling back to the most recent week if today is quiet. */
export async function landingSignals(limit = 5): Promise<Signal[]> {
  const day = await topSignals({ from: new Date(Date.now() - 24 * 3_600_000), limit });
  if (day.length >= limit) return day;
  return topSignals({ from: new Date(Date.now() - 7 * 86_400_000), limit });
}

export async function githubStars(repo: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "OppRadar" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { stargazers_count?: number };
    return json.stargazers_count ?? null;
  } catch {
    return null;
  }
}
