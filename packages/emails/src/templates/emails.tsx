import { Button, Link, Section, Text } from "@react-email/components";
import type {
  DigestEmailView,
  EmailFooterView,
  InstantEmailView,
} from "@opp-radar/core/email/view";
import { C, ItemCard, Layout, s } from "./ui";

export function InstantAlertEmail({ view }: { view: InstantEmailView }) {
  return (
    <Layout preview={view.preview} footer={view.footer}>
      <Text style={{ ...s.p, color: C.muted }}>
        {view.items.length === 1
          ? "A new high-signal opportunity just matched your profile."
          : `${view.items.length} new high-signal opportunities just matched your profile.`}
      </Text>
      {view.items.map((it) => (
        <ItemCard key={it.id} item={it} />
      ))}
    </Layout>
  );
}

export function DigestEmail({ view }: { view: DigestEmailView }) {
  const title = view.kind === "weekly" ? "Your weekly radar" : "Your daily radar";
  return (
    <Layout preview={view.preview} footer={view.footer}>
      <Text style={{ ...s.h, fontSize: "24px", lineHeight: "30px" }}>{title}</Text>
      <Text style={s.meta}>
        {view.date_label} | {view.total} signal{view.total === 1 ? "" : "s"} matched
      </Text>
      {view.top ? (
        <>
          <Text style={{ ...s.label, color: C.accent }}>Top pick of the day</Text>
          <ItemCard item={view.top} />
        </>
      ) : (
        <Section style={s.card}>
          <Text style={s.p}>
            A quiet day: nothing scored high enough for your profile. We will keep watching.
          </Text>
        </Section>
      )}
      {view.groups.map((g) => (
        <Section key={g.event_type}>
          <Text style={{ ...s.label, margin: "18px 0 8px" }}>
            {g.label} ({g.items.length})
          </Text>
          {g.items.map((it) => (
            <ItemCard key={it.id} item={it} compact />
          ))}
        </Section>
      ))}
      {view.upgrade_note ? (
        <Section style={{ ...s.card, backgroundColor: C.accentSoft, borderColor: C.accentSoft }}>
          <Text style={{ ...s.p, margin: 0 }}>{view.upgrade_note}</Text>
        </Section>
      ) : null}
    </Layout>
  );
}

export function DailyDigestEmail({ view }: { view: DigestEmailView }) {
  return <DigestEmail view={{ ...view, kind: "daily" }} />;
}

export function WeeklyDigestEmail({ view }: { view: DigestEmailView }) {
  return <DigestEmail view={{ ...view, kind: "weekly" }} />;
}

export interface WelcomeEmailProps {
  name?: string | null;
  dashboardUrl: string;
  footer: EmailFooterView;
}

/** Sent after onboarding. Double opt-in is satisfied by the magic link the user clicked. */
export function WelcomeEmail({ name, dashboardUrl, footer }: WelcomeEmailProps) {
  return (
    <Layout preview="Your radar is live. Here is what happens next." footer={footer}>
      <Section style={s.card}>
        <Text style={s.h}>Welcome{name ? `, ${name}` : ""}. Your radar is live.</Text>
        <Text style={s.p}>
          Every funding round, expansion and leadership hire is a job opening that has not been
          posted yet. OppRadar watches the news for you and emails you the ones that match your
          profile.
        </Text>
        <Text style={s.p}>
          You confirmed your email by clicking the sign-in link, so you are all set. Expect instant
          alerts for the strongest signals and a digest at the time you picked.
        </Text>
        <Button href={dashboardUrl} style={s.button}>
          Open your dashboard
        </Button>
      </Section>
    </Layout>
  );
}

export interface MagicLinkEmailProps {
  url: string;
  host: string;
}

export function MagicLinkEmail({ url, host }: MagicLinkEmailProps) {
  return (
    <Layout preview={`Your sign-in link for ${host}`}>
      <Section style={s.card}>
        <Text style={s.h}>Sign in to OppRadar</Text>
        <Text style={s.p}>
          Click the button below to sign in. The link works once and expires in 24 hours.
        </Text>
        <Button href={url} style={s.button}>
          Sign in
        </Button>
        <Text style={{ ...s.small, marginTop: "16px" }}>
          Or paste this link into your browser:{" "}
          <Link href={url} style={s.link}>
            {url}
          </Link>
        </Text>
        <Text style={s.small}>If you did not request this, you can safely ignore this email.</Text>
      </Section>
    </Layout>
  );
}
