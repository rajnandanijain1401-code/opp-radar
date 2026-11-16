# Contributing to OppRadar

Thanks for helping. Issues, new sources, classifier improvements and docs fixes are all welcome.

## Setup

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # must stay green
pnpm radar --fixtures run                  # whole pipeline on recorded fixtures, no network
pnpm dev                                   # web app on http://localhost:3000 (embedded Postgres)
```

Node 20+ and pnpm 9 are required. Docker is optional (`docker compose up -d` gives you a real
Postgres; set `DATABASE_URL` in `apps/web/.env.local`).

## Project layout

| Path              | What lives there                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/core`   | Pure TypeScript pipeline: sources, normalize, dedupe, classify, enrich, score, route, email view models |
| `packages/cli`    | The `radar` CLI and OSS-mode orchestration (state file, GitHub Actions)                                 |
| `packages/emails` | React Email templates and the SMTP / Resend / console providers                                         |
| `apps/web`        | Next.js hosted app: auth, onboarding, dashboard, public pages, cron, billing, admin                     |
| `sources.yaml`    | Every source and whether it is enabled (with notes for disabled ones)                                   |
| `DECISIONS.md`    | One line per non-obvious decision. Add to it when you make one.                                         |

## Adding a source

1. Check the terms: it must be a public RSS/Atom feed or an official API. No scraping of LinkedIn,
   X, Instagram or Facebook, no login or paywall bypass, and its `robots.txt` must allow the URL
   (the HTTP client enforces this).
2. If it is plain RSS, just add an entry to `sources.yaml` with `kind: rss`. Done.
3. Otherwise add an adapter in `packages/core/src/sources/<name>.ts`:
   - export `createXAdapter(def, ctx): SourceAdapter` whose `fetch(since)` returns `RawItem[]`
   - use `ctx.http` (rate limits, retries, robots, User-Agent come for free)
   - throw `SourceBlockedError` on 401/403 so the run disables it gracefully
   - keep `snippet` short; it is only used for classification and is never stored
4. Add the kind to `SourceDefSchema` and `createAdapter` in `sources/registry.ts`.
5. Record a fixture in `packages/core/fixtures/` (fictional companies, the source's real wire format,
   relative timestamps like `{{iso:-3h}}`), route it in `fixtures/manifest.json`, and add a test in
   `packages/core/test/sources/`.
6. Run `pnpm radar sources check --all` to verify it live.

## Changing the classifier

Run `pnpm eval` before and after. The rules classifier must stay at 70% or higher event-type accuracy
on `packages/core/test/golden.json`. Add labeled headlines to the golden set when you fix a miss.

## Style

- TypeScript strict, Prettier, Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- No em dashes anywhere in copy, docs, emails or UI text. Use commas, colons or hyphens.
- Never commit secrets or full article text.
