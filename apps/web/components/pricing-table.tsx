import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS } from "@/lib/pricing";
import { EmailForm } from "./email-form";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

export function PricingTable({ billingEnabled }: { billingEnabled: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {PLANS.map((p) => (
        <div
          key={p.id}
          className={cn(
            "flex flex-col rounded-2xl border p-6",
            p.id === "pro" ? "border-ink bg-ink text-white" : "border-line bg-card",
          )}
        >
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold">{p.name}</h3>
            {p.id === "pro" && !billingEnabled ? (
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                Free during beta
              </span>
            ) : null}
          </div>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-5xl">{p.priceInr}</span>
            <span className={p.id === "pro" ? "text-white/70" : "text-muted"}>
              / {p.priceUsd} {p.period}
            </span>
          </p>
          <p className={cn("mt-2 text-sm", p.id === "pro" ? "text-white/80" : "text-muted")}>
            {p.blurb}
          </p>
          <ul className="mt-5 flex-1 space-y-2.5 text-sm">
            {p.features.map((f) => (
              <li key={f} className="flex gap-2">
                <Check
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    p.id === "pro" ? "text-accent" : "text-good",
                  )}
                />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {p.id === "free" ? (
              <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                Start free
              </Link>
            ) : billingEnabled ? (
              <Link
                href="/dashboard?tab=billing"
                className={cn(buttonVariants({ variant: "accent" }), "w-full")}
              >
                Upgrade to Pro
              </Link>
            ) : (
              <div className="rounded-xl bg-white/10 p-3">
                <p className="mb-2 text-xs text-white/80">
                  Everyone gets Pro features free while billing is off. Join the waitlist to lock in
                  launch pricing.
                </p>
                <EmailForm kind="waitlist" cta="Join Pro waitlist" size="default" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
