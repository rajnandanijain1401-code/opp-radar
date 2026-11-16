import { z } from "zod";
import type { HttpClient } from "../http/client";
import type { Logger } from "../logger";
import { companyKey } from "../dedupe/cluster";

export interface OpenRoles {
  board: "greenhouse" | "lever" | "ashby";
  slug: string;
  count: number;
  url: string;
  sample: string[];
}

export interface EnrichCacheEntry {
  at: string;
  value: OpenRoles | null;
}

export interface EnrichCache {
  get(key: string): EnrichCacheEntry | undefined;
  set(key: string, entry: EnrichCacheEntry): void;
}

export function createMapEnrichCache(init: Record<string, EnrichCacheEntry> = {}): EnrichCache & {
  toJSON(): Record<string, EnrichCacheEntry>;
} {
  const m = new Map(Object.entries(init));
  return {
    get: (k) => m.get(k),
    set: (k, v) => void m.set(k, v),
    toJSON: () => Object.fromEntries(m),
  };
}

export const ENRICH_MIN_LIKELIHOOD = 50;
export const ENRICH_TTL_MS = 24 * 3_600_000;

/** Candidate board slugs: "Zeta Pay Inc." -> zetapay, zeta-pay, zeta; plus the domain stem if known. */
export function guessSlugs(company: string, domain?: string | null): string[] {
  const key = companyKey(company); // "zeta-pay"
  const out = new Set<string>();
  if (domain) {
    const stem = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(".")[0];
    if (stem) out.add(stem.toLowerCase());
  }
  if (key) {
    out.add(key.replace(/-/g, ""));
    out.add(key);
    const first = key.split("-")[0];
    if (first && first.length >= 4 && key.includes("-")) out.add(first);
  }
  return [...out].filter((s) => /^[a-z0-9-]{2,60}$/.test(s)).slice(0, 4);
}

const Greenhouse = z.object({ jobs: z.array(z.object({ title: z.string() })) });
const Lever = z.array(z.object({ text: z.string() }));
const Ashby = z.object({ jobs: z.array(z.object({ title: z.string() })) });

type BoardQuery = {
  board: OpenRoles["board"];
  api: (s: string) => string;
  url: (s: string) => string;
  titles: (json: unknown) => string[];
};

const BOARDS: BoardQuery[] = [
  {
    board: "greenhouse",
    api: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    url: (s) => `https://boards.greenhouse.io/${s}`,
    titles: (j) => Greenhouse.parse(j).jobs.map((x) => x.title),
  },
  {
    board: "lever",
    api: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
    url: (s) => `https://jobs.lever.co/${s}`,
    titles: (j) => Lever.parse(j).map((x) => x.text),
  },
  {
    board: "ashby",
    api: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    url: (s) => `https://jobs.ashbyhq.com/${s}`,
    titles: (j) => Ashby.parse(j).jobs.map((x) => x.title),
  },
];

/** Find a public careers board for the company. Every failure is silent and returns null. */
export async function findOpenRoles(
  company: string,
  domain: string | null | undefined,
  deps: { http: HttpClient; cache?: EnrichCache; now?: () => Date; logger?: Logger },
): Promise<OpenRoles | null> {
  const now = deps.now?.() ?? new Date();
  const key = companyKey(company);
  if (!key || key === "unknown") return null;
  const cached = deps.cache?.get(key);
  if (cached && now.getTime() - Date.parse(cached.at) < ENRICH_TTL_MS) return cached.value;

  let found: OpenRoles | null = null;
  outer: for (const slug of guessSlugs(company, domain)) {
    for (const b of BOARDS) {
      try {
        const res = await deps.http.get(b.api(slug), {
          headers: { Accept: "application/json" },
          timeoutMs: 8000,
        });
        if (!res.ok) continue;
        const titles = b.titles(JSON.parse(res.text));
        if (!titles.length) continue;
        found = {
          board: b.board,
          slug,
          count: titles.length,
          url: b.url(slug),
          sample: [...new Set(titles)].slice(0, 5),
        };
        break outer;
      } catch (err) {
        deps.logger?.debug(
          { company, slug, board: b.board, err: String(err) },
          "job board lookup failed",
        );
      }
    }
  }
  deps.cache?.set(key, { at: now.toISOString(), value: found });
  return found;
}

/** Enrich signals in place-safe fashion (returns new objects). Only hiring_likelihood >= 50. */
export async function enrichSignals<
  T extends { company_name: string; company_domain?: string | null; hiring_likelihood: number },
>(
  items: T[],
  deps: { http: HttpClient; cache?: EnrichCache; now?: () => Date; logger?: Logger },
): Promise<{
  items: (T & {
    open_roles_count?: number | null;
    open_roles_url?: string | null;
    open_roles_sample?: string[];
  })[];
  enriched: number;
}> {
  let enriched = 0;
  const out = [];
  for (const it of items) {
    if (it.hiring_likelihood < ENRICH_MIN_LIKELIHOOD) {
      out.push(it);
      continue;
    }
    const roles = await findOpenRoles(it.company_name, it.company_domain, deps);
    if (roles) {
      enriched++;
      out.push({
        ...it,
        open_roles_count: roles.count,
        open_roles_url: roles.url,
        open_roles_sample: roles.sample,
      });
    } else out.push(it);
  }
  return { items: out, enriched };
}
