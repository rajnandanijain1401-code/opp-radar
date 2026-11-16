# Decisions

One line per decision: what was decided, and why.

- Internal workspace packages (`core`, `cli`, `emails`) ship TypeScript source (no build step); Next.js transpiles them and the CLI runs via `tsx`, which keeps the monorepo simple and fast.
- Pinned to proven majors (TypeScript 5.9, ESLint 9, Vitest 3, Next.js 15, Zod 4) instead of the newest majors, for ecosystem compatibility on Node 20.
- Default LLM model is `claude-haiku-5-5` (smallest current Claude Haiku per Anthropic docs, checked 2026-11-16); override with `RADAR_MODEL`.
- Docker is optional for local dev: if `DATABASE_URL` is unset, the web app uses embedded PGlite (Postgres in WASM) stored in `apps/web/.pglite`, so `pnpm dev` works with zero services.
- pnpm 9 is pinned via `packageManager` so CI and contributors resolve the same lockfile format.
