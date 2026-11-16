import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HttpClient, HttpResponse } from "./client";

export interface FixtureRoute {
  /** Substring the URL must contain. First match wins. */
  match: string;
  file?: string;
  status?: number;
  body?: string;
}

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures");

const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * Fixtures can contain relative timestamps so demos always look fresh:
 * {{rfc822:-90m}}, {{iso:-2h}}, {{unix:-1d}}, {{date:-1d}} (YYYY-MM-DD).
 */
export function renderFixture(text: string, now: Date): string {
  return text.replace(/\{\{(rfc822|iso|unix|date):(-?\d+)([mhd])\}\}/g, (_m, fmt, n, unit) => {
    const d = new Date(now.getTime() + Number(n) * (UNIT_MS[unit as string] ?? 0));
    if (fmt === "rfc822") return d.toUTCString();
    if (fmt === "unix") return String(Math.floor(d.getTime() / 1000));
    if (fmt === "date") return d.toISOString().slice(0, 10);
    return d.toISOString();
  });
}

export function loadFixtureRoutes(dir = FIXTURES_DIR): FixtureRoute[] {
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as FixtureRoute[];
}

/** An HttpClient that answers from recorded fixtures. Unknown URLs return 404, never the network. */
export function createFixtureHttpClient(
  opts: { routes?: FixtureRoute[]; dir?: string; now?: () => Date; log?: string[] } = {},
): HttpClient {
  const dir = opts.dir ?? FIXTURES_DIR;
  const routes = opts.routes ?? loadFixtureRoutes(dir);
  const now = opts.now ?? (() => new Date());
  async function request(url: string): Promise<HttpResponse> {
    opts.log?.push(url);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return { status: 404, ok: false, text: "", url };
    const raw = route.body ?? (route.file ? readFileSync(join(dir, route.file), "utf8") : "");
    const status = route.status ?? 200;
    return { status, ok: status >= 200 && status < 300, text: renderFixture(raw, now()), url };
  }
  return { request, get: (url) => request(url) };
}
