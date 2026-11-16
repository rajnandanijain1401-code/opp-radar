---
name: opp-radar
description: Run the OppRadar opportunity radar using Claude as the classifier (no API key needed). Fetches new startup funding, acquisition, expansion, leadership and hiring news, classifies each item into the OppRadar Signal schema, then scores, routes and emails the results. Use when the user says "run my radar", "check for new opportunities", "/radar", or wants OppRadar to run without an Anthropic API key.
---

# OppRadar in Claude mode

You are the classifier. The CLI does everything else: fetching, dedupe against
`data/state.json`, scoring, routing, email and state updates.

## Steps

1. **Fetch new candidates** (deduped against state and pre-filtered):

   ```bash
   pnpm radar fetch --json --since-state
   ```

   The command also writes `out/candidates.json`. Read that file (stdout may contain pnpm
   banners). If it is an empty array, tell the user there is nothing new and stop.

2. **Classify every candidate yourself** and write `out/classified.json`: a JSON array with
   exactly one object per candidate, in the schema below. Include irrelevant items too (use
   `event_type: "other"`) so they are marked as seen.

3. **Send**:

   ```bash
   pnpm radar send --input out/classified.json
   ```

   It validates every object with Zod, skips invalid ones (and logs why), scores per the
   profile in `radar.config.yaml`, sends instant alerts and the digest when due, and updates
   `data/state.json`. If it reports invalid items, fix them and run `send` again with only
   the fixed items.

4. Report back in 3 to 5 lines: how many candidates, how many signals by event type, what was
   emailed (`out/run-report.json`), and the single most interesting opportunity.

## Output schema (one object per candidate)

Copy these fields unchanged from the candidate: `content_hash`, `canonical_url`, `source_id`,
`source_name`, `title`, `published_at`. Copy `other_sources` and `source_quality` if present.
Then add:

| field               | type           | rules                                                                                                                                                                            |
| ------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `company_name`      | string         | The company the event is about. For acquisitions, the acquirer. `"Unknown"` if unclear. If `hints.company` exists, use it.                                                       |
| `company_domain`    | string or null | Only if obvious from the item. Never guess.                                                                                                                                      |
| `event_type`        | enum           | `funding`, `acquisition`, `expansion`, `leadership_hire`, `product_launch`, `partnership_contract`, `ipo_filing`, `hiring_announcement`, `layoffs`, `accelerator_batch`, `other` |
| `amount_usd`        | number or null | Convert: 1 USD = 84 INR, 1 crore = 10,000,000, 1 lakh = 100,000.                                                                                                                 |
| `round`             | string or null | e.g. `"Seed"`, `"Series A"`.                                                                                                                                                     |
| `investors`         | string[]       | Named investors only.                                                                                                                                                            |
| `geographies`       | string[]       | Countries and cities, e.g. `["India", "Bengaluru"]`.                                                                                                                             |
| `sectors`           | string[]       | 1 to 3 lowercase tags, e.g. `["fintech", "ai"]`.                                                                                                                                 |
| `roles_likely`      | string[]       | From: `engineering, product, design, data, sales, marketing, ops, finance, hr, customer_success, leadership`.                                                                    |
| `hiring_likelihood` | integer 0-100  | hiring_announcement 85-95, Series B+ 75-90, seed 55-70, expansion 65-85, leadership_hire 50-65, launch 40-55, layoffs 0-15, other 0-20.                                          |
| `hiring_reason`     | string         | One sentence.                                                                                                                                                                    |
| `summary`           | string         | At most 2 short sentences, entirely in your own words. Max 320 chars.                                                                                                            |
| `suggested_action`  | string         | One concrete sentence for a job seeker.                                                                                                                                          |
| `outreach_opener`   | string         | One friendly sentence to send someone at the company.                                                                                                                            |
| `confidence`        | number 0-1     | Below 0.4 when unsure.                                                                                                                                                           |

Event hints: `hints.roles` present means an HN "Who is hiring" post (`hiring_announcement`);
`hints.form == "D"` means an SEC Form D filing (`funding`, amount usually unknown).

## Rules

- Summarize in your own words. Never copy sentences or phrases from the title or snippet.
- Use only facts in the item. Do not invent amounts, investors, roles or names.
- When unsure what happened, use `event_type: "other"` with `confidence` below 0.4.
- Weekly roundups and market news are `other`.
- Do not use em dashes anywhere. Use commas, colons or hyphens.
- Never fetch the full articles. The title and snippet are all you need.

## Example object

<!-- example:start -->

```json
{
  "content_hash": "3f2a9c1d0b7e4a5f6c8d9e01",
  "canonical_url": "https://inc42.com/buzz/fintech-startup-zeta-pay-raises-20-mn-series-b",
  "source_id": "inc42",
  "source_name": "Inc42",
  "title": "Fintech Startup Zeta Pay Raises $20 Mn In Series B Led By Northstar Ventures",
  "published_at": "2026-11-16T09:00:00.000Z",
  "company_name": "Zeta Pay",
  "company_domain": null,
  "event_type": "funding",
  "amount_usd": 20000000,
  "round": "Series B",
  "investors": ["Northstar Ventures"],
  "geographies": ["India", "Bengaluru"],
  "sectors": ["fintech"],
  "roles_likely": ["engineering", "product", "sales"],
  "hiring_likelihood": 82,
  "hiring_reason": "A fresh Series B usually funds engineering and sales hiring over the next two quarters.",
  "summary": "Zeta Pay closed a $20M Series B led by Northstar Ventures. The money goes into its lending tools for small merchants.",
  "suggested_action": "Check Zeta Pay's careers page and message the engineering lead this week.",
  "outreach_opener": "Congrats on the Series B, Zeta Pay team! I'd love to help you scale lending infrastructure.",
  "confidence": 0.85
}
```

<!-- example:end -->
