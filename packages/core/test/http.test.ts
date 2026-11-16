import { describe, expect, it, vi } from "vitest";
import { createHttpClient, RobotsDisallowedError } from "../src/http/client";
import { isAllowed, parseRobots } from "../src/http/robots";
import { renderFixture } from "../src/http/fixtures";

function fakeFetch(handler: (url: string) => { status: number; body: string }) {
  return vi.fn(async (url: string | URL | Request) => {
    const r = handler(String(url));
    return new Response(r.body, { status: r.status });
  }) as unknown as typeof fetch;
}

describe("robots.txt", () => {
  const txt =
    "User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: BadBot\nDisallow: /\n";
  it("applies the * group with longest match wins", () => {
    const rules = parseRobots(txt, "OppRadar");
    expect(isAllowed(rules, "/feed")).toBe(true);
    expect(isAllowed(rules, "/private/x")).toBe(false);
    expect(isAllowed(rules, "/private/ok/1")).toBe(true);
  });
  it("matches google news style rules", () => {
    const rules = parseRobots(
      "User-agent: *\nDisallow: /\nAllow: /$\nAllow: /topics/\n",
      "OppRadar",
    );
    expect(isAllowed(rules, "/rss/search?q=x")).toBe(false);
    expect(isAllowed(rules, "/topics/abc")).toBe(true);
  });
});

describe("http client", () => {
  it("sends a descriptive user agent and respects robots", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("User-Agent") ?? "");
      const u = String(url);
      if (u.endsWith("/robots.txt"))
        return new Response("User-agent: *\nDisallow: /secret", { status: 200 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const http = createHttpClient({
      userAgent: "OppRadar/test",
      fetchImpl,
      perHostIntervalMs: 0,
      sleep: async () => {},
    });
    expect((await http.get("https://a.test/feed")).text).toBe("ok");
    await expect(http.get("https://a.test/secret/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect(seen.every((ua) => ua === "OppRadar/test")).toBe(true);
  });

  it("retries 5xx with backoff then succeeds", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch((url) => {
      if (url.endsWith("robots.txt")) return { status: 404, body: "" };
      calls++;
      return calls < 3 ? { status: 503, body: "busy" } : { status: 200, body: "fine" };
    });
    const sleeps: number[] = [];
    const http = createHttpClient({
      userAgent: "t",
      fetchImpl,
      perHostIntervalMs: 0,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect((await http.get("https://b.test/x")).text).toBe("fine");
    expect(calls).toBe(3);
    expect(sleeps.filter((s) => s >= 1000)).toEqual([1000, 2000]);
  });

  it("rate limits per host", async () => {
    const fetchImpl = fakeFetch(() => ({ status: 200, body: "" }));
    const sleeps: number[] = [];
    const http = createHttpClient({
      userAgent: "t",
      fetchImpl,
      perHostIntervalMs: 1000,
      respectRobots: false,
      sleep: async (ms) => void sleeps.push(ms),
    });
    await Promise.all([
      http.get("https://c.test/1"),
      http.get("https://c.test/2"),
      http.get("https://d.test/1"),
    ]);
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThan(900);
  });
});

describe("fixture rendering", () => {
  it("replaces relative time tokens", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(renderFixture("{{iso:-2h}}|{{unix:-1d}}|{{date:-1d}}", now)).toBe(
      "2026-11-16T10:00:00.000Z|1794744000|2026-11-15",
    );
  });
});
