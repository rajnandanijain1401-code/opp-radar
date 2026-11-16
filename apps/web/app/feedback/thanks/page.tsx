import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Thanks for the feedback", robots: { index: false } };

export default async function Thanks({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; invalid?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-4xl">
        {sp.invalid ? "That link has expired" : "Thanks, noted."}
      </h1>
      <p className="mt-3 text-muted">
        {sp.invalid
          ? "You can still rate signals from your dashboard."
          : sp.r === "down"
            ? "We'll show you fewer signals like this one."
            : "We'll look for more signals like this one."}
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block font-semibold text-accent underline underline-offset-2"
      >
        Open your dashboard
      </Link>
    </div>
  );
}
