"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UserProfileSchema } from "@opp-radar/core";
import { requireUser, signOut } from "@/auth";
import { db, schema } from "@/lib/db";
import { featuresFor } from "@/lib/plan";
import { rateLimit } from "@/lib/ratelimit";

async function me() {
  const user = await requireUser();
  if (!user) redirect("/signup");
  return user;
}

export async function rateSignal(signalId: string, rating: 1 | -1) {
  const user = await me();
  if (!(await rateLimit(`feedback:${user.id}`, 120, 3600))) return;
  const id = z.string().max(80).parse(signalId);
  await db
    .insert(schema.feedback)
    .values({ userId: user.id, signalId: id, rating })
    .onConflictDoUpdate({
      target: [schema.feedback.userId, schema.feedback.signalId],
      set: { rating, createdAt: new Date() },
    });
  revalidatePath("/dashboard");
}

const list = (max: number) =>
  z
    .string()
    .max(4000)
    .transform((s) =>
      [
        ...new Set(
          s
            .split(/[,\n]/)
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ].slice(0, max),
    );

async function loadProfile(userId: string, profileId?: string) {
  const rows = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));
  const row = profileId
    ? rows.find((r) => r.id === profileId)
    : (rows.find((r) => r.isPrimary) ?? rows[0]);
  return row ?? null;
}

export async function saveWatchlist(formData: FormData) {
  const user = await me();
  const features = await featuresFor(user.id);
  const companies = list(features.maxWatchlist).parse(formData.get("companies") ?? "");
  const row = await loadProfile(user.id);
  if (!row) redirect("/onboarding");
  const data = UserProfileSchema.parse({ ...row.data, watchlist_companies: companies });
  await db
    .update(schema.profiles)
    .set({ data, updatedAt: new Date() })
    .where(eq(schema.profiles.id, row.id));
  revalidatePath("/dashboard");
  redirect("/dashboard?tab=watchlist&saved=1");
}

const ProfileForm = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(40),
  roles: z.array(z.string()),
  sectors: list(15),
  geographies: list(15),
  include_keywords: list(20),
  exclude_keywords: list(20),
  event_types: z.array(z.string()),
  min_amount_usd: z.string().optional(),
  instant_threshold: z.coerce.number().int().min(40).max(100),
});

export async function saveProfile(formData: FormData) {
  const user = await me();
  const features = await featuresFor(user.id);
  const parsed = ProfileForm.parse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    roles: formData.getAll("roles"),
    sectors: formData.get("sectors") ?? "",
    geographies: formData.get("geographies") ?? "",
    include_keywords: formData.get("include_keywords") ?? "",
    exclude_keywords: formData.get("exclude_keywords") ?? "",
    event_types: formData.getAll("event_types"),
    min_amount_usd: (formData.get("min_amount_usd") as string) || undefined,
    instant_threshold: formData.get("instant_threshold") ?? 75,
  });
  const primary = await loadProfile(user.id);
  const base = parsed.id ? await loadProfile(user.id, parsed.id) : null;
  const delivery = primary?.data ?? UserProfileSchema.parse({});
  const data = UserProfileSchema.parse({
    ...(base?.data ?? delivery),
    name: parsed.name,
    roles: parsed.roles,
    sectors: parsed.sectors,
    geographies: parsed.geographies,
    include_keywords: parsed.include_keywords,
    exclude_keywords: parsed.exclude_keywords,
    event_types: parsed.event_types,
    min_amount_usd: parsed.min_amount_usd ? Number(parsed.min_amount_usd) : null,
    instant_threshold: parsed.instant_threshold,
    watchlist_companies: (base?.data ?? delivery).watchlist_companies ?? [],
  });
  if (base) {
    await db
      .update(schema.profiles)
      .set({ name: parsed.name, data, updatedAt: new Date() })
      .where(eq(schema.profiles.id, base.id));
  } else {
    const count = (
      await db
        .select({ id: schema.profiles.id })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, user.id))
    ).length;
    if (count >= features.maxProfiles) redirect("/dashboard?tab=profiles&error=limit");
    await db
      .insert(schema.profiles)
      .values({ userId: user.id, name: parsed.name, isPrimary: count === 0, data });
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?tab=profiles&saved=1");
}

export async function deleteProfile(formData: FormData) {
  const user = await me();
  const id = z.string().parse(formData.get("id"));
  const row = await loadProfile(user.id, id);
  if (row && !row.isPrimary) {
    await db
      .delete(schema.profiles)
      .where(and(eq(schema.profiles.id, id), eq(schema.profiles.userId, user.id)));
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?tab=profiles");
}

const DeliveryForm = z.object({
  instant_alerts_enabled: z.boolean(),
  instant_threshold: z.coerce.number().int().min(40).max(100),
  max_instant_per_day: z.coerce.number().int().min(1).max(20),
  digest_frequency: z.enum(["daily", "weekly", "off"]),
  digest_hour_local: z.coerce.number().int().min(0).max(23),
  timezone: z.string().max(60),
  email_enabled: z.boolean(),
});

export async function saveDelivery(formData: FormData) {
  const user = await me();
  const features = await featuresFor(user.id);
  const f = DeliveryForm.parse({
    instant_alerts_enabled: formData.get("instant_alerts_enabled") === "on",
    instant_threshold: formData.get("instant_threshold"),
    max_instant_per_day: formData.get("max_instant_per_day"),
    digest_frequency: formData.get("digest_frequency"),
    digest_hour_local: formData.get("digest_hour_local"),
    timezone: formData.get("timezone"),
    email_enabled: formData.get("email_enabled") === "on",
  });
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: f.timezone });
  } catch {
    f.timezone = "Asia/Kolkata";
  }
  const rows = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id));
  for (const r of rows) {
    const data = UserProfileSchema.parse({
      ...r.data,
      instant_alerts_enabled: features.instant && f.instant_alerts_enabled,
      instant_threshold: f.instant_threshold,
      max_instant_per_day: f.max_instant_per_day,
      digest_frequency: features.digestFrequencies.includes(f.digest_frequency)
        ? f.digest_frequency
        : "weekly",
      digest_hour_local: f.digest_hour_local,
      timezone: f.timezone,
    });
    await db
      .update(schema.profiles)
      .set({ data, updatedAt: new Date() })
      .where(eq(schema.profiles.id, r.id));
  }
  await db
    .update(schema.users)
    .set({
      timezone: f.timezone,
      unsubscribedAt: f.email_enabled ? null : (user.unsubscribedAt ?? new Date()),
    })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/dashboard");
  redirect("/dashboard?tab=delivery&saved=1");
}

/** DPDP / GDPR: delete everything. Cascades remove profiles, sessions, deliveries, feedback, subscriptions. */
export async function deleteAccount(formData: FormData) {
  const user = await me();
  if (formData.get("confirm") !== "DELETE") redirect("/dashboard?tab=delivery&error=confirm");
  await db.delete(schema.waitlist).where(eq(schema.waitlist.email, user.email));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  await signOut({ redirectTo: "/?deleted=1" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
