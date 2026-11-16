import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SignalCard } from "@/components/signal-card";
import { topSignals } from "@/lib/queries";

export const revalidate = 3600;

function parse(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() ? null : d;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  return {
    title: `Hiring signals for ${date}`,
    description: `Startup funding rounds, acquisitions, expansions and leadership hires reported on ${date}, scored by hiring likelihood.`,
    alternates: { canonical: `/signals/${date}` },
  };
}

export default async function ArchivePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const from = parse(date);
  if (!from) notFound();
  const to = new Date(from.getTime() + 86_400_000);
  const signals = await topSignals({ from, to, limit: 50 });
  const prev = new Date(from.getTime() - 86_400_000).toISOString().slice(0, 10);
  const next = to.getTime() < Date.now() ? to.toISOString().slice(0, 10) : null;
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <Link href="/signals" className="text-sm text-muted hover:text-ink">
        ← Today&apos;s signals
      </Link>
      <h1 className="mt-4 font-display text-5xl">Signals for {date}</h1>
      <p className="mt-3 text-muted">{signals.length} signals, strongest first.</p>
      <div className="mt-8 grid gap-4">
        {signals.length ? (
          signals.map((s) => <SignalCard key={s.id} signal={s} compact />)
        ) : (
          <p className="text-muted">Nothing recorded for this day.</p>
        )}
      </div>
      <div className="mt-10 flex justify-between text-sm font-semibold">
        <Link href={`/signals/${prev}`} className="hover:text-accent">
          ← {prev}
        </Link>
        {next ? (
          <Link href={`/signals/${next}`} className="hover:text-accent">
            {next} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
