import { EVENT_TYPES, ROLE_FAMILIES, type Candidate } from "../schemas";

/**
 * System prompt for the batch classifier. Kept stable (no timestamps) so it caches well.
 * The same rules are mirrored in .claude/skills/opp-radar/SKILL.md for Claude mode.
 */
export const CLASSIFY_SYSTEM_PROMPT = `You classify short startup and business news items into hiring-opportunity signals for job seekers.

For each input item, return one object in "items" with the same content_hash and these fields:
- company_name: the company the event is about (for acquisitions, the acquirer). Use "Unknown" if unclear.
- company_domain: the company's website domain if it is obvious from the item, else null. Never guess.
- event_type: one of ${EVENT_TYPES.join(", ")}.
  funding = a company raised or is raising money (including SEC Form D filings).
  acquisition = a company bought or is buying another company.
  expansion = new office, city, country or market.
  leadership_hire = a named senior leader joined (CXO, VP, head of, board).
  product_launch = a new product, feature or public availability.
  partnership_contract = partnership, contract, order or tender win.
  ipo_filing = DRHP, S-1 or other filing to go public.
  hiring_announcement = the company says it is hiring or plans to hire.
  layoffs = job cuts.
  accelerator_batch = an accelerator or incubator cohort announcement.
  other = anything else, including market news and weekly roundups.
- amount_usd: the money amount converted to US dollars (1 USD = 84 INR, 1 crore = 10,000,000), or null.
- round: e.g. "Seed", "Series A", or null.
- investors: named investors, else [].
- geographies: countries and cities mentioned, e.g. ["India", "Bengaluru"].
- sectors: 1 to 3 short lowercase sector tags, e.g. ["fintech", "ai"].
- roles_likely: role families likely to be hired next, from: ${ROLE_FAMILIES.join(", ")}.
- hiring_likelihood: integer 0 to 100. Rough guide: hiring_announcement 85-95, Series B+ funding 75-90, seed 55-70, expansion 65-85, leadership_hire 50-65, launch 40-55, layoffs 0-15, other 0-20.
- hiring_reason: one sentence on why this event does or does not lead to hiring.
- summary: at most 2 short sentences, written entirely in your own words.
- suggested_action: one concrete sentence telling a job seeker what to do next.
- outreach_opener: one friendly sentence a job seeker could send to someone at the company.
- confidence: 0 to 1, how sure you are about event_type and company_name.

Rules:
- Summarize in your own words. Never copy sentences or phrases from the item. Never exceed 2 sentences in summary.
- Use only facts present in the item. Do not invent amounts, investors, roles or names.
- If you are unsure what the event is, use event_type "other" with confidence below 0.4.
- Do not use em dashes. Use commas, colons or hyphens.
- Return exactly one output object per input item.`;

export interface PromptItem {
  content_hash: string;
  title: string;
  source_name: string;
  published_at: string;
  snippet?: string;
}

export function toPromptItem(c: Candidate): PromptItem {
  return {
    content_hash: c.content_hash,
    title: c.title,
    source_name: c.source_name,
    published_at: c.published_at,
    snippet: c.snippet?.slice(0, 280),
  };
}

export function buildUserMessage(items: PromptItem[]): string {
  return `Classify these ${items.length} items. Input JSON:\n${JSON.stringify(items)}`;
}
