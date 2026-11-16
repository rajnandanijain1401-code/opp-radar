import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, gte, sql } from "drizzle-orm";
import { requireUser } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db, schema } from "@/lib/db";
import { isAdmin } from "@/lib/env";
import { runDigest } from "@/lib/digest";
import { runPipeline } from "@/lib/pipeline";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function guard() {
  const user = await requireUser();
  if (!user) redirect("/signup");
  if (!isAdmin(user.email)) notFound();
  return user;
}

async function runNow() {
  "use server";
  await guard();
  await runPipeline({ trigger: "admin" });
  revalidatePath("/admin");
}

async function digestNow() {
  "use server";
  const user = await guard();
  await runDigest(new Date(), { force: true, userId: user.id });
  revalidatePath("/admin");
}

export default async function AdminPage() {
  await guard();
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const [sourceRows, runs, perDay, userCount, deliveryStats, events, waitlistCount] =
    await Promise.all([
      db.select().from(schema.sources).orderBy(schema.sources.id),
      db.select().from(schema.pipelineRuns).orderBy(desc(schema.pipelineRuns.startedAt)).limit(12),
      db
        .select({
          day: sql<string>`to_char(${schema.signals.publishedAt}, 'YYYY-MM-DD')`,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.signals)
        .where(gte(schema.signals.publishedAt, new Date(Date.now() - 14 * 86_400_000)))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db
        .select({
          n: sql<number>`count(*)::int`,
          onboarded: sql<number>`count(${schema.users.onboardedAt})::int`,
        })
        .from(schema.users),
      db
        .select({ channel: schema.deliveries.channel, n: sql<number>`count(*)::int` })
        .from(schema.deliveries)
        .where(gte(schema.deliveries.createdAt, since7))
        .groupBy(schema.deliveries.channel),
      db
        .select({ type: schema.emailEvents.type, n: sql<number>`count(*)::int` })
        .from(schema.emailEvents)
        .where(gte(schema.emailEvents.createdAt, since7))
        .groupBy(schema.emailEvents.type),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.waitlist),
    ]);
  const lastRuns = await db
    .select({
      sourceId: schema.sourceRuns.sourceId,
      items: schema.sourceRuns.itemsFetched,
      ms: schema.sourceRuns.durationMs,
      error: schema.sourceRuns.error,
      at: schema.sourceRuns.startedAt,
    })
    .from(schema.sourceRuns)
    .orderBy(desc(schema.sourceRuns.startedAt))
    .limit(200);
  const latest = new Map<string, (typeof lastRuns)[number]>();
  for (const r of lastRuns) if (!latest.has(r.sourceId)) latest.set(r.sourceId, r);
  const sent = deliveryStats.reduce((n, d) => n + d.n, 0);
  const bounces = events.find((e) => e.type === "email.bounced")?.n ?? 0;
  const complaints = events.find((e) => e.type === "email.complained")?.n ?? 0;
  const max = Math.max(1, ...perDay.map((d) => d.n));
  const pct = (n: number) => (sent ? `${((n / sent) * 100).toFixed(2)}%` : "0%");

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-5xl">Admin</h1>
        <div className="flex gap-2">
          <form action={digestNow}>
            <Button variant="outline">Send my digest now</Button>
          </form>
          <form action={runNow}>
            <Button variant="accent">Run pipeline now</Button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Users", `${userCount[0]?.n ?? 0}`, `${userCount[0]?.onboarded ?? 0} onboarded`],
          [
            "Deliveries (7d)",
            `${sent}`,
            deliveryStats.map((d) => `${d.channel} ${d.n}`).join(", ") || "none",
          ],
          [
            "Bounce / complaint",
            `${pct(bounces)} / ${pct(complaints)}`,
            `${bounces} bounces, ${complaints} complaints`,
          ],
          ["Pro waitlist", `${waitlistCount[0]?.n ?? 0}`, "emails"],
        ].map(([k, v, sub]) => (
          <Card key={k}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</p>
            <p className="mt-2 font-display text-4xl">{v}</p>
            <p className="mt-1 text-xs text-faint">{sub}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-semibold">Signals per day (14 days)</h2>
        <div
          className="mt-4 flex h-40 items-end gap-1.5"
          role="img"
          aria-label="Signals per day bar chart"
        >
          {perDay.map((d) => (
            <div key={d.day} className="group flex flex-1 flex-col items-center justify-end gap-1">
              <span className="font-mono text-[10px] text-muted">{d.n}</span>
              <div
                className="w-full rounded-t bg-accent"
                style={{ height: `${(d.n / max) * 100}%` }}
                title={`${d.day}: ${d.n}`}
              />
              <span className="font-mono text-[9px] text-faint">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="font-semibold">Source health</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2">Source</th>
              <th>Enabled</th>
              <th>Last run</th>
              <th>Items</th>
              <th>Last items</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sourceRows.map((s) => {
              const r = latest.get(s.id);
              const stale =
                s.enabled &&
                (!s.lastItemsAt || Date.now() - s.lastItemsAt.getTime() > 24 * 3_600_000);
              return (
                <tr key={s.id}>
                  <td className="py-2 font-mono text-xs">{s.id}</td>
                  <td>{s.enabled ? "yes" : "no"}</td>
                  <td className="text-muted">{r ? timeAgo(r.at.toISOString()) : "never"}</td>
                  <td>{r?.items ?? "-"}</td>
                  <td className="text-muted">
                    {s.lastItemsAt ? timeAgo(s.lastItemsAt.toISOString()) : "-"}
                  </td>
                  <td>
                    {!s.enabled ? (
                      <span className="text-faint">disabled</span>
                    ) : r?.error ? (
                      <span className="text-accent" title={r.error}>
                        error
                      </span>
                    ) : stale ? (
                      <span className="text-accent">unhealthy</span>
                    ) : (
                      <span className="text-good">healthy</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="font-semibold">Last pipeline runs</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2">Started</th>
              <th>Trigger</th>
              <th>Mode</th>
              <th>Counts</th>
              <th>Tokens</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="py-2 text-muted">{timeAgo(r.startedAt.toISOString())}</td>
                <td>{r.trigger}</td>
                <td>{r.mode}</td>
                <td className="font-mono text-xs">
                  {Object.entries(r.counts)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ")}
                </td>
                <td className="font-mono text-xs">{r.inputTokens + r.outputTokens}</td>
                <td>
                  {r.error ? (
                    <span className="text-accent">{r.error.slice(0, 60)}</span>
                  ) : r.finishedAt ? (
                    "ok"
                  ) : (
                    "running"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
