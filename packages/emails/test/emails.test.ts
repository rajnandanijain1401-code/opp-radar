import { describe, expect, it } from "vitest";
import { buildDigestView, buildInstantView, selectDigest } from "@opp-radar/core";
import { renderDigest, renderInstant, renderMagicLink, renderWelcome } from "../src/render";
import { LINKS, NOW, SAMPLE } from "./sample";

const opts = {
  links: LINKS,
  pro: true,
  physicalAddress: "OppRadar, 123 Example Street, Bengaluru",
  appUrl: "https://oppradar.example",
};
const noDash = (s: string) => expect(s).not.toMatch(/—/);

describe("instant alert email", () => {
  it("uses the single-item subject format", async () => {
    const view = buildInstantView([SAMPLE[0]!], opts);
    expect(view.subject).toBe("[Funding] Zeta Pay raised $20M Series B, 12 open roles");
    const r = await renderInstant(view);
    expect(r.html).toContain("Why it matters for you");
    expect(r.html).toContain("Senior Backend Engineer, Lending");
    expect(r.html).toContain("Opener you can send");
    expect(r.html).toContain("/api/email/feedback?token=");
    expect(r.text).toContain("Unsubscribe in one click");
    noDash(r.html);
    noDash(r.text);
  });

  it("uses the multi-item subject format", () => {
    expect(buildInstantView(SAMPLE, opts).subject).toBe(
      "3 new opportunities: Zeta Pay, Orbit Health, ShelfWise",
    );
  });

  it("matches the snapshot", async () => {
    const r = await renderInstant(buildInstantView(SAMPLE.slice(0, 2), opts));
    expect(r.text).toMatchSnapshot();
  });
});

describe("digest emails", () => {
  it("puts the top pick first and groups the rest by event type", async () => {
    const view = buildDigestView(selectDigest(SAMPLE, 15), {
      ...opts,
      kind: "daily",
      now: NOW,
      timezone: "Asia/Kolkata",
    });
    expect(view.top!.company).toBe("Zeta Pay");
    expect(view.groups.map((g) => g.label)).toEqual(["Acquisition", "Expansion"]);
    expect(view.subject).toBe("Your daily radar: 3 signals, top pick Zeta Pay");
    const r = await renderDigest(view);
    expect(r.html).toContain("Top pick of the day");
    expect(r.text).toMatchSnapshot();
    noDash(r.html);
  });

  it("free weekly digest hides openers and open roles and shows the upgrade note", async () => {
    const view = buildDigestView(selectDigest(SAMPLE, 10), {
      ...opts,
      pro: false,
      kind: "weekly",
      now: NOW,
      timezone: "Asia/Kolkata",
    });
    const r = await renderDigest(view);
    expect(r.html).toContain("Your weekly radar");
    expect(r.html).not.toContain("Opener you can send");
    expect(r.html).not.toContain("Open roles (");
    expect(r.html).toContain("free plan");
  });

  it("renders a quiet-day digest", async () => {
    const view = buildDigestView(
      { top: null, groups: [] },
      { ...opts, kind: "daily", now: NOW, timezone: "UTC" },
    );
    expect((await renderDigest(view)).text).toContain("A quiet day");
  });
});

describe("account emails", () => {
  it("renders welcome and magic link emails", async () => {
    const w = await renderWelcome({
      name: "Asha",
      dashboardUrl: "https://oppradar.example/dashboard",
      footer: buildInstantView([SAMPLE[0]!], opts).footer,
    });
    expect(w.text).toContain("Welcome, Asha");
    const m = await renderMagicLink({
      url: "https://oppradar.example/api/auth/callback/resend?token=abc",
      host: "oppradar.example",
    });
    expect(m.html).toContain("Sign in to OppRadar");
    expect(m.text).toContain("https://oppradar.example/api/auth/callback/resend?token=abc");
    noDash(w.html);
    noDash(m.html);
  });
});
