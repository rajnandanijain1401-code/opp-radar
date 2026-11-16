import { FREE_LIMITS, PRO_LIMITS, type PlanLimits } from "@opp-radar/core/route/route";

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
