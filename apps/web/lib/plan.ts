import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";

export { FEATURES, type Plan, type PlanFeatures } from "./features";
import { FEATURES, type Plan, type PlanFeatures } from "./features";

export const ACTIVE_STATUSES = ["active", "authenticated", "trialing", "past_due"];

/** With BILLING_ENABLED=false everyone gets Pro (free waitlist phase). */
export async function planFor(userId: string): Promise<Plan> {
  if (!env().BILLING_ENABLED) return "pro";
  const rows = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        inArray(schema.subscriptions.status, ACTIVE_STATUSES),
      ),
    )
    .limit(1);
  return rows.length ? "pro" : "free";
}

export async function featuresFor(userId: string): Promise<PlanFeatures> {
  return FEATURES[await planFor(userId)];
}
