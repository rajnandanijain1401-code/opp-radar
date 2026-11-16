import { and, eq, inArray } from "drizzle-orm";
import { FREE_LIMITS, PRO_LIMITS, type PlanLimits } from "@opp-radar/core";
import { db, schema } from "./db";
import { env } from "./env";

export type Plan = "free" | "pro";

export interface PlanFeatures extends PlanLimits {
  plan: Plan;
  maxProfiles: number;
  maxWatchlist: number;
  openRoles: boolean;
  openers: boolean;
  digestFrequencies: ("daily" | "weekly" | "off")[];
}

export const FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    ...FREE_LIMITS,
    plan: "free",
    maxProfiles: 1,
    maxWatchlist: 5,
    openRoles: false,
    openers: false,
    digestFrequencies: ["weekly", "off"],
  },
  pro: {
    ...PRO_LIMITS,
    plan: "pro",
    maxProfiles: 3,
    maxWatchlist: 25,
    openRoles: true,
    openers: true,
    digestFrequencies: ["daily", "weekly", "off"],
  },
};

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
