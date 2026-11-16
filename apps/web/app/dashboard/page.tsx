import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { EVENT_LABELS, EVENT_TYPES, routeSignals, type UserProfile } from "@opp-radar/core";
import { requireUser } from "@/auth";
import { SignalCard } from "@/components/signal-card";
import { EmailForm } from "@/components/email-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { featuresFor } from "@/lib/plan";
import { mergeRouted, userProfiles } from "@/lib/pipeline";
import { ROLE_OPTIONS } from "@/lib/profile";
import { recentSignals } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  deleteAccount,
  deleteProfile,
  rateSignal,
  saveDelivery,
  saveProfile,
  saveWatchlist,
  signOutAction,
} from "./actions";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

const TABS = [
  ["feed", "Feed"],
  ["watchlist", "Watchlist"],
  ["profiles", "Profiles"],
  ["delivery", "Delivery settings"],
  ["billing", "Billing"],
] as const;

type Search = {
  tab?: string;
  type?: string;
  days?: string;
  min?: string;
  saved?: string;
  error?: string;
  welcome?: string;
  billing?: string;
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  if (!user) redirect("/signup");
  const sp = await searchParams;
  const features = await featuresFor(user.id);
  const profiles = await userProfiles(user.id, 10);
  if (!profiles.length) redirect("/onboarding");
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "feed";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-faint">{user.email}</p>
          <h1 className="font-display text-5xl">Your radar</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold uppercase",
              features.plan === "pro" ? "bg-ink text-white" : "bg-ink/5 text-muted",
            )}
          >
            {features.plan}
          </span>
          <form action={signOutAction}>
            <Button variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
      {sp.welcome ? (
        <p className="mt-6 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
          Your radar is live. We sent a welcome email. Alerts start with the next pipeline run.
        </p>
      ) : null}
      {user.unsubscribedAt ? (
        <p className="mt-6 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
          Emails are paused because you unsubscribed. Turn them back on in Delivery settings.
        </p>
      ) : null}
      <nav
        className="mt-8 flex gap-1 overflow-x-auto border-b border-line"
        aria-label="Dashboard sections"
      >
        {TABS.map(([id, label]) => (
          <Link
            key={id}
            href={`/dashboard?tab=${id}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold",
              tab === id
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-8">
        {tab === "feed" && <Feed userId={user.id} sp={sp} />}
        {tab === "watchlist" && (
          <Watchlist profile={profiles[0]!.data} max={features.maxWatchlist} saved={!!sp.saved} />
        )}
        {tab === "profiles" && (
          <Profiles
            profiles={profiles}
            max={features.maxProfiles}
            saved={!!sp.saved}
            error={sp.error}
          />
        )}
        {tab === "delivery" && (
          <Delivery
            profile={profiles[0]!.data}
            emailEnabled={!user.unsubscribedAt}
            canInstant={features.instant}
            canDaily={features.digestFrequencies.includes("daily")}
            saved={!!sp.saved}
            error={sp.error}
          />
        )}
        {tab === "billing" && <Billing plan={features.plan} status={sp.billing} />}
      </div>
    </div>
  );
}

async function Feed({ userId, sp }: { userId: string; sp: Search }) {
  const features = await featuresFor(userId);
  const profiles = await userProfiles(userId, features.maxProfiles);
  const days = Math.min(30, Math.max(1, Number(sp.days ?? 7)));
  const min = Math.min(100, Math.max(0, Number(sp.min ?? 40)));
  const signals = (await recentSignals({ sinceHours: days * 24, limit: 1000 })).filter(
    (s) => !sp.type || s.event_type === sp.type,
  );
  const merged = mergeRouted(
    profiles.map((p) => ({
      profileId: p.id,
      items: (() => {
        const r = routeSignals({
          signals,
          profile: { ...p.data, instant_alerts_enabled: true, max_instant_per_day: 1000 },
          now: new Date(),
          sentClusterIds: new Set(),
          instantSentToday: 0,
          scoring: {
            weights: { hiring: 0.45, relevance: 0.35, recency: 0.1, source_quality: 0.1 },
            recency_half_life_hours: 24,
            digest_min_score: min,
          },
        });
        return [...r.instant, ...r.digest];
      })(),
    })),
  ).slice(0, 60);
  const ratings = merged.length
    ? await db
        .select()
        .from(schema.feedback)
        .where(
          and(
            eq(schema.feedback.userId, userId),
            inArray(
              schema.feedback.signalId,
              merged.map((m) => m.signal.id),
            ),
          ),
        )
    : [];
  const ratingOf = new Map(ratings.map((r) => [r.signalId, r.rating]));

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <form
        className="space-y-4 self-start rounded-xl border border-line bg-card p-4"
        method="get"
        aria-label="Filters"
      >
        <input type="hidden" name="tab" value="feed" />
        <div>
          <Label htmlFor="type">Event type</Label>
          <Select id="type" name="type" defaultValue={sp.type ?? ""}>
            <option value="">All types</option>
            {EVENT_TYPES.filter((t) => t !== "other").map((t) => (
              <option key={t} value={t}>
                {EVENT_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="days">Date</Label>
          <Select id="days" name="days" defaultValue={String(days)}>
            <option value="1">Last 24 hours</option>
            <option value="3">Last 3 days</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="min">Minimum score</Label>
          <Select id="min" name="min" defaultValue={String(min)}>
            {[0, 40, 50, 60, 75].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "Any" : `${v}+`}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm" className="w-full">
          Apply
        </Button>
      </form>
      <div className="grid gap-4" data-testid="feed">
        {merged.length ? (
          merged.map((m) => (
            <SignalCard
              key={m.signal.id}
              signal={m.signal}
              score={m.score.final}
              reasons={m.score.reasons}
              showOpener={features.openers}
              showRoles={features.openRoles}
              feedback={<Feedback signalId={m.signal.id} rating={ratingOf.get(m.signal.id)} />}
            />
          ))
        ) : (
          <Card className="text-sm text-muted">
            No signals match these filters yet. Widen the date range or lower the minimum score.
          </Card>
        )}
      </div>
    </div>
  );
}

function Feedback({ signalId, rating }: { signalId: string; rating?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <form action={rateSignal.bind(null, signalId, 1)}>
        <button
          aria-label="Useful"
          className={cn("rounded p-1 hover:bg-ink/5", rating === 1 && "text-good")}
        >
          <ThumbsUp className="h-4 w-4" />
        </button>
      </form>
      <form action={rateSignal.bind(null, signalId, -1)}>
        <button
          aria-label="Not useful"
          className={cn("rounded p-1 hover:bg-ink/5", rating === -1 && "text-accent")}
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
      </form>
    </span>
  );
}

function Saved({ show, text = "Saved." }: { show: boolean; text?: string }) {
  return show ? (
    <p className="mb-4 rounded-lg bg-good-soft px-4 py-2 text-sm text-good">{text}</p>
  ) : null;
}

function Watchlist({
  profile,
  max,
  saved,
}: {
  profile: { watchlist_companies: string[] };
  max: number;
  saved: boolean;
}) {
  return (
    <Card className="max-w-2xl">
      <Saved show={saved} />
      <h2 className="text-lg font-semibold">Companies you are watching</h2>
      <p className="mt-1 text-sm text-muted">
        Any signal about these companies gets full relevance. One per line or comma separated. Your
        plan allows {max}.
      </p>
      <form action={saveWatchlist} className="mt-4 space-y-3">
        <textarea
          name="companies"
          aria-label="Watchlist companies"
          defaultValue={profile.watchlist_companies.join("\n")}
          rows={8}
          className="w-full rounded-lg border border-line bg-card p-3 text-sm focus:border-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <Button type="submit">Save watchlist</Button>
      </form>
    </Card>
  );
}

function Profiles({
  profiles,
  max,
  saved,
  error,
}: {
  profiles: { id: string; data: UserProfile }[];
  max: number;
  saved: boolean;
  error?: string;
}) {
  const forms = profiles.length < max ? [...profiles, null] : profiles;
  return (
    <div className="space-y-6">
      <Saved show={saved} />
      {error === "limit" ? (
        <p className="text-sm text-accent">Your plan allows {max} profile(s).</p>
      ) : null}
      <p className="text-sm text-muted">
        Profiles let you track different searches (for example product roles in fintech and
        engineering roles in AI). Your plan allows {max}.
      </p>
      {forms.map((p, i) => (
        <Card key={p?.id ?? "new"}>
          <form action={saveProfile} className="grid gap-4 md:grid-cols-2">
            {p ? <input type="hidden" name="id" value={p.id} /> : null}
            <div className="md:col-span-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{p ? p.data.name : "New profile"}</h2>
              {i === 0 && p ? (
                <span className="text-xs font-semibold uppercase text-faint">Primary</span>
              ) : null}
            </div>
            <div>
              <Label>Name</Label>
              <Input
                name="name"
                defaultValue={p?.data.name ?? "Second radar"}
                required
                maxLength={40}
              />
            </div>
            <div>
              <Label>Instant alert threshold</Label>
              <Input
                name="instant_threshold"
                type="number"
                min={40}
                max={100}
                defaultValue={p?.data.instant_threshold ?? 75}
              />
            </div>
            <fieldset className="md:col-span-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-3">
                {ROLE_OPTIONS.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="roles"
                      value={r.id}
                      defaultChecked={p?.data.roles.includes(r.id)}
                      className="accent-[#e8551e]"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <Label>Sectors</Label>
              <Input
                name="sectors"
                defaultValue={p?.data.sectors.join(", ")}
                placeholder="fintech, ai"
              />
            </div>
            <div>
              <Label>Geographies</Label>
              <Input
                name="geographies"
                defaultValue={p?.data.geographies.join(", ")}
                placeholder="India, Remote"
              />
            </div>
            <div>
              <Label>Include keywords</Label>
              <Input
                name="include_keywords"
                defaultValue={p?.data.include_keywords.join(", ")}
                placeholder="payments"
              />
            </div>
            <div>
              <Label>Exclude keywords</Label>
              <Input
                name="exclude_keywords"
                defaultValue={p?.data.exclude_keywords.join(", ")}
                placeholder="crypto"
              />
            </div>
            <div>
              <Label>Minimum round size (USD)</Label>
              <Input
                name="min_amount_usd"
                type="number"
                min={0}
                defaultValue={p?.data.min_amount_usd ?? ""}
                placeholder="e.g. 5000000"
              />
            </div>
            <fieldset className="md:col-span-2">
              <Label>Event types (none checked means all)</Label>
              <div className="flex flex-wrap gap-3">
                {EVENT_TYPES.filter((t) => t !== "other").map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="event_types"
                      value={t}
                      defaultChecked={p?.data.event_types.includes(t)}
                      className="accent-[#e8551e]"
                    />
                    {EVENT_LABELS[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit">{p ? "Save profile" : "Add profile"}</Button>
            </div>
          </form>
          {p && i > 0 ? (
            <form action={deleteProfile} className="mt-3">
              <input type="hidden" name="id" value={p.id} />
              <Button variant="link" size="sm" type="submit">
                Delete this profile
              </Button>
            </form>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function Delivery({
  profile,
  emailEnabled,
  canInstant,
  canDaily,
  saved,
  error,
}: {
  profile: UserProfile;
  emailEnabled: boolean;
  canInstant: boolean;
  canDaily: boolean;
  saved: boolean;
  error?: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <Saved show={saved} />
        <form action={saveDelivery} className="grid gap-5 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input
              type="checkbox"
              name="email_enabled"
              defaultChecked={emailEnabled}
              className="h-4 w-4 accent-[#e8551e]"
            />
            Send me emails
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input
              type="checkbox"
              name="instant_alerts_enabled"
              defaultChecked={profile.instant_alerts_enabled && canInstant}
              disabled={!canInstant}
              className="h-4 w-4 accent-[#e8551e]"
            />
            Instant alerts {canInstant ? "" : "(Pro)"}
          </label>
          <div>
            <Label htmlFor="instant_threshold">Instant threshold</Label>
            <Input
              id="instant_threshold"
              name="instant_threshold"
              type="number"
              min={40}
              max={100}
              defaultValue={profile.instant_threshold}
            />
          </div>
          <div>
            <Label htmlFor="max_instant_per_day">Max instant alerts per day</Label>
            <Input
              id="max_instant_per_day"
              name="max_instant_per_day"
              type="number"
              min={1}
              max={20}
              defaultValue={profile.max_instant_per_day}
            />
          </div>
          <div>
            <Label htmlFor="digest_frequency">Digest</Label>
            <Select
              id="digest_frequency"
              name="digest_frequency"
              defaultValue={profile.digest_frequency}
            >
              {canDaily ? <option value="daily">Daily</option> : null}
              <option value="weekly">Weekly (Mondays)</option>
              <option value="off">Off</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="digest_hour_local">Delivery hour</Label>
            <Select
              id="digest_hour_local"
              name="digest_hour_local"
              defaultValue={String(profile.digest_hour_local)}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" name="timezone" defaultValue={profile.timezone} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Save delivery settings</Button>
          </div>
        </form>
      </Card>
      <div className="space-y-6">
        <Card>
          <h2 className="font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-muted">Download everything we store about you as JSON.</p>
          <a
            href="/api/account/export"
            className="mt-3 inline-block text-sm font-semibold text-accent underline underline-offset-2"
          >
            Export my data
          </a>
        </Card>
        <Card className="border-accent/40">
          <h2 className="font-semibold">Delete account</h2>
          <p className="mt-1 text-sm text-muted">
            Removes your profile, deliveries, feedback and subscription records. This cannot be
            undone.
          </p>
          <form action={deleteAccount} className="mt-3 space-y-2">
            <Label htmlFor="confirm">Type DELETE to confirm</Label>
            <Input id="confirm" name="confirm" autoComplete="off" />
            {error === "confirm" ? (
              <p className="text-xs text-accent">Type DELETE in capitals.</p>
            ) : null}
            <Button type="submit" variant="outline" size="sm" className="text-accent">
              Delete my account
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Billing({ plan, status }: { plan: "free" | "pro"; status?: string }) {
  const billing = env().BILLING_ENABLED;
  return (
    <Card className="max-w-2xl">
      {status === "success" ? (
        <p className="mb-4 rounded-lg bg-good-soft px-4 py-2 text-sm text-good">
          Payment received. Pro will activate as soon as the provider confirms it.
        </p>
      ) : null}
      <h2 className="text-lg font-semibold">You are on {plan === "pro" ? "Pro" : "Free"}</h2>
      {!billing ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Billing is off during the beta, so everyone gets every Pro feature for free. Join the
            waitlist to lock in launch pricing (₹299 or $5 a month).
          </p>
          <EmailForm kind="waitlist" cta="Join Pro waitlist" size="default" className="mt-4" />
        </>
      ) : plan === "pro" ? (
        <p className="mt-2 text-sm text-muted">
          Thanks for supporting OppRadar. Manage or cancel your subscription from the receipt email
          of your payment provider, or contact us.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <form action="/api/billing/checkout" method="post">
            <input type="hidden" name="provider" value="razorpay" />
            <Button type="submit" variant="accent" className="w-full">
              Pay ₹299/month (UPI, cards)
            </Button>
          </form>
          <form action="/api/billing/checkout" method="post">
            <input type="hidden" name="provider" value="stripe" />
            <Button type="submit" variant="outline" className="w-full">
              Pay $5/month (international)
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
