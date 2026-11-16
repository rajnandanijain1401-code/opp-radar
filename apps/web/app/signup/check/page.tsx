import type { Metadata } from "next";
import { MailCheck } from "lucide-react";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default function CheckEmailPage() {
  const dev =
    process.env.NODE_ENV !== "production" || process.env.RADAR_EMAIL_PROVIDER === "console";
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <MailCheck className="mx-auto h-10 w-10 text-accent" />
      <h1 className="mt-6 font-display text-5xl">Check your inbox</h1>
      <p className="mt-4 text-muted">
        We sent you a sign-in link. It works once and expires in 24 hours. Open it on this device to
        finish setting up your radar.
      </p>
      {dev ? (
        <p className="mt-6 rounded-lg border border-dashed border-line bg-card px-4 py-3 text-left text-xs text-muted">
          Dev mode: the console email provider printed the link in the terminal running{" "}
          <code>pnpm dev</code> and saved it to <code>apps/web/.data/last-magic-link.json</code>.
        </p>
      ) : null}
    </div>
  );
}
