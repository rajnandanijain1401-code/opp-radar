"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UserProfileSchema, type Signal } from "@opp-radar/core";
import { renderWelcome } from "@opp-radar/emails";
import { footerView } from "@opp-radar/core";
import { requireUser } from "@/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { linksFor, sendEmail } from "@/lib/mailer";
import { featuresFor } from "@/lib/plan";
import { previewMatches } from "@/lib/profile";

const DraftSchema = z.object({
  roles: UserProfileSchema.shape.roles,
  seniority: z.string().max(40).nullable().optional(),
  sectors: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  geographies: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
  watchlist_companies: z.array(z.string().trim().min(1).max(80)).max(25).default([]),
  include_keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  exclude_keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  instant_alerts_enabled: z.boolean().default(true),
  digest_frequency: z.enum(["daily", "weekly", "off"]).default("daily"),
  digest_hour_local: z.number().int().min(0).max(23).default(8),
  timezone: z.string().max(60).default("Asia/Kolkata"),
});
export type Draft = z.input<typeof DraftSchema>;

function validTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Kolkata";
  }
}

export async function previewAction(
  draft: Draft,
): Promise<{ items: { signal: Signal; score: number; reasons: string[] }[] }> {
  const user = await requireUser();
  if (!user) return { items: [] };
  const d = DraftSchema.parse(draft);
  const profile = UserProfileSchema.parse({ ...d, timezone: validTimezone(d.timezone) });
  const matches = await previewMatches(profile, 7, 8);
  return {
    items: matches.map((m) => ({
      signal: m.signal,
      score: m.score.final,
      reasons: m.score.reasons,
    })),
  };
}

export async function completeOnboarding(draft: Draft): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!user) redirect("/signup");
  const parsed = DraftSchema.safeParse(draft);
  if (!parsed.success) return { error: "Some answers look invalid. Please review and try again." };
  const features = await featuresFor(user.id);
  const d = parsed.data;
  const profile = UserProfileSchema.parse({
    ...d,
    name: "My radar",
    watchlist_companies: d.watchlist_companies.slice(0, features.maxWatchlist),
    digest_frequency:
      features.plan === "free" && d.digest_frequency === "daily" ? "weekly" : d.digest_frequency,
    instant_alerts_enabled: features.instant && d.instant_alerts_enabled,
    timezone: validTimezone(d.timezone),
  });
  const existing = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, user.id));
  if (existing.length) {
    await db
      .update(schema.profiles)
      .set({ data: profile, updatedAt: new Date() })
      .where(eq(schema.profiles.id, existing[0]!.id));
  } else {
    await db
      .insert(schema.profiles)
      .values({ userId: user.id, name: "My radar", isPrimary: true, data: profile });
  }
  const firstTime = !user.onboardedAt;
  await db
    .update(schema.users)
    .set({
      onboardedAt: user.onboardedAt ?? new Date(),
      timezone: profile.timezone,
      unsubscribedAt: null,
    })
    .where(eq(schema.users.id, user.id));
  if (firstTime) {
    const links = linksFor(user.id);
    const rendered = await renderWelcome({
      name: user.name,
      dashboardUrl: `${env().RADAR_PUBLIC_URL}/dashboard`,
      footer: footerView(links, {
        physicalAddress: env().RADAR_PHYSICAL_ADDRESS,
        appUrl: env().RADAR_PUBLIC_URL,
      }),
    });
    try {
      await sendEmail({ to: user.email, userId: user.id, ...rendered, category: "welcome" });
    } catch (err) {
      console.error("welcome email failed", err);
    }
  }
  redirect("/dashboard?welcome=1");
}
