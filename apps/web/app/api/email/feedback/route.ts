import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { verifyToken } from "@opp-radar/core";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";
import { getIp } from "@/lib/utils";

export const runtime = "nodejs";

/** 👍/👎 links inside emails. Signed token, no login. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const r = req.nextUrl.searchParams.get("r");
  if (!(await rateLimit(`fb:ip:${getIp(req.headers)}`, 60, 3600)))
    return new NextResponse("Too many requests", { status: 429 });
  const payload = verifyToken(token, env().RADAR_LINK_SECRET);
  if (!payload || payload.a !== "fb" || !payload.s || (r !== "up" && r !== "down")) {
    return NextResponse.redirect(new URL("/feedback/thanks?invalid=1", req.url));
  }
  const rating = r === "up" ? 1 : -1;
  await db
    .insert(schema.feedback)
    .values({ userId: payload.u, signalId: payload.s, rating })
    .onConflictDoUpdate({
      target: [schema.feedback.userId, schema.feedback.signalId],
      set: { rating, createdAt: new Date() },
    })
    .catch(() => undefined);
  await db
    .update(schema.deliveries)
    .set({ clickedAt: new Date() })
    .where(and(eq(schema.deliveries.userId, payload.u), eq(schema.deliveries.signalId, payload.s)))
    .catch(() => undefined);
  return NextResponse.redirect(new URL(`/feedback/thanks?r=${r}`, req.url));
}
