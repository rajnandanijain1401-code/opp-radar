import { parseFeed } from "../util/feed";
import type { RawItem } from "../schemas";
import {
  SourceBlockedError,
  isAfter,
  type SourceAdapter,
  type SourceContext,
  type SourceDefOf,
} from "./types";

/** Pooled investment vehicles file Form D too. They are not hiring signals, so we skip them. */
const FUND_PATTERN =
  /\b(fund|l\.?p\.?|lp|partners|capital|holdings|trust|investors|co-invest|spv|series \d+|feeder|offshore|master|portfolio|reit|properties|realty|opportunit(y|ies))\b/i;

export function parseFormDTitle(
  title: string,
): { form: string; company: string; cik?: string } | null {
  const m = title.match(/^(D(?:\/A)?)\s+-\s+(.+?)\s+\((\d{10})\)/);
  if (!m) return null;
  return { form: m[1]!, company: m[2]!.trim(), cik: m[3] };
}

/**
 * SEC EDGAR "current filings" Atom feed for Form D (US private placements, often before press).
 * EDGAR requires a User-Agent containing a contact email; set RADAR_CONTACT_EMAIL.
 */
export function createSecFormDAdapter(
  def: SourceDefOf<"sec_form_d">,
  ctx: SourceContext,
): SourceAdapter {
  return {
    id: def.id,
    name: def.name,
    kind: "sec_form_d",
    quality: def.quality,
    async fetch(since) {
      if (!ctx.contactEmail) {
        ctx.logger.warn(
          { source: def.id },
          "RADAR_CONTACT_EMAIL not set, SEC EDGAR requires it; skipping",
        );
        return [];
      }
      const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D&company=&dateb=&owner=include&start=0&count=${def.count}&output=atom`;
      const res = await ctx.http.get(url, {
        headers: { "User-Agent": `OppRadar ${ctx.contactEmail}`, Accept: "application/atom+xml" },
      });
      if (res.status === 403) throw new SourceBlockedError(def.id, res.status);
      if (!res.ok) throw new Error(`${def.id}: HTTP ${res.status}`);
      const items: RawItem[] = [];
      for (const e of parseFeed(res.text)) {
        if (!isAfter(e.published_at, since)) continue;
        const parsed = parseFormDTitle(e.title);
        if (!parsed || parsed.form !== "D") continue; // skip amendments
        if (FUND_PATTERN.test(parsed.company)) continue;
        items.push({
          source_id: def.id,
          source_name: def.name,
          title: `${parsed.company} files Form D for a private funding round`,
          url: e.link,
          published_at: e.published_at,
          guid: e.guid,
          extra: { company: parsed.company, cik: parsed.cik, form: parsed.form },
        });
      }
      return items;
    },
  };
}
