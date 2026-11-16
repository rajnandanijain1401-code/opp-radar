import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DPDP / GDPR data export: everything we hold about the signed-in user, as JSON. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [profiles, deliveries, feedback, subscriptions, waitlist] = await Promise.all([
    db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)),
    db.select().from(schema.deliveries).where(eq(schema.deliveries.userId, user.id)),
    db.select().from(schema.feedback).where(eq(schema.feedback.userId, user.id)),
    db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, user.id)),
    db.select().from(schema.waitlist).where(eq(schema.waitlist.email, user.email)),
  ]);
  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      user,
      profiles,
      deliveries,
      feedback,
      subscriptions,
      waitlist,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="oppradar-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
