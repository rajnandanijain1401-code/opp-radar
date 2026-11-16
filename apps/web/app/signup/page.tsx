import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EmailForm } from "@/components/email-form";

export const metadata: Metadata = { title: "Get alerts", alternates: { canonical: "/signup" } };

const ERRORS: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Request a new one below.",
  Configuration: "Sign-in is not configured correctly. Please try again later.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <h1 className="font-display text-5xl">Start your radar</h1>
      <p className="mt-3 text-muted">
        Enter your email and we&apos;ll send a sign-in link. No password. The link also confirms
        your address, so there is nothing else to verify.
      </p>
      {error ? (
        <p role="alert" className="mt-6 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
          {ERRORS[error] ?? "Something went wrong. Please try again."}
        </p>
      ) : null}
      <EmailForm className="mt-8" cta="Send my link" />
      <p className="mt-6 text-xs text-faint">
        By continuing you agree to our{" "}
        <a className="underline" href="/terms">
          terms
        </a>{" "}
        and{" "}
        <a className="underline" href="/privacy">
          privacy policy
        </a>
        .
      </p>
    </div>
  );
}
