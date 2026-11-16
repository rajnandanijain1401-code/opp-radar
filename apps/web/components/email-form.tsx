"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { requestMagicLink, joinWaitlist, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function EmailForm({
  cta = "Get my alerts",
  kind = "signup",
  className,
  size = "lg",
}: {
  cta?: string;
  kind?: "signup" | "waitlist";
  className?: string;
  size?: "lg" | "default";
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    kind === "signup" ? requestMagicLink : joinWaitlist,
    {},
  );
  if (state.ok && state.message) {
    return (
      <p className="rounded-lg bg-good-soft px-4 py-3 text-sm font-medium text-good">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className={cn("w-full", className)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`email-${kind}`} className="sr-only">
          Email address
        </label>
        <Input
          id={`email-${kind}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          className={size === "lg" ? "h-12 text-base" : undefined}
        />
        <Button type="submit" variant="accent" size={size} disabled={pending} className="shrink-0">
          {pending ? "Sending..." : cta}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-accent">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
