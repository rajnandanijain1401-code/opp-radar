import type { Candidate } from "../schemas";

/**
 * Cheap keyword gate so only plausibly relevant items reach the (paid) classifier.
 * Errs on the side of recall: the classifier is the precision step.
 */
export const PREFILTER_PATTERNS: RegExp[] = [
  /\b(raises?|raised|raising|bags|secures?|lands|nets|closes)\b/i,
  /\b(funding|funded|seed|pre-seed|series [a-h]|investment|investors?|valuation|form d)\b/i,
  /\b(acquires?|acquired|acquisition|to acquire|buys|merger|merges)\b/i,
  /\b(appoints?|appointed|names|named|joins as|elevates|ropes in|new (ceo|cto|cfo|coo|cpo|cmo|cro))\b/i,
  /\b(opens?|opening) (new )?(office|hub|centre|center|campus|facility)\b/i,
  /\b(expands?|expansion|enters?|foray)\b/i,
  /\b(launch(es|ed)?|unveils?|introduces?|rolls out|debuts?|launch hn|show hn)\b/i,
  /\b(ipo|drhp|draft red herring|s-1|go public|public listing)\b/i,
  /\b(lay(s|ing)? off|layoffs?|laid off|job cuts|downsiz)/i,
  /\b(to hire|hiring|is hiring|will hire|plans to hire|recruit|headcount|jobs)\b/i,
  /\b(partners? with|partnership|ties? up|tie-up|contract|mou|agreement|wins? (a )?(deal|order))\b/i,
  /\b(accelerator|cohort|batch|demo day|incubat|yc [wsf]\d{2})\b/i,
];

export function prefilterReason(c: Pick<Candidate, "title" | "snippet" | "extra">): string | null {
  if (c.extra && typeof c.extra.company === "string") return "structured-source";
  const text = c.title;
  for (const p of PREFILTER_PATTERNS) {
    const m = text.match(p);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

export function prefilter<T extends Pick<Candidate, "title" | "snippet" | "extra">>(
  items: T[],
): { passed: T[]; dropped: T[] } {
  const passed: T[] = [];
  const dropped: T[] = [];
  for (const it of items) (prefilterReason(it) ? passed : dropped).push(it);
  return { passed, dropped };
}
