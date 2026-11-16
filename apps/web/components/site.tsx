import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2 font-semibold tracking-tight ${className}`}
      aria-label="OppRadar home"
    >
      <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      <span>OppRadar</span>
    </Link>
  );
}

/** Static on purpose: calling auth() here would make every public page dynamic. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-4">
          <Link href="/signals" className="rounded-md px-2 py-1 text-muted hover:text-ink">
            Signals
          </Link>
          <Link
            href="/pricing"
            className="hidden rounded-md px-2 py-1 text-muted hover:text-ink sm:block"
          >
            Pricing
          </Link>
          <a
            href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_REPO ?? "rajnandanijain1401-code/opp-radar"}`}
            className="hidden rounded-md px-2 py-1 text-muted hover:text-ink sm:block"
          >
            GitHub
          </a>
          <Link href="/dashboard" className="rounded-md px-2 py-1 text-muted hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white hover:bg-ink/85"
          >
            Get alerts
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo className="text-ink" />
          <p className="mt-3 max-w-sm">
            Open-source opportunity radar. We store only headlines, links and our own short
            summaries, never full articles.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-ink">Product</p>
          <Link href="/signals" className="block hover:text-ink">
            Today&apos;s signals
          </Link>
          <Link href="/pricing" className="block hover:text-ink">
            Pricing
          </Link>
          <Link href="/signup" className="block hover:text-ink">
            Get alerts
          </Link>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-ink">Legal</p>
          <Link href="/privacy" className="block hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="block hover:text-ink">
            Terms
          </Link>
          <a
            href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_REPO ?? "rajnandanijain1401-code/opp-radar"}`}
            className="block hover:text-ink"
          >
            Source code (MIT)
          </a>
        </div>
      </div>
    </footer>
  );
}
