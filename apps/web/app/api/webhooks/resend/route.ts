import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { verifySvix } from "@/lib/webhooks";

export const runtime = "nodejs";

const EventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().optional(),
      to: z.union([z.array(z.string()), z.string()]).optional(),
    })
    .passthrough(),
});

/** Resend bounce / complaint webhook. Hard bounces and complaints auto-suppress the address. */
export async function POST(req: NextRequest) {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const body = await req.text();
  const ok = verifySvix(
    body,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    secret,
  );
  if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const parsed = EventSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return NextResponse.json({ ok: true, ignored: true });
  const evt = parsed.data;
  const email = (Array.isArray(evt.data.to) ? evt.data.to[0] : evt.data.to)?.toLowerCase() ?? null;
  const user = email
    ? (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0]
    : undefined;

  await db
    .insert(schema.emailEvents)
    .values({
      providerEventId: req.headers.get("svix-id")!,
      type: evt.type,
      email,
      userId: user?.id ?? null,
      payload: evt,
    })
    .onConflictDoNothing();

  const bounceType = (evt.data as { bounce?: { type?: string } }).bounce?.type;
  const suppress =
    evt.type === "email.complained" || (evt.type === "email.bounced" && bounceType !== "Transient");
  if (suppress && user) {
    await db
      .update(schema.users)
      .set({ suppressedAt: new Date(), suppressedReason: evt.type })
      .where(eq(schema.users.id, user.id));
  }
  if (evt.type === "email.opened" && user && evt.data.email_id) {
    // Opens are recorded on email_events only; deliveries.opened_at is best-effort.
  }
  return NextResponse.json({ ok: true, suppressed: suppress && !!user });
}
