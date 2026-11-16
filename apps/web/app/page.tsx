import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mail, Radar, Target } from "lucide-react";
import { GithubIcon } from "@/components/github-icon";
import { EVENT_LABELS } from "@opp-radar/core/schemas";
import { EmailForm } from "@/components/email-form";
import { PricingTable } from "@/components/pricing-table";
import { githubStars, landingSignals } from "@/lib/queries";
import { fmtUsd, timeAgo } from "@/lib/utils";

export const revalidate = 900;

const SOURCES = [
  "Inc42",
  "Entrackr",
  "YourStory",
  "Economic Times",
  "TechCrunch",
  "Crunchbase News",
  "Hacker News",
  "SEC EDGAR",
];

const STEPS = [
  {
    icon: Radar,
    title: "We watch the news",
    body: "Every 15 minutes OppRadar reads startup news, Hacker News and SEC filings for funding rounds, acquisitions, expansions and leadership hires.",
  },
  {
    icon: Target,
    title: "We score it for you",
    body: "Each event gets a hiring likelihood, then a personal score from your roles, sectors, cities and watchlist. We also look up open roles on Greenhouse, Lever and Ashby.",
  },
  {
    icon: Mail,
    title: "You hear first",
    body: "High scores arrive as instant alerts, the rest in a daily digest with a suggested next step and an opener you can send today.",
  },
];

const FAQ = [
  {
    q: "Why would a funding round mean a job?",
    a: "Startups raise money to hire. A fresh Series A or B usually turns into engineering, product and go-to-market roles within a few months, often before they are posted. Expansions, new leaders and big contracts work the same way.",
  },
  {
    q: "Where does the data come from?",
    a: "Public RSS feeds from startup publications, Hacker News (including the monthly Who is hiring thread) and SEC Form D filings. We respect robots.txt, never scrape LinkedIn, X, Instagram or Facebook, and never bypass paywalls.",
  },
  {
    q: "Do you store or email full articles?",
    a: "No. We keep the headline, the link and a two-sentence summary written in our own words. You always click through to the original publisher.",
  },
  {
    q: "Is it really open source?",
    a: "Yes, MIT licensed. You can run it free on GitHub Actions with your Gmail, or on your own Claude with no API key. The hosted version just saves you the setup.",
  },
  {
    q: "How do I unsubscribe or delete my data?",
    a: "Every email has a one-click unsubscribe link. In settings you can export everything we have about you as JSON or delete your account, which removes it all.",
  },
];

export default async function Home() {
  const [signals, stars] = await Promise.all([
    landingSignals(5),
    githubStars(process.env.NEXT_PUBLIC_GITHUB_REPO ?? "rajnandanijain1401-code/opp-radar"),
  ]);
  const billingEnabled = process.env.BILLING_ENABLED === "true";
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "rajnandanijain1401-code/opp-radar";

  return (
    <>
      <section className="radar-grid border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
          <div>
            <a
              href={`https://github.com/${repo}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-muted hover:text-ink"
            >
              <GithubIcon className="h-3.5 w-3.5" /> Open source on GitHub
              {stars !== null ? (
                <span className="rounded-full bg-ink/5 px-1.5 font-mono">★ {stars}</span>
              ) : null}
            </a>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Every funding round is a job opening that{" "}
              <em className="text-accent">hasn&apos;t been posted yet.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              OppRadar reads startup news for you, spots funding rounds, expansions and leadership
              hires, scores them for your role, and emails you the ones that mean hiring, before the
              roles go public.
            </p>
            <EmailForm className="mt-8 max-w-lg" />
            <p className="mt-3 text-xs text-faint">
              No password, just a magic link. Free while in beta. Unsubscribe in one click.
            </p>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-line bg-card shadow-[0_1px_0_rgba(18,21,28,0.04),0_20px_50px_-25px_rgba(18,21,28,0.35)]">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                  </span>
                  Today&apos;s top signals
                </p>
                <Link href="/signals" className="text-xs font-semibold text-muted hover:text-ink">
                  See all
                </Link>
              </div>
              <ul className="divide-y divide-line" data-testid="landing-signals">
                {signals.length ? (
                  signals.map((s) => (
                    <li key={s.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                        <span className="text-accent">{EVENT_LABELS[s.event_type]}</span>
                        <span className="text-faint">·</span>
                        <span className="font-mono font-medium normal-case text-faint">
                          {timeAgo(s.published_at)}
                        </span>
                        <span className="ml-auto rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-white">
                          {s.hiring_likelihood}
                        </span>
                      </div>
                      <p className="mt-1 font-semibold">
                        {s.company_name}
                        {s.amount_usd ? (
                          <span className="font-normal text-muted">
                            {" "}
                            · {fmtUsd(s.amount_usd)}
                            {s.round ? ` ${s.round}` : ""}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{s.summary}</p>
                    </li>
                  ))
                ) : (
                  <li className="px-5 py-10 text-center text-sm text-muted">
                    The radar is warming up. Check back in a few minutes.
                  </li>
                )}
              </ul>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 hidden h-40 w-40 rounded-full border border-accent/30 lg:block"
            >
              <div className="radar-sweep h-full w-full rounded-full bg-[conic-gradient(from_0deg,rgba(232,85,30,0.25),transparent_25%)]" />
            </div>
          </div>
        </div>
        <div className="border-t border-line bg-card/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide text-ink">Watching</span>
            {SOURCES.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="font-display text-4xl sm:text-5xl">How it works</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-line bg-card p-6">
              <div className="flex items-center justify-between">
                <s.icon className="h-6 w-6 text-accent" />
                <span className="font-mono text-xs text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl sm:text-5xl">
              An email you&apos;ll actually open.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Each alert tells you what happened, why it matters for you, which roles are already
              open, what to do next, and a one-line opener you can send to the team today.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              <li>
                <span className="font-mono text-accent">[Funding]</span> Zeta Pay raised $20M Series
                B, 12 open roles
              </li>
              <li>
                <span className="font-mono text-accent">[Expansion]</span> ShelfWise is expanding
              </li>
              <li>
                <span className="font-mono text-accent">3 new opportunities:</span> Fieldstack,
                Vaultline, Helix Bio
              </li>
            </ul>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 font-semibold text-accent hover:underline"
            >
              Set up your radar in 2 minutes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_20px_50px_-25px_rgba(18,21,28,0.35)]">
            <Image
              src="/images/email-preview.png"
              alt="Sample OppRadar instant alert email with summary, open roles, suggested action and an outreach opener"
              width={1200}
              height={1500}
              className="h-auto w-full"
              priority={false}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20" id="pricing">
        <h2 className="font-display text-4xl sm:text-5xl">Simple pricing</h2>
        <p className="mt-3 text-muted">
          Or self-host the whole thing for free. It&apos;s MIT licensed.
        </p>
        <div className="mt-10">
          <PricingTable billingEnabled={billingEnabled} />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-8">
        <h2 className="font-display text-4xl sm:text-5xl">Questions</h2>
        <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-card">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {f.q}
                <span className="ml-4 text-accent transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-16 rounded-2xl bg-ink p-8 text-white sm:p-10">
          <h2 className="font-display text-4xl">Hear about the next round first.</h2>
          <p className="mt-3 text-white/70">Two minutes to set up. One click to leave.</p>
          <EmailForm className="mt-6 max-w-lg" cta="Start my radar" />
        </div>
      </section>
    </>
  );
}
