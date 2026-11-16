import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { EmailFooterView, EmailItemView } from "@opp-radar/core/email/view";
import type { CSSProperties, ReactNode } from "react";

/** Palette shared with the web app. Light surfaces with high-contrast ink survive dark-mode inversion. */
export const C = {
  ink: "#12151c",
  muted: "#5b6472",
  faint: "#8a919c",
  line: "#e6e8ec",
  paper: "#ffffff",
  canvas: "#f4f2ee",
  accent: "#e8551e",
  accentSoft: "#fdeee6",
  good: "#16794a",
};

const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const s = {
  body: {
    backgroundColor: C.canvas,
    fontFamily: font,
    margin: 0,
    padding: "24px 0",
  } as CSSProperties,
  container: { maxWidth: "600px", margin: "0 auto", padding: "0 12px" } as CSSProperties,
  brand: {
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: C.ink,
    margin: "0 0 16px",
  } as CSSProperties,
  card: {
    backgroundColor: C.paper,
    border: `1px solid ${C.line}`,
    borderRadius: "12px",
    padding: "20px",
    margin: "0 0 14px",
  } as CSSProperties,
  chip: {
    display: "inline-block",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: C.accent,
    backgroundColor: C.accentSoft,
    borderRadius: "999px",
    padding: "3px 9px",
    margin: "0 0 10px",
  } as CSSProperties,
  h: {
    fontSize: "19px",
    lineHeight: "26px",
    fontWeight: 700,
    color: C.ink,
    margin: "0 0 4px",
  } as CSSProperties,
  meta: {
    fontSize: "13px",
    lineHeight: "20px",
    color: C.muted,
    margin: "0 0 12px",
  } as CSSProperties,
  p: { fontSize: "15px", lineHeight: "23px", color: C.ink, margin: "0 0 12px" } as CSSProperties,
  label: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: C.faint,
    margin: "0 0 4px",
  } as CSSProperties,
  small: {
    fontSize: "13px",
    lineHeight: "20px",
    color: C.muted,
    margin: "0 0 8px",
  } as CSSProperties,
  opener: {
    fontSize: "14px",
    lineHeight: "21px",
    color: C.ink,
    borderLeft: `3px solid ${C.accent}`,
    padding: "4px 0 4px 12px",
    margin: "0 0 12px",
    fontStyle: "italic",
  } as CSSProperties,
  link: { color: C.accent, textDecoration: "underline" } as CSSProperties,
  button: {
    display: "inline-block",
    backgroundColor: C.ink,
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 700,
    borderRadius: "8px",
    padding: "12px 20px",
    textDecoration: "none",
  } as CSSProperties,
};

export function Layout({
  preview,
  children,
  footer,
}: {
  preview: string;
  children: ReactNode;
  footer?: EmailFooterView;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={s.body}>
        <Container style={s.container}>
          <Text style={s.brand}>
            <span style={{ color: C.accent }}>●</span> OPPRADAR
          </Text>
          {children}
          {footer ? <Footer f={footer} /> : null}
        </Container>
      </Body>
    </Html>
  );
}

export function Footer({ f }: { f: EmailFooterView }) {
  return (
    <Section style={{ padding: "8px 4px 24px" }}>
      <Hr style={{ borderColor: C.line, margin: "8px 0 16px" }} />
      <Text style={s.small}>{f.reason}</Text>
      <Text style={s.small}>
        <Link href={f.manage_url} style={s.link}>
          Manage preferences
        </Link>
        {"  |  "}
        <Link href={f.unsubscribe_url} style={s.link}>
          Unsubscribe in one click
        </Link>
      </Text>
      <Text style={{ ...s.small, color: C.faint }}>{f.physical_address}</Text>
    </Section>
  );
}

export function ItemCard({ item, compact = false }: { item: EmailItemView; compact?: boolean }) {
  return (
    <Section style={s.card}>
      <Text style={s.chip}>
        {item.event_label} | score {item.score}
      </Text>
      <Text style={s.h}>{item.headline}</Text>
      <Text style={s.meta}>{item.event_line}</Text>
      <Text style={s.p}>{item.summary}</Text>
      {!compact ? (
        <>
          <Text style={s.label}>Why it matters for you</Text>
          <Text style={s.p}>{item.why}</Text>
        </>
      ) : null}
      {item.open_roles ? (
        <>
          <Text style={s.label}>Open roles ({item.open_roles.count})</Text>
          <Text style={s.p}>
            {item.open_roles.top.join(" · ")}
            {item.open_roles.url ? (
              <>
                {" "}
                <Link href={item.open_roles.url} style={s.link}>
                  See all
                </Link>
              </>
            ) : null}
          </Text>
        </>
      ) : null}
      <Text style={s.label}>Suggested action</Text>
      <Text style={s.p}>{item.suggested_action}</Text>
      {item.opener && !compact ? (
        <>
          <Text style={s.label}>Opener you can send</Text>
          <Text style={s.opener}>{item.opener}</Text>
        </>
      ) : null}
      <Text style={s.small}>
        Source:{" "}
        <Link href={item.source_url} style={s.link}>
          {item.source_name}
        </Link>
        {item.other_sources.length ? ` (+${item.other_sources.length} more)` : ""}
        {item.feedback_up_url && item.feedback_down_url ? (
          <>
            {"  |  Useful? "}
            <Link href={item.feedback_up_url} style={{ textDecoration: "none" }}>
              👍
            </Link>{" "}
            <Link href={item.feedback_down_url} style={{ textDecoration: "none" }}>
              👎
            </Link>
          </>
        ) : null}
      </Text>
    </Section>
  );
}
