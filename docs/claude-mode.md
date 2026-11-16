# Run OppRadar on your own Claude

Claude mode uses Claude (in Claude Code or the Claude desktop app) as the classifier, so you
do not need an Anthropic API key. The CLI does the fetching, dedupe, scoring, routing and
email. Claude only reads the new headlines and fills in the Signal schema.

## One-time setup

```bash
git clone https://github.com/rajnandanijain1401-code/opp-radar.git
cd opp-radar
pnpm install
cp .env.example .env   # then set SMTP_* and RADAR_FROM_EMAIL (see README for Gmail)
```

Edit `radar.config.yaml`: your email in `recipients`, your roles, sectors, geographies and
watchlist. Then check email works:

```bash
pnpm radar test-email
```

## Run it

Open the repo in Claude Code and type:

```
/radar
```

or just say "run my radar". The project ships a skill at `.claude/skills/opp-radar/SKILL.md`
that tells Claude exactly what to do:

1. `pnpm radar fetch --json --since-state` writes new, deduped candidates to `out/candidates.json`.
2. Claude classifies each one into `out/classified.json` (schema and rules are in the skill).
3. `pnpm radar send --input out/classified.json` validates with Zod, scores, routes, emails and
   updates `data/state.json`.

Use `/radar --force-digest` to get the digest right away.

## Run it on a schedule (Claude scheduled task)

In the Claude desktop app, create a scheduled task (for example every 2 hours between 7:00
and 22:00) with the working folder set to your `opp-radar` checkout, and paste this prompt:

```text
You are running my OppRadar in Claude mode. Work in this repository only.

1. Run: pnpm radar fetch --json --since-state
2. Read out/candidates.json. If it is an empty array, reply "No new candidates" and stop.
3. Follow .claude/skills/opp-radar/SKILL.md exactly: classify every candidate into the Signal
   schema, in your own words, max 2 sentences per summary, no em dashes, "other" with low
   confidence when unsure. Write the JSON array to out/classified.json.
4. Run: pnpm radar send --input out/classified.json
5. If send reports invalid items, fix only those and run send again with just the fixed items.
6. Reply with: number of candidates, signals by event type, emails sent (from
   out/run-report.json), and the single best opportunity in one line.

Do not fetch full articles. Do not change radar.config.yaml or sources.yaml.
Do not commit or push anything.
```

The digest goes out when a run happens during your `digest_hour_local`. If your schedule
might skip that hour, add `--force-digest` to the send step of one daily run instead.

## Tips

- `.env` is read by the CLI through your shell. If you use a scheduled task, export the SMTP
  variables in your shell profile or run `set -a; source .env; set +a` first.
- The state file is local in this mode. Keep it in git if you want history, or ignore it.
- Claude mode and GitHub Actions mode share the same state format, so you can switch any time.
- Cost: zero API spend. Claude reads only titles and short snippets.
