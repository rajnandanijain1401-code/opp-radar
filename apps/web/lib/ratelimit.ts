import { sql } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * Fixed-window rate limit stored in Postgres, so it holds across serverless instances.
 * Returns true when the request is allowed.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
  );
  try {
    const rows = await db
      .insert(schema.rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: {
          count: sql`case when ${schema.rateLimits.windowStart} = ${windowStart} then ${schema.rateLimits.count} + 1 else 1 end`,
          windowStart,
        },
      })
      .returning({ count: schema.rateLimits.count });
    return (rows[0]?.count ?? 1) <= limit;
  } catch (err) {
    console.error("rate limit check failed, allowing request", err);
    return true;
  }
}
