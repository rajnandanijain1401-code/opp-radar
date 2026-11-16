import { isAllowed, parseRobots, type RobotsRules } from "./robots";
import type { Logger } from "../logger";

export interface HttpRequest {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text: string;
  url: string;
}

export interface HttpClient {
  request(url: string, req?: HttpRequest): Promise<HttpResponse>;
  get(url: string, req?: Omit<HttpRequest, "method" | "body">): Promise<HttpResponse>;
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

export interface LiveHttpOptions {
  userAgent: string;
  /** Minimum gap between requests to the same host. */
  perHostIntervalMs?: number;
  /** Per-host overrides, e.g. { "www.reddit.com": 10000 }. */
  hostIntervals?: Record<string, number>;
  timeoutMs?: number;
  retries?: number;
  respectRobots?: boolean;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const DEFAULT_USER_AGENT =
  "OppRadar/0.1 (+https://github.com/rajnandanijain1401-code/opp-radar; open-source opportunity radar)";

export function buildUserAgent(contactEmail?: string): string {
  return contactEmail ? `${DEFAULT_USER_AGENT} contact: ${contactEmail}` : DEFAULT_USER_AGENT;
}

/**
 * Polite HTTP client: descriptive User-Agent, robots.txt checks, per-host rate limits,
 * timeouts and retries with exponential backoff on 429 / 5xx / network errors.
 */
export function createHttpClient(opts: LiveHttpOptions): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const interval = opts.perHostIntervalMs ?? 1500;
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const respectRobots = opts.respectRobots ?? true;
  const nextSlot = new Map<string, number>();
  const robotsCache = new Map<string, Promise<RobotsRules | null>>();

  async function waitForHost(host: string) {
    const gap = opts.hostIntervals?.[host] ?? interval;
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + gap);
    if (slot > now) await sleep(slot - now);
  }

  async function rawFetch(url: string, req: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: req.method ?? "GET",
        headers: { "User-Agent": opts.userAgent, ...req.headers },
        body: req.body,
        signal: controller.signal,
        redirect: "follow",
      });
      return { status: res.status, ok: res.ok, text: await res.text(), url: res.url || url };
    } finally {
      clearTimeout(timer);
    }
  }

  function robotsFor(origin: string, host: string): Promise<RobotsRules | null> {
    let p = robotsCache.get(origin);
    if (!p) {
      p = (async () => {
        try {
          await waitForHost(host);
          const res = await rawFetch(`${origin}/robots.txt`, { timeoutMs: 8000 });
          if (!res.ok) return null;
          return parseRobots(res.text, "OppRadar");
        } catch {
          return null;
        }
      })();
      robotsCache.set(origin, p);
    }
    return p;
  }

  async function request(url: string, req: HttpRequest = {}): Promise<HttpResponse> {
    const u = new URL(url);
    if (respectRobots) {
      const rules = await robotsFor(u.origin, u.host);
      if (rules && !isAllowed(rules, u.pathname + u.search)) throw new RobotsDisallowedError(url);
    }
    let attempt = 0;
    for (;;) {
      await waitForHost(u.host);
      try {
        const res = await rawFetch(url, req);
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          attempt++;
          const backoff = 500 * 2 ** attempt;
          opts.logger?.warn({ url, status: res.status, attempt, backoff }, "retrying request");
          await sleep(backoff);
          continue;
        }
        return res;
      } catch (err) {
        if (attempt >= retries) throw err;
        attempt++;
        const backoff = 500 * 2 ** attempt;
        opts.logger?.warn({ url, err: String(err), attempt, backoff }, "network error, retrying");
        await sleep(backoff);
      }
    }
  }

  return {
    request,
    get: (url, req) => request(url, { ...req, method: "GET" }),
  };
}
