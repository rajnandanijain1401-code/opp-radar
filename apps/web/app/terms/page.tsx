import type { Metadata } from "next";
import { Prose } from "@/components/prose";

export const metadata: Metadata = { title: "Terms", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <Prose title="Terms of service" updated="2026-11-16">
      <p>By using OppRadar you agree to these terms. They are short on purpose.</p>
      <h2>The service</h2>
      <p>
        OppRadar summarizes public business news and filings and emails you the items that match
        your profile. Signals are automated estimates, not advice. A funding round does not
        guarantee a job opening. Always check the original source.
      </p>
      <h2>Content and sources</h2>
      <p>
        Headlines and links belong to their publishers. We show a short summary written in our own
        words and always link to the original. We respect robots.txt and never bypass logins or
        paywalls. Publishers who want a source removed can open an issue and we will act on it
        promptly.
      </p>
      <h2>Your account</h2>
      <p>
        Keep access to your inbox secure, because sign-in links go there. Do not use the service to
        spam the companies you discover. Outreach openers are suggestions; you are responsible for
        what you send.
      </p>
      <h2>Payments</h2>
      <p>
        Pro is billed monthly through Razorpay or Stripe and can be cancelled any time; it stays
        active until the end of the paid period. While billing is disabled during the beta, Pro
        features are free.
      </p>
      <h2>Open source</h2>
      <p>The OppRadar code is MIT licensed. These terms cover the hosted service only.</p>
      <h2>Liability</h2>
      <p>
        The service is provided as is, without warranties. To the extent the law allows, our
        liability is limited to the amount you paid us in the last 12 months.
      </p>
    </Prose>
  );
}
