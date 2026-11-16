import type { Metadata } from "next";
import Link from "next/link";
import { SignalCard } from "@/components/signal-card";
import { EmailForm } from "@/components/email-form";
import { topSignals } from "@/lib/queries";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Today's hiring signals: startup funding, acquisitions and expansions",
  description:
    "The top 20 startup funding rounds, acquisitions, expansions and leadership hires from the last 24 hours, scored by hiring likelihood. Updated every 15 minutes.",
  alternates: { canonical: "/signals" },
};

function lastDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10),
  );
}

export default async function SignalsPage() {
  const signals = await topSignals({ from: new Date(Date.now() - 24 * 3_600_000), limit: 20 });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Today's hiring signals",
    itemListElement: signals.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.title,
      url: s.canonical_url,
    })),
  };
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className="font-mono text-xs uppercase tracking-wide text-faint">
        Updated every 15 minutes
      </p>
      <h1 className="mt-2 font-display text-5xl sm:text-6xl">Today&apos;s hiring signals</h1>
      <p className="mt-4 max-w-2xl text-muted">
        The 20 strongest signals from the last 24 hours: who raised, who is expanding, who just
        hired a new leader. Each one is summarized in our own words with a link to the original
        report.
      </p>
      <div className="mt-10 grid gap-4" data-testid="public-signals">
        {signals.length ? (
          signals.map((s) => <SignalCard key={s.id} signal={s} compact />)
        ) : (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
            No signals in the last 24 hours yet.
          </p>
        )}
      </div>
      <div className="mt-12 rounded-2xl bg-ink p-8 text-white">
        <h2 className="font-display text-3xl">Get these matched to your role, by email.</h2>
        <EmailForm className="mt-5 max-w-lg" />
      </div>
      <nav className="mt-12" aria-label="Archive">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Archive</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {lastDays(14).map((d) => (
            <li key={d}>
              <Link
                href={`/signals/${d}`}
                className="rounded-full border border-line bg-card px-3 py-1 font-mono text-xs hover:border-ink"
              >
                {d}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
