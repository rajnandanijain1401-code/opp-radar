import { EVENT_LABELS, type Signal } from "@opp-radar/core/schemas";
import { Badge } from "@/components/ui/card";
import { cn, fmtUsd, timeAgo } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export interface SignalCardProps {
  signal: Signal;
  score?: number;
  reasons?: string[];
  showOpener?: boolean;
  showRoles?: boolean;
  compact?: boolean;
  feedback?: React.ReactNode;
  className?: string;
}

export function eventLine(s: Signal): string {
  const parts = [
    fmtUsd(s.amount_usd),
    s.round,
    s.investors.length ? `with ${s.investors.slice(0, 2).join(", ")}` : null,
    s.geographies.slice(0, 2).join(", ") || null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function SignalCard({
  signal: s,
  score,
  reasons,
  showOpener,
  showRoles,
  compact,
  feedback,
  className,
}: SignalCardProps) {
  return (
    <article
      className={cn("rounded-xl border border-line bg-card p-5", className)}
      data-testid="signal-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{EVENT_LABELS[s.event_type]}</Badge>
        {typeof score === "number" ? (
          <Badge
            tone={score >= 75 ? "ink" : "muted"}
            title="Score: 45% hiring likelihood, 35% relevance, 10% recency, 10% source quality"
          >
            Score {score}
          </Badge>
        ) : (
          <Badge tone="muted">Hiring {s.hiring_likelihood}</Badge>
        )}
        <span className="ml-auto font-mono text-xs text-faint">{timeAgo(s.published_at)}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug">
        {s.company_name !== "Unknown" ? s.company_name : s.title}
      </h3>
      {eventLine(s) ? <p className="mt-0.5 font-mono text-xs text-muted">{eventLine(s)}</p> : null}
      <p className="mt-3 text-[15px] leading-relaxed">{s.summary}</p>
      {!compact ? (
        <>
          {reasons?.length ? (
            <p className="mt-3 text-sm text-muted">
              <span className="font-semibold text-ink">Why it matters: </span>
              {reasons.join(". ")}. {s.hiring_reason}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">{s.hiring_reason}</p>
          )}
          {showRoles && s.open_roles_count ? (
            <p className="mt-3 text-sm">
              <span className="font-semibold">{s.open_roles_count} open roles: </span>
              <span className="text-muted">
                {(s.open_roles_sample ?? []).slice(0, 3).join(" · ")}
              </span>{" "}
              {s.open_roles_url ? (
                <a
                  href={s.open_roles_url}
                  className="text-accent underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  See all
                </a>
              ) : null}
            </p>
          ) : null}
          <p className="mt-3 text-sm">
            <span className="font-semibold">Next step: </span>
            {s.suggested_action}
          </p>
          {showOpener ? (
            <div className="mt-3 flex items-start gap-3 rounded-lg border-l-2 border-accent bg-paper/70 p-3">
              <p className="flex-1 text-sm italic">{s.outreach_opener}</p>
              <CopyButton text={s.outreach_opener} />
            </div>
          ) : null}
        </>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <a
          href={s.canonical_url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          {s.source_name}
        </a>
        {s.other_sources.slice(0, 3).map((o) => (
          <a
            key={o.url}
            href={o.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            {o.source_name}
          </a>
        ))}
        {feedback ? <span className="ml-auto">{feedback}</span> : null}
      </div>
    </article>
  );
}
