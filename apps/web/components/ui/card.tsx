import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-card p-5", className)} {...props} />;
}

const tones = {
  accent: "bg-accent-soft text-accent",
  ink: "bg-ink text-white",
  good: "bg-good-soft text-good",
  muted: "bg-ink/5 text-muted",
};

export function Badge({
  className,
  tone = "accent",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
