import type { Metadata } from "next";
import { Prose } from "@/components/prose";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy policy" updated="2026-11-16">
      <p>
        OppRadar is built to collect as little as possible. This page explains what we store, why,
        and how to take it with you or delete it. It is written to be compatible with India&apos;s
        DPDP Act 2023 and the EU GDPR.
      </p>
      <h2>What we store about you</h2>
      <ul>
        <li>
          Your email address, used to sign you in with a magic link and to send the alerts you asked
          for.
        </li>
        <li>
          Your radar profile: roles, sectors, geographies, keywords, watchlist and delivery
          preferences.
        </li>
        <li>Which signals we emailed you and when, so we never send the same event twice.</li>
        <li>Your thumbs up or down on signals, to improve relevance.</li>
        <li>
          If you pay, a subscription record from Razorpay or Stripe. We never see or store card
          details.
        </li>
        <li>
          Email delivery events (bounces, complaints) from our email provider, so we stop emailing
          broken addresses.
        </li>
      </ul>
      <h2>What we do not do</h2>
      <ul>
        <li>No tracking pixels, no ad networks, no selling or sharing your data.</li>
        <li>No passwords. Sign-in is by single-use email link.</li>
        <li>
          We do not store full news articles: only headlines, links and short summaries written by
          us.
        </li>
      </ul>
      <h2>Processors</h2>
      <p>
        We use a small set of processors to run the service: our hosting provider (Vercel), our
        database (Neon or Supabase), Resend for email, Anthropic for classifying public news
        headlines (no personal data is sent), and Razorpay or Stripe for payments.
      </p>
      <h2>Your rights</h2>
      <p>
        From your dashboard you can export all your data as JSON, change your preferences, or delete
        your account, which removes your profile, delivery history, feedback and subscription
        records immediately. Every email has a one-click unsubscribe link that works without signing
        in.
      </p>
      <h2>Retention</h2>
      <p>
        Account data lives until you delete it. Public signals (headlines, links and our summaries)
        are kept as a public archive. Logs are kept for at most 30 days.
      </p>
      <h2>Contact</h2>
      <p>For any privacy request, reply to any OppRadar email or open an issue on GitHub.</p>
    </Prose>
  );
}
