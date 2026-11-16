import { render } from "@react-email/render";
import type { DigestEmailView, InstantEmailView } from "@opp-radar/core/email/view";
import {
  DigestEmail,
  InstantAlertEmail,
  MagicLinkEmail,
  WelcomeEmail,
  type MagicLinkEmailProps,
  type WelcomeEmailProps,
} from "./templates/emails";
import type { ReactElement } from "react";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

async function both(el: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text };
}

export async function renderInstant(view: InstantEmailView): Promise<RenderedEmail> {
  return { subject: view.subject, ...(await both(<InstantAlertEmail view={view} />)) };
}

export async function renderDigest(view: DigestEmailView): Promise<RenderedEmail> {
  return { subject: view.subject, ...(await both(<DigestEmail view={view} />)) };
}

export async function renderWelcome(props: WelcomeEmailProps): Promise<RenderedEmail> {
  return { subject: "Your OppRadar is live", ...(await both(<WelcomeEmail {...props} />)) };
}

export async function renderMagicLink(props: MagicLinkEmailProps): Promise<RenderedEmail> {
  return { subject: "Your OppRadar sign-in link", ...(await both(<MagicLinkEmail {...props} />)) };
}
