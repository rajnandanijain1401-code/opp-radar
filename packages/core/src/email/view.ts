import { EVENT_LABELS, type EventType, type Signal } from "../schemas";
import type { ScoredSignal } from "../route/route";
import { fmtUsd } from "../classify/rules";
import type { UserLinks } from "../links";

/** Framework-free view model for every email template. Templates only lay this out. */
export interface EmailItemView {
  id: string;
  cluster_id: string;
  event_type: EventType;
  event_label: string;
  company: string;
  headline: string;
  event_line: string;
  title: string;
  summary: string;
  why: string;
  score: number;
  open_roles: { count: number; url: string | null; top: string[] } | null;
  suggested_action: string;
  opener: string | null;
  source_name: string;
  source_url: string;
  other_sources: { source_name: string; url: string }[];
  feedback_up_url: string | null;
  feedback_down_url: string | null;
}

export interface EmailFooterView {
  reason: string;
  manage_url: string;
  unsubscribe_url: string;
  physical_address: string;
  app_url: string;
}

export interface InstantEmailView {
  kind: "instant";
  subject: string;
  preview: string;
  items: EmailItemView[];
  footer: EmailFooterView;
}

export interface DigestEmailView {
  kind: "daily" | "weekly";
  subject: string;
  preview: string;
  date_label: string;
  top: EmailItemView | null;
  groups: { event_type: EventType; label: string; items: EmailItemView[] }[];
  total: number;
  footer: EmailFooterView;
  upgrade_note: string | null;
}

export function headlineFor(
  s: Pick<Signal, "company_name" | "event_type" | "amount_usd" | "round" | "title">,
): string {
  const c = s.company_name === "Unknown" ? null : s.company_name;
  if (!c) return s.title;
  switch (s.event_type) {
    case "funding":
      return `${c} raised ${s.amount_usd ? fmtUsd(s.amount_usd) : "new funding"}${s.round ? ` ${s.round}` : ""}`;
    case "acquisition":
      return `${c} announced an acquisition`;
    case "expansion":
      return `${c} is expanding`;
    case "leadership_hire":
      return `${c} brought in a new leader`;
    case "product_launch":
      return `${c} launched something new`;
    case "partnership_contract":
      return `${c} signed a new contract`;
    case "ipo_filing":
      return `${c} filed for an IPO`;
    case "hiring_announcement":
      return `${c} is hiring`;
    case "layoffs":
      return `${c} announced layoffs`;
    case "accelerator_batch":
      return `${c} announced a new cohort`;
    default:
      return s.title;
  }
}

export function eventLine(s: Signal): string {
  const parts: string[] = [EVENT_LABELS[s.event_type]];
  if (s.amount_usd) parts.push(fmtUsd(s.amount_usd));
  if (s.round) parts.push(s.round);
  if (s.investors.length) parts.push(`with ${s.investors.slice(0, 2).join(", ")}`);
  if (s.geographies.length) parts.push(s.geographies.slice(0, 2).join(", "));
  return parts.join(" | ");
}

export interface ViewOptions {
  links: UserLinks;
  /** Pro features: open roles and outreach openers. */
  pro: boolean;
}

export function toItemView(ss: ScoredSignal, opts: ViewOptions): EmailItemView {
  const s = ss.signal;
  const why = ss.score.reasons.length
    ? `${ss.score.reasons.join(". ")}. ${s.hiring_reason}`
    : s.hiring_reason;
  return {
    id: s.id,
    cluster_id: s.cluster_id,
    event_type: s.event_type,
    event_label: EVENT_LABELS[s.event_type],
    company: s.company_name,
    headline: headlineFor(s),
    event_line: eventLine(s),
    title: s.title,
    summary: s.summary,
    why,
    score: ss.score.final,
    open_roles:
      opts.pro && s.open_roles_count
        ? {
            count: s.open_roles_count,
            url: s.open_roles_url ?? null,
            top: (s.open_roles_sample ?? []).slice(0, 3),
          }
        : null,
    suggested_action: s.suggested_action,
    opener: opts.pro ? s.outreach_opener : null,
    source_name: s.source_name,
    source_url: s.canonical_url,
    other_sources: s.other_sources.slice(0, 4),
    feedback_up_url: opts.links.feedback(s.id, "up"),
    feedback_down_url: opts.links.feedback(s.id, "down"),
  };
}

export function instantSubject(
  items: Pick<EmailItemView, "event_label" | "headline" | "company" | "open_roles">[],
): string {
  if (items.length === 1) {
    const it = items[0]!;
    const roles = it.open_roles?.count ? `, ${it.open_roles.count} open roles` : "";
    return `[${it.event_label}] ${it.headline}${roles}`;
  }
  const names = [...new Set(items.map((i) => i.company))].slice(0, 3).join(", ");
  return `${items.length} new opportunities: ${names}`;
}

export function footerView(
  links: UserLinks,
  opts: { physicalAddress: string; appUrl: string; reason?: string },
): EmailFooterView {
  return {
    reason:
      opts.reason ??
      "You are getting this because you set up an OppRadar profile. Alerts are matched to the roles, sectors and companies you chose.",
    manage_url: links.manageUrl,
    unsubscribe_url: links.unsubscribeUrl,
    physical_address: opts.physicalAddress,
    app_url: opts.appUrl,
  };
}

export function buildInstantView(
  items: ScoredSignal[],
  opts: ViewOptions & { physicalAddress: string; appUrl: string },
): InstantEmailView {
  const views = items.map((i) => toItemView(i, opts));
  return {
    kind: "instant",
    subject: instantSubject(views),
    preview: views
      .map((v) => v.headline)
      .join(" | ")
      .slice(0, 140),
    items: views,
    footer: footerView(opts.links, opts),
  };
}

export function buildDigestView(
  digest: { top: ScoredSignal | null; groups: [string, ScoredSignal[]][] },
  opts: ViewOptions & {
    physicalAddress: string;
    appUrl: string;
    kind: "daily" | "weekly";
    now: Date;
    timezone: string;
  },
): DigestEmailView {
  const top = digest.top ? toItemView(digest.top, opts) : null;
  const groups = digest.groups.map(([t, list]) => ({
    event_type: t as EventType,
    label: EVENT_LABELS[t as EventType],
    items: list.map((i) => toItemView(i, opts)),
  }));
  const total = (top ? 1 : 0) + groups.reduce((n, g) => n + g.items.length, 0);
  const date_label = new Intl.DateTimeFormat("en-US", {
    timeZone: opts.timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(opts.now);
  const label = opts.kind === "weekly" ? "Your weekly radar" : "Your daily radar";
  return {
    kind: opts.kind,
    subject: top ? `${label}: ${total} signals, top pick ${top.company}` : `${label}: quiet day`,
    preview: top ? `Top pick: ${top.headline}` : "No strong signals matched your profile today.",
    date_label,
    top,
    groups,
    total,
    footer: footerView(opts.links, opts),
    upgrade_note: opts.pro
      ? null
      : "You are on the free plan: weekly digest, top 10. Pro adds daily digests, instant alerts, open roles and outreach openers.",
  };
}
