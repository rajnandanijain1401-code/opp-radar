# Decisions

One line per decision: what was decided, and why.

- Internal workspace packages (`core`, `cli`, `emails`) ship TypeScript source (no build step); Next.js transpiles them and the CLI runs via `tsx`, which keeps the monorepo simple and fast.
- Pinned to proven majors (TypeScript 5.9, ESLint 9, Vitest 3, Next.js 15, Zod 4) instead of the newest majors, for ecosystem compatibility on Node 20.
- Default LLM model is `claude-haiku-5-5` (smallest current Claude Haiku per Anthropic docs, checked 2026-11-16); override with `RADAR_MODEL`.
- Docker is optional for local dev: if `DATABASE_URL` is unset, the web app uses embedded PGlite (Postgres in WASM) stored in `apps/web/.pglite`, so `pnpm dev` works with zero services.
- pnpm 9 is pinned via `packageManager` so CI and contributors resolve the same lockfile format.
- Feed verification (2026-11-16): Inc42, Entrackr (`/rss`, not `/feed/`), YourStory, ET Tech, ET Startups, TechCrunch Venture/Startups, Crunchbase News and SEC EDGAR verified OK.
- VCCircle disabled: `/feed` and other guesses returned 404 and no public RSS was found.
- Business Standard disabled: their RSS returned HTTP 403 (Access Denied) to automated clients.
- Moneycontrol: no dedicated startups feed could be verified, so the business feed is used and the pre-filter discards non-startup news.
- Reddit disabled by default: unauthenticated `.json` listings returned HTTP 403; the adapter raises `SourceBlockedError` and the run continues without it.
- Google News RSS disabled by default: news.google.com/robots.txt disallows `/rss/search` for generic agents and the operating rules require respecting robots.txt; adapter, templates and watchlist queries are fully implemented and tested against fixtures.
- SEC EDGAR needs a User-Agent with a real contact email (a generic UA got 403), so the adapter sends `OppRadar <RADAR_CONTACT_EMAIL>` and skips itself when the email is unset.
- SEC Form D filings from pooled vehicles (funds, LPs, SPVs) and `D/A` amendments are skipped: they are not hiring signals.
- Fixtures are hand-written in the exact wire format of each source (verified against live responses) with fictional companies, so tests are deterministic and we never commit third-party article text.
- Fixtures use relative time tokens (`{{iso:-3h}}`) so fixture-mode demos always look fresh.
- Domain JSON (Signal, Candidate, UserProfile) uses snake_case keys to match the spec and the Claude-mode schema; TypeScript variables stay camelCase.
- `content_hash` = first 24 hex chars of sha256(canonical URL without scheme and `www.`), so the same article behind tracking params, AMP or a decodable Google News link hashes identically.
- Near-duplicate detection uses Jaccard on normalized title unigrams + bigrams (threshold 0.8), with money/verb normalization (`Mn`/`million` to `m`, `bags`/`secures` to `raise`). Simpler and more explainable than simhash for headline-length text.
- Dedupe keeps the earliest report and lists the others in `other_sources`; clustering (same normalized company + event type within 72h) runs after classification, persists clusters in state/DB so a story arriving a day later joins its original cluster.
- New-style opaque Google News IDs cannot be decoded offline; we keep the Google URL and rely on title dedupe rather than calling Google per item.
- LLM calls use `client.messages.parse` with `output_config.format = zodOutputFormat(...)` (structured outputs) and `effort: "low"` for cheap, fast classification; a lenient wire schema goes to the API and every item is re-validated against the strict Zod `ClassificationSchema`.
- Invalid or missing LLM items are retried once per batch, then filled by the rules classifier, so a run never fails because of the LLM.
- Rules-mode fallback results are not cached when LLM mode was intended, so a later run with budget can upgrade them; true rules-mode results are cached.
- The token budget is checked before each batch with a conservative estimate (about 4 chars per token plus ~260 output tokens per item), so we never start a call we cannot afford.
- Currency conversion in the rules engine uses fixed rates (1 USD = 84 INR, EUR 1.08, GBP 1.27); good enough for thresholds, documented in the LLM prompt too.
- Golden set: 30 hand-labeled fictional headlines across all 11 event types; rules mode scores 93% event-type accuracy (2 honest misses kept to avoid overfitting).
- Exclude keywords force the final score (not only relevance) to 0, so an excluded item can never reach a digest through hiring likelihood alone.
- Relevance treats an empty profile dimension as neutral (0.6, keywords 0.5) instead of a miss, so new users with sparse profiles still get useful digests; dimension weights: roles 35, sectors 25, geos 20, keywords 20.
- Recency decays exponentially with a 24h half-life; scoring weights and thresholds live in `DEFAULT_SCORING` and can be overridden from `radar.config.yaml`.
- Routing keeps only the best-scoring signal per cluster per user and skips clusters already delivered, which is how "never send the same cluster twice" is enforced on every channel.
- Instant overflow beyond the daily cap goes to the digest rather than being dropped.
- Weekly digests go out on Monday at the user's chosen local hour; timezones use `Intl.DateTimeFormat`, no date library.
- Job-board enrichment tries up to 4 slug guesses x 3 boards (Greenhouse, Lever, Ashby), caches per normalized company for 24h (including misses) and swallows all errors.
