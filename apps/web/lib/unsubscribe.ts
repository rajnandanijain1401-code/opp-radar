import { eq } from "drizzle-orm";
import { verifyToken } from "@opp-radar/core";
import { db, schema } from "./db";
import { env } from "./env";

/** Verify a signed unsubscribe token and pause all email for that user. Idempotent. */
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email?: string }> {
  const payload = verifyToken(token, env().RADAR_LINK_SECRET);
  if (!payload || payload.a !== "unsub") return { ok: false };
  const rows = await db
    .update(schema.users)
    .set({ unsubscribedAt: new Date() })
    .where(eq(schema.users.id, payload.u))
    .returning({ email: schema.users.email });
  return { ok: true, email: rows[0]?.email };
}

export async function resubscribeByToken(token: string): Promise<boolean> {
  const payload = verifyToken(token, env().RADAR_LINK_SECRET);
  if (!payload || payload.a !== "unsub") return false;
  await db.update(schema.users).set({ unsubscribedAt: null }).where(eq(schema.users.id, payload.u));
  return true;
}
