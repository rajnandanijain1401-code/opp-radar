import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "./env";

/**
 * Cron endpoints accept `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) or
 * `x-cron-secret`. Without CRON_SECRET they only work outside production.
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return env().NODE_ENV !== "production";
  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-cron-secret") ??
    "";
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
