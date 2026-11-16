import type { Candidate, Classification, EventType, RoleFamily } from "../schemas";
import { EVENT_LABELS } from "../schemas";
import {
  extractCompany,
  parseAmountUsd,
  parseGeographies,
  parseHireCount,
  parseInvestors,
  parseRound,
  parseSectors,
} from "./extract";

const ROUNDUP =
  /\b(weekly funding|funding report|week'?s \d* ?biggest|biggest (funding )?rounds|top \d+ (startups|deals|rounds)|funding roundup|this week in|startups raised)\b/i;

/** Ordered rules: first match wins. Order resolves overlaps ("bags contract" is a contract, not funding). */
const RULES: { type: EventType; re: RegExp; strong?: boolean }[] = [
  {
    type: "ipo_filing",
    re: /\b(ipo|drhp|draft red herring|red herring|s-1|files? (confidentially )?(to|for) (go public|ipo|listing)|public listing|go public|listing on (nse|bse|nasdaq|nyse))\b/i,
    strong: true,
  },
  {
    type: "layoffs",
    re: /\b(lay(s|ing)? off|layoffs?|laid off|to lay off|job cuts|cuts? (\d+ )?(jobs|employees|staff|workforce)|downsiz\w*|retrench\w*|let go of)\b/i,
    strong: true,
  },
  {
    type: "acquisition",
    re: /\b(acquires?|acquired|acquisition|to acquire|buys out|buys|bought|merges? with|merger|takes over|acqui-?hire)\b/i,
    strong: true,
  },
  {
    type: "leadership_hire",
    re: /\b(appoints?|appointed|names|named|hires|ropes in|elevates|promotes|onboards|joins|brings on)\b.{0,80}\b(ceo|cto|cfo|coo|cpo|cmo|cro|chro|chief [a-z ]*officer|chief|president|vp|vice president|head of|managing director|country manager|board)\b/i,
    strong: true,
  },
  {
    type: "leadership_hire",
    re: /\b(new|as) (ceo|cto|cfo|coo|cpo|cmo|cro|chief [a-z]+ officer)\b/i,
  },
  {
    type: "partnership_contract",
    re: /\b(partners? with|partnership|ties? up|tie-up|teams up|signs? (a |an )?(\w+ )?(deal|mou|agreement|contract|pact)|(bags|wins?|secures?|lands|bagged|won) (a |an )?([\w-]+ ){0,3}(contract|order|deal|tender|mandate)|contract (with|from)|order from|collaborat\w+ with)\b/i,
    strong: true,
  },
  {
    type: "funding",
    re: /\b(raises?|raised|raising|bags|secures?|secured|lands|nets|closes|gets|receives|picks up)\b[^.]{0,60}?((us\$|\$|€|£|₹|rs\.?|inr|usd)\s?\d|\d+(\.\d+)?\s?(mn|m|million|bn|billion|crore|cr|lakh)\b|seed|pre-seed|series [a-h]|funding|round|investment)/i,
    strong: true,
  },
  {
    type: "funding",
    re: /\b(in talks to raise|to raise|funding round|seed round|pre-seed|series [a-h]\b|form d|private funding|venture funding|investment from)\b/i,
  },
  {
    type: "expansion",
    re: /\b(opens?( a)?( new)? (\w+ )?(office|hub|centre|center|campus|facility|plant|store|r&d|gcc)|expands? (to|into|in|its)|expansion|to expand|enters? (the )?[\w ]{0,20}market|foray|sets up (a )?(new )?(office|hub|centre|center)|new (cities|markets|countries)|global capability cent(er|re))\b/i,
    strong: true,
  },
  {
    type: "hiring_announcement",
    re: /\b(is hiring|are hiring|to hire|will hire|plans? to hire|hiring spree|hiring drive|recruit\w*|add(s|ing)? \d+ (jobs|employees|people|engineers)|job openings|headcount)\b/i,
    strong: true,
  },
  {
    type: "accelerator_batch",
    re: /\b(accelerator|cohort|batch|demo day|incubat\w+|selects? \d+ startups|startups selected)\b/i,
    strong: true,
  },
  {
    type: "product_launch",
    re: /\b(launch(es|ed)?|unveils?|introduces?|rolls out|debuts?|releases?|now available|goes live|opens (up )?(its )?.{0,30} to (everyone|all|the public)|launch hn|show hn)\b/i,
    strong: true,
  },
];

export function detectEventType(title: string): { type: EventType; strong: boolean } {
  if (ROUNDUP.test(title)) return { type: "other", strong: false };
  for (const r of RULES) if (r.re.test(title)) return { type: r.type, strong: !!r.strong };
  return { type: "other", strong: false };
}

const ROLES_BY_EVENT: Record<EventType, RoleFamily[]> = {
  funding: ["engineering", "product", "sales", "marketing"],
  acquisition: ["engineering", "product", "ops"],
  expansion: ["sales", "ops", "customer_success", "hr"],
  leadership_hire: ["leadership"],
  product_launch: ["engineering", "marketing", "sales", "customer_success"],
  partnership_contract: ["engineering", "customer_success", "ops"],
  ipo_filing: ["finance", "leadership", "engineering"],
  hiring_announcement: ["engineering"],
  layoffs: [],
  accelerator_batch: ["engineering", "product"],
  other: [],
};

const ROLE_WORDS: [RegExp, RoleFamily][] = [
  [/\b(engineer|developer|sre|devops|cto|technology|tech)\b/i, "engineering"],
  [/\b(product|cpo)\b/i, "product"],
  [/\b(design|designer|ux|ui)\b/i, "design"],
  [/\b(data|ml|machine learning|scientist|analyst)\b/i, "data"],
  [/\b(sales|account exec|revenue|cro|business development)\b/i, "sales"],
  [/\b(marketing|growth|cmo|brand)\b/i, "marketing"],
  [/\b(ops|operations|coo|supply chain|logistics)\b/i, "ops"],
  [/\b(cfo|finance|accounting)\b/i, "finance"],
  [/\b(hr|people|talent|recruit|chro)\b/i, "hr"],
  [/\b(customer success|support|onboarding)\b/i, "customer_success"],
];

function rolesFrom(text: string): RoleFamily[] {
  const out: RoleFamily[] = [];
  for (const [re, r] of ROLE_WORDS) if (re.test(text) && !out.includes(r)) out.push(r);
  return out;
}

function baseLikelihood(
  type: EventType,
  round: string | null,
  amount: number | null,
  title: string,
): number {
  let base: number;
  switch (type) {
    case "funding": {
      const r = (round ?? "").toLowerCase();
      base = /series [c-h]|growth/.test(r)
        ? 85
        : /series b/.test(r)
          ? 82
          : /series a/.test(r)
            ? 75
            : /seed|angel/.test(r)
              ? 62
              : 68;
      if (/in talks|to raise/i.test(title)) base -= 12;
      if (/form d/i.test(title)) base = 60;
      break;
    }
    case "hiring_announcement":
      base = 90;
      break;
    case "expansion":
      base = 75;
      break;
    case "acquisition":
      base = 50;
      break;
    case "leadership_hire":
      base = 58;
      break;
    case "product_launch":
      base = 45;
      break;
    case "partnership_contract":
      base = 52;
      break;
    case "ipo_filing":
      base = 55;
      break;
    case "accelerator_batch":
      base = 55;
      break;
    case "layoffs":
      base = 8;
      break;
    default:
      base = 15;
  }
  if (amount && type === "funding") {
    if (amount >= 50e6) base += 6;
    else if (amount >= 15e6) base += 3;
  }
  const hires = parseHireCount(title);
  if (hires && type !== "layoffs") base += hires >= 100 ? 12 : 8;
  return Math.max(0, Math.min(98, Math.round(base)));
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n % 1e9 ? 1 : 0)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 && n < 1e7 ? 1 : 0)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}
export { fmtUsd };

const ROLE_LABEL: Record<RoleFamily, string> = {
  engineering: "engineering",
  product: "product",
  design: "design",
  data: "data",
  sales: "sales",
  marketing: "marketing",
  ops: "operations",
  finance: "finance",
  hr: "people",
  customer_success: "customer success",
  leadership: "leadership",
};

interface Copy {
  summary: string;
  reason: string;
  action: string;
  opener: string;
}

function copyFor(
  type: EventType,
  company: string,
  ctx: {
    amount: number | null;
    round: string | null;
    investors: string[];
    sectors: string[];
    roles: RoleFamily[];
    title: string;
  },
): Copy {
  const sector = ctx.sectors[0] ? `${ctx.sectors[0]} ` : "";
  const role = ROLE_LABEL[ctx.roles[0] ?? "engineering"];
  const amt = ctx.amount ? fmtUsd(ctx.amount) : null;
  const round = ctx.round ? `${ctx.round} ` : "";
  const known = company !== "Unknown";
  const who = known ? company : "The company";
  switch (type) {
    case "funding": {
      const raised = /in talks|to raise/i.test(ctx.title)
        ? `${who} is reportedly in talks to raise ${amt ? `about ${amt} in ` : ""}a new ${round}round.`
        : /form d/i.test(ctx.title)
          ? `${who} filed a Form D with the SEC, which signals a private funding round that may not be public yet.`
          : `${who} raised ${amt ?? "new funding"}${ctx.round ? ` in a ${ctx.round} round` : ""}${ctx.investors[0] ? ` led by ${ctx.investors[0]}` : ""}.`;
      return {
        summary: `${raised}${ctx.sectors[0] ? ` It operates in ${ctx.sectors[0]}.` : ""}`,
        reason: `Fresh ${round}capital is usually spent on ${role} and go-to-market hires within the next 3 to 6 months.`,
        action: `Check ${who}'s careers page and reach out to the ${role} lead this week, before new roles are posted publicly.`,
        opener: `Congrats on the ${round}raise, ${known ? `${company} team` : "team"}! I'd love to help you scale ${role} as you put the new capital to work.`,
      };
    }
    case "acquisition":
      return {
        summary: `${who} announced an acquisition that expands its ${sector}capabilities.`,
        reason:
          "Acquisitions often create integration work and new roles across engineering, product and operations.",
        action: `Look for integration and platform roles at ${who} and ask how the combined team is being structured.`,
        opener: `Congrats on the acquisition! Integrations like this are hard to get right, and I'd love to help on the ${role} side.`,
      };
    case "expansion":
      return {
        summary: `${who} is expanding with a new office or market entry.`,
        reason:
          "New offices and markets need local teams fast, especially in sales, operations and support.",
        action: `Reach out to ${who}'s hiring team about the new location before roles go up on job boards.`,
        opener: `Saw the expansion news, exciting move! I'd love to be part of building the ${role} team there.`,
      };
    case "leadership_hire":
      return {
        summary: `${who} brought in a new senior leader.`,
        reason: "New leaders typically build or reshape their team within their first 90 days.",
        action: `Congratulate the new leader at ${who} and ask what they are hiring for in their first quarter.`,
        opener:
          "Congrats on the new role! New leaders usually build fast, and I'd love to hear what your first hires look like.",
      };
    case "product_launch":
      return {
        summary: `${who} launched a new product or opened it to more customers.`,
        reason: "Launches create demand for go-to-market, support and engineering capacity.",
        action: `Try the new product from ${who}, then send a note with one concrete idea for it.`,
        opener:
          "Congrats on the launch! I tried it out and had an idea I'd love to share with your team.",
      };
    case "partnership_contract":
      return {
        summary: `${who} signed a new partnership or contract.`,
        reason:
          "New contracts need delivery capacity, which often means implementation and engineering hires.",
        action: `Ask ${who} whether the new contract is creating delivery or implementation roles.`,
        opener:
          "Congrats on the new contract! Delivery at that scale is a big lift, and I'd love to help.",
      };
    case "ipo_filing":
      return {
        summary: `${who} filed paperwork to go public.`,
        reason:
          "Pre-IPO companies strengthen finance, compliance and leadership teams, and keep hiring to show growth.",
        action: `Watch ${who}'s careers page for finance, compliance and senior roles over the next quarter.`,
        opener:
          "Congrats on the IPO filing! It's a big milestone and I'd love to help you through the next phase.",
      };
    case "hiring_announcement":
      return {
        summary: `${who} is actively hiring${
          ctx.roles.length
            ? ` for ${ctx.roles
                .map((r) => ROLE_LABEL[r])
                .slice(0, 3)
                .join(", ")} roles`
            : ""
        }.`,
        reason:
          "The company has said publicly that it is hiring, which is the strongest signal there is.",
        action: `Apply directly and message the hiring manager at ${who} with one line on why you fit.`,
        opener: `Saw that ${known ? company : "you"} ${known ? "is" : "are"} hiring for ${role}. I'd love to share how I could contribute from day one.`,
      };
    case "layoffs":
      return {
        summary: `${who} announced layoffs.`,
        reason:
          "Layoffs usually mean a hiring freeze at this company, but peers may be hiring the talent released.",
        action:
          "Skip applying here for now; look at competitors that may be hiring affected talent.",
        opener:
          "Sorry to hear about the changes on your team. If anyone affected is looking, I'm happy to make intros.",
      };
    case "accelerator_batch":
      return {
        summary: `${who} announced a new accelerator cohort of early-stage startups.`,
        reason: "Accelerator startups often make their first hires right after the program.",
        action:
          "Scan the cohort list for startups in your space and reach out to founders directly.",
        opener:
          "Congrats on getting into the program! If you're thinking about your first hires, I'd love to chat.",
      };
    default:
      return {
        summary: `${who} was mentioned in startup news.`,
        reason: "No clear hiring trigger was detected in this item.",
        action: "No action needed unless this company is on your watchlist.",
        opener: "I've been following your work and would love to connect.",
      };
  }
}

export interface RulesOptions {
  regionBySource?: Record<string, string | undefined>;
}

/** Zero-cost, deterministic classifier. Good enough to run the product without any API key. */
export function classifyWithRules(
  c: Pick<Candidate, "content_hash" | "title" | "snippet" | "source_id" | "extra">,
  opts: RulesOptions = {},
): Classification {
  const title = c.title;
  const extra = c.extra ?? {};
  const isHnHiring = Array.isArray(extra.roles);
  const isFormD = typeof extra.form === "string";
  const detected = isHnHiring
    ? { type: "hiring_announcement" as const, strong: true }
    : isFormD
      ? { type: "funding" as const, strong: true }
      : detectEventType(title);
  const type = detected.type;
  const company = typeof extra.company === "string" ? extra.company : extractCompany(title);
  const text = `${title} ${c.snippet ?? ""}`;
  const amount = type === "funding" || type === "acquisition" ? parseAmountUsd(title) : null;
  const round = type === "funding" ? parseRound(title) : null;
  const investors = type === "funding" ? parseInvestors(title) : [];
  const sectors = parseSectors(text);
  const geographies = parseGeographies(
    `${title} ${typeof extra.location === "string" ? extra.location : ""}`,
    opts.regionBySource?.[c.source_id],
  );
  let roles: RoleFamily[] = [...ROLES_BY_EVENT[type]];
  if (type === "leadership_hire" || type === "hiring_announcement") {
    const fromText = rolesFrom(isHnHiring ? (extra.roles as string[]).join(" ") : title);
    roles = fromText.length ? fromText : roles;
    if (type === "leadership_hire" && !roles.includes("leadership")) roles.push("leadership");
  }
  if (type === "funding" && amount && amount >= 15e6) roles.push("data", "design");
  const likelihood = baseLikelihood(type, round, amount, title);
  const copy = copyFor(type, company, { amount, round, investors, sectors, roles, title });
  let confidence = type === "other" ? 0.3 : detected.strong ? 0.6 : 0.45;
  if (typeof extra.company === "string") confidence += 0.1;
  if (company === "Unknown") confidence -= 0.15;
  return {
    content_hash: c.content_hash,
    company_name: company,
    company_domain: null,
    event_type: type,
    amount_usd: amount,
    round,
    investors,
    geographies,
    sectors,
    roles_likely: [...new Set(roles)],
    hiring_likelihood: likelihood,
    hiring_reason: copy.reason,
    summary: copy.summary,
    suggested_action: copy.action,
    outreach_opener: copy.opener,
    confidence: Math.max(0.05, Math.min(0.75, Number(confidence.toFixed(2)))),
  };
}

export function eventLabel(t: EventType): string {
  return EVENT_LABELS[t];
}
