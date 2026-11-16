import { z } from "zod";

/** Event taxonomy. Order matters only for display. */
export const EVENT_TYPES = [
  "funding",
  "acquisition",
  "expansion",
  "leadership_hire",
  "product_launch",
  "partnership_contract",
  "ipo_filing",
  "hiring_announcement",
  "layoffs",
  "accelerator_batch",
  "other",
] as const;
export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EVENT_LABELS: Record<EventType, string> = {
  funding: "Funding",
  acquisition: "Acquisition",
  expansion: "Expansion",
  leadership_hire: "Leadership hire",
  product_launch: "Launch",
  partnership_contract: "Contract",
  ipo_filing: "IPO filing",
  hiring_announcement: "Hiring",
  layoffs: "Layoffs",
  accelerator_batch: "Accelerator",
  other: "Other",
};

export const ROLE_FAMILIES = [
  "engineering",
  "product",
  "design",
  "data",
  "sales",
  "marketing",
  "ops",
  "finance",
  "hr",
  "customer_success",
  "leadership",
] as const;
export const RoleFamilySchema = z.enum(ROLE_FAMILIES);
export type RoleFamily = z.infer<typeof RoleFamilySchema>;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO date");

/** What a source adapter returns. `snippet` is a short excerpt used only for classification, never persisted. */
export const RawItemSchema = z.object({
  source_id: z.string(),
  source_name: z.string(),
  title: z.string().min(1),
  url: z.string().url(),
  published_at: isoDate.optional(),
  snippet: z.string().max(400).optional(),
  guid: z.string().optional(),
  /** Publisher when the adapter is an aggregator (Google News). */
  publisher: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type RawItem = z.infer<typeof RawItemSchema>;

export const OtherSourceSchema = z.object({
  source_name: z.string(),
  url: z.string(),
});
export type OtherSource = z.infer<typeof OtherSourceSchema>;

/** A normalized, deduped item ready for classification. */
export const CandidateSchema = z.object({
  content_hash: z.string(),
  canonical_url: z.string(),
  source_id: z.string(),
  source_name: z.string(),
  source_quality: z.number().min(0).max(100),
  title: z.string(),
  published_at: isoDate,
  fetched_at: isoDate,
  snippet: z.string().optional(),
  other_sources: z.array(OtherSourceSchema).default([]),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

const sentence = (max: number) => z.string().trim().min(1).max(max);

/** The classification fields produced by the rules engine, the LLM, or Claude in Claude mode. */
export const ClassificationSchema = z.object({
  content_hash: z.string(),
  company_name: z.string().trim().min(1).max(120),
  company_domain: z.string().max(120).nullable().optional(),
  event_type: EventTypeSchema,
  amount_usd: z.number().nonnegative().nullable().optional(),
  round: z.string().max(40).nullable().optional(),
  investors: z.array(z.string().max(120)).max(15).default([]),
  geographies: z.array(z.string().max(60)).max(10).default([]),
  sectors: z.array(z.string().max(60)).max(10).default([]),
  roles_likely: z.array(RoleFamilySchema).max(11).default([]),
  hiring_likelihood: z.number().int().min(0).max(100),
  hiring_reason: sentence(240),
  summary: sentence(320),
  suggested_action: sentence(240),
  outreach_opener: sentence(300),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const ClassifierKindSchema = z.enum(["rules", "llm", "claude"]);
export type ClassifierKind = z.infer<typeof ClassifierKindSchema>;

export const SignalSchema = CandidateSchema.omit({ snippet: true, extra: true })
  .extend(ClassificationSchema.shape)
  .extend({
    id: z.string(),
    cluster_id: z.string(),
    classifier: ClassifierKindSchema.default("rules"),
    open_roles_count: z.number().int().nonnegative().nullable().optional(),
    open_roles_url: z.string().nullable().optional(),
    open_roles_sample: z.array(z.string()).max(5).optional(),
  });
export type Signal = z.infer<typeof SignalSchema>;

/** What Claude mode (or any external classifier) hands to `radar send`. id / cluster_id / fetched_at are optional. */
export const SignalInputSchema = SignalSchema.partial({
  id: true,
  cluster_id: true,
  fetched_at: true,
  source_quality: true,
  other_sources: true,
  classifier: true,
});
export type SignalInput = z.infer<typeof SignalInputSchema>;

export const DigestFrequencySchema = z.enum(["daily", "weekly", "off"]);

export const UserProfileSchema = z.object({
  id: z.string().default("default"),
  name: z.string().default("My radar"),
  roles: z.array(RoleFamilySchema).default([]),
  seniority: z.string().nullable().optional(),
  sectors: z.array(z.string()).default([]),
  geographies: z.array(z.string()).default([]),
  include_keywords: z.array(z.string()).default([]),
  exclude_keywords: z.array(z.string()).default([]),
  watchlist_companies: z.array(z.string()).default([]),
  event_types: z.array(EventTypeSchema).default([]),
  min_amount_usd: z.number().nonnegative().nullable().optional(),
  instant_alerts_enabled: z.boolean().default(true),
  instant_threshold: z.number().min(0).max(100).default(75),
  max_instant_per_day: z.number().int().min(0).max(50).default(5),
  digest_frequency: DigestFrequencySchema.default("daily"),
  digest_hour_local: z.number().int().min(0).max(23).default(8),
  timezone: z.string().default("Asia/Kolkata"),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserProfileInput = z.input<typeof UserProfileSchema>;
