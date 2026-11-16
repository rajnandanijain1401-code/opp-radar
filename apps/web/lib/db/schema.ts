import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { OtherSource, UserProfile } from "@opp-radar/core/schemas";

const ts = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

/* ---------------- Auth.js tables (users is extended with our columns) ---------------- */

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: ts("emailVerified"),
  image: text("image"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  onboardedAt: ts("onboarded_at"),
  unsubscribedAt: ts("unsubscribed_at"),
  suppressedAt: ts("suppressed_at"),
  suppressedReason: text("suppressed_reason"),
  lastInstantAt: ts("last_instant_at"),
  lastDigestAt: ts("last_digest_at"),
  instantCountDate: text("instant_count_date"),
  instantCount: integer("instant_count").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: ts("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: ts("expires").notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ---------------- OppRadar tables ---------------- */

export const profiles = pgTable(
  "profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("My radar"),
    isPrimary: boolean("is_primary").notNull().default(false),
    data: jsonb("data").$type<UserProfile>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("profiles_user_idx").on(t.userId)],
);

export const signals = pgTable(
  "signals",
  {
    id: text("id").primaryKey(),
    contentHash: text("content_hash").notNull().unique(),
    canonicalUrl: text("canonical_url").notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceQuality: integer("source_quality").notNull().default(50),
    title: text("title").notNull(),
    titleKey: text("title_key").notNull(),
    publishedAt: ts("published_at").notNull(),
    fetchedAt: ts("fetched_at").notNull(),
    companyName: text("company_name").notNull(),
    companyDomain: text("company_domain"),
    eventType: text("event_type").notNull(),
    amountUsd: doublePrecision("amount_usd"),
    round: text("round"),
    investors: jsonb("investors").$type<string[]>().notNull().default([]),
    geographies: jsonb("geographies").$type<string[]>().notNull().default([]),
    sectors: jsonb("sectors").$type<string[]>().notNull().default([]),
    rolesLikely: jsonb("roles_likely").$type<string[]>().notNull().default([]),
    hiringLikelihood: integer("hiring_likelihood").notNull(),
    hiringReason: text("hiring_reason").notNull(),
    summary: text("summary").notNull(),
    suggestedAction: text("suggested_action").notNull(),
    outreachOpener: text("outreach_opener").notNull(),
    confidence: real("confidence").notNull(),
    clusterId: text("cluster_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(true),
    classifier: text("classifier").notNull().default("rules"),
    otherSources: jsonb("other_sources").$type<OtherSource[]>().notNull().default([]),
    openRolesCount: integer("open_roles_count"),
    openRolesUrl: text("open_roles_url"),
    openRolesSample: jsonb("open_roles_sample").$type<string[]>(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("signals_published_idx").on(t.publishedAt),
    index("signals_cluster_idx").on(t.clusterId),
    index("signals_title_key_idx").on(t.titleKey),
  ],
);

export const signalClusters = pgTable("signal_clusters", {
  clusterId: text("cluster_id").primaryKey(),
  companyKey: text("company_key").notNull(),
  eventType: text("event_type").notNull(),
  firstPublishedAt: ts("first_published_at").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title").notNull(),
  sources: jsonb("sources").$type<OtherSource[]>().notNull().default([]),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  quality: integer("quality").notNull().default(60),
  lastItemsAt: ts("last_items_at"),
  lastError: text("last_error"),
  unhealthyNotifiedAt: ts("unhealthy_notified_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  mode: text("mode").notNull(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  llmCalls: integer("llm_calls").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  error: text("error"),
  trigger: text("trigger").notNull().default("cron"),
});

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(),
    sourceId: text("source_id").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull(),
    itemsFetched: integer("items_fetched").notNull(),
    error: text("error"),
    blocked: boolean("blocked").notNull().default(false),
  },
  (t) => [index("source_runs_source_idx").on(t.sourceId, t.startedAt)],
);

export const llmUsage = pgTable("llm_usage", {
  date: text("date").primaryKey(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  calls: integer("calls").notNull().default(0),
  budgetAlertedAt: ts("budget_alerted_at"),
});

export const deliveries = pgTable(
  "deliveries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: text("profile_id"),
    signalId: text("signal_id").notNull(),
    clusterId: text("cluster_id").notNull(),
    channel: text("channel").$type<"instant" | "digest">().notNull(),
    status: text("status").$type<"queued" | "sent" | "failed">().notNull().default("sent"),
    score: integer("score").notNull().default(0),
    sentAt: ts("sent_at"),
    openedAt: ts("opened_at"),
    clickedAt: ts("clicked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deliveries_user_cluster_uq").on(t.userId, t.clusterId),
    index("deliveries_sent_idx").on(t.sentAt),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signalId: text("signal_id").notNull(),
    rating: smallint("rating").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feedback_user_signal_uq").on(t.userId, t.signalId)],
);

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").$type<"razorpay" | "stripe">().notNull(),
  providerSubscriptionId: text("provider_subscription_id").notNull().unique(),
  providerCustomerId: text("provider_customer_id"),
  plan: text("plan").notNull().default("pro"),
  status: text("status").notNull(),
  currentPeriodEnd: ts("current_period_end"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const emailEvents = pgTable("email_events", {
  id: serial("id").primaryKey(),
  providerEventId: text("provider_event_id").notNull().unique(),
  type: text("type").notNull(),
  email: text("email"),
  userId: text("user_id"),
  payload: jsonb("payload").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("pro"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const enrichCache = pgTable("enrich_cache", {
  companyKey: text("company_key").primaryKey(),
  value: jsonb("value"),
  at: ts("at").notNull(),
});
