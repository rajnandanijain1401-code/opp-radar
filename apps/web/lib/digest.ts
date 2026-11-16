import { eq } from "drizzle-orm";
import {
  buildDigestView,
  isDigestDue,
  routeSignals,
  selectDigest,
  type ScoredSignal,
} from "@opp-radar/core";
import { renderDigest } from "@opp-radar/emails";
import { db, schema } from "./db";
import { env } from "./env";
import { linksFor, sendEmail } from "./mailer";
import { FEATURES, planFor } from "./plan";
import { activeUsers, deliveredClusters, mergeRouted, userProfiles } from "./pipeline";
import { recentSignals } from "./store";

/**
 * Hourly job: send the digest to every user whose chosen local hour is now.
 * Pro: daily (or weekly if chosen), top 15. Free: weekly, top 10.
 */
export async function runDigest(now = new Date(), opts: { force?: boolean; userId?: string } = {}) {
  let sentEmails = 0;
  let items = 0;
  const users = (await activeUsers()).filter((u) => !opts.userId || u.id === opts.userId);
  for (const user of users) {
    const features = FEATURES[await planFor(user.id)];
    const profiles = await userProfiles(user.id, features.maxProfiles);
    if (!profiles.length) continue;
    const primary = profiles[0]!.data;
    const frequency: "daily" | "weekly" | "off" =
      primary.digest_frequency === "off"
        ? "off"
        : features.plan === "free"
          ? "weekly"
          : primary.digest_frequency;
    const delivery = { ...primary, digest_frequency: frequency };
    if (!opts.force && !isDigestDue(delivery, user.lastDigestAt?.toISOString(), now)) continue;
    if (frequency === "off") continue;

    const windowHours = frequency === "weekly" ? 7 * 24 : 30;
    const signals = await recentSignals({ sinceHours: windowHours });
    const sent = await deliveredClusters(user.id);
    const merged = mergeRouted(
      profiles.map((p) => ({
        profileId: p.id,
        items: routeSignals({
          signals: signals.filter((s) => !sent.has(s.cluster_id)),
          profile: { ...p.data, instant_alerts_enabled: false },
          now,
          sentClusterIds: sent,
          instantSentToday: 0,
          limits: features,
        }).digest,
      })),
    );
    const picked = selectDigest(merged, features.digest_max_items);
    if (!picked.top) continue;
    const view = buildDigestView(picked, {
      links: linksFor(user.id),
      pro: features.openers,
      physicalAddress: env().RADAR_PHYSICAL_ADDRESS,
      appUrl: env().RADAR_PUBLIC_URL,
      kind: frequency === "weekly" ? "weekly" : "daily",
      now,
      timezone: primary.timezone,
    });
    const rendered = await renderDigest(view);
    await sendEmail({ to: user.email, userId: user.id, ...rendered, category: "digest" });
    const all: ScoredSignal[] = [picked.top, ...picked.groups.flatMap(([, g]) => g)];
    for (const it of all) {
      await db
        .insert(schema.deliveries)
        .values({
          userId: user.id,
          signalId: it.signal.id,
          clusterId: it.signal.cluster_id,
          channel: "digest",
          status: "sent",
          score: it.score.final,
          sentAt: now,
        })
        .onConflictDoNothing();
    }
    await db.update(schema.users).set({ lastDigestAt: now }).where(eq(schema.users.id, user.id));
    sentEmails++;
    items += all.length;
  }
  return { emails: sentEmails, items };
}
