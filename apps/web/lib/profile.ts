import { and, desc, eq, gte } from "drizzle-orm";
import {
  routeSignals,
  UserProfileSchema,
  type ScoredSignal,
  type UserProfile,
} from "@opp-radar/core";
import { db, schema } from "./db";
import { rowToSignal } from "./store";

export const SECTOR_OPTIONS = [
  "fintech",
  "ai",
  "saas",
  "devtools",
  "healthtech",
  "biotech",
  "edtech",
  "commerce",
  "mobility",
  "cybersecurity",
  "climate",
  "agritech",
  "proptech",
  "gaming",
];

export const GEO_OPTIONS = [
  "India",
  "Bengaluru",
  "Mumbai",
  "Delhi NCR",
  "Pune",
  "Hyderabad",
  "Chennai",
  "United States",
  "San Francisco",
  "New York",
  "United Kingdom",
  "Europe",
  "Singapore",
  "UAE",
  "Remote",
];

export const ROLE_OPTIONS: { id: UserProfile["roles"][number]; label: string }[] = [
  { id: "engineering", label: "Engineering" },
  { id: "product", label: "Product" },
  { id: "design", label: "Design" },
  { id: "data", label: "Data / ML" },
  { id: "sales", label: "Sales" },
  { id: "marketing", label: "Marketing / Growth" },
  { id: "ops", label: "Operations" },
  { id: "finance", label: "Finance" },
  { id: "hr", label: "People / HR" },
  { id: "customer_success", label: "Customer success" },
  { id: "leadership", label: "Leadership" },
];

export async function primaryProfile(
  userId: string,
): Promise<{ id: string; data: UserProfile } | null> {
  const rows = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .orderBy(desc(schema.profiles.isPrimary), schema.profiles.createdAt)
    .limit(1);
  return rows[0] ? { id: rows[0].id, data: UserProfileSchema.parse(rows[0].data) } : null;
}

/** "Here is what you would have received": score the last N days against a draft profile. */
export async function previewMatches(
  profile: UserProfile,
  days = 7,
  limit = 12,
): Promise<ScoredSignal[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select()
    .from(schema.signals)
    .where(and(gte(schema.signals.publishedAt, since), eq(schema.signals.isPrimary, true)))
    .orderBy(desc(schema.signals.publishedAt))
    .limit(400);
  const routed = routeSignals({
    signals: rows.map(rowToSignal),
    profile: { ...profile, instant_alerts_enabled: true, max_instant_per_day: 1000 },
    now: new Date(),
    sentClusterIds: new Set(),
    instantSentToday: 0,
  });
  return [...routed.instant, ...routed.digest]
    .sort((a, b) => b.score.final - a.score.final)
    .slice(0, limit);
}
