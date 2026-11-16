import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { join } from "node:path";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

declare global {
  var __oppradarDb: Db | undefined;
}

/**
 * Postgres (Neon, Supabase, Docker) when DATABASE_URL is set. Otherwise embedded PGlite in
 * apps/web/.pglite, so `pnpm dev` works with zero services. One instance per process.
 */
function create(): Db {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 5), prepare: false });
    return drizzlePg(client, { schema });
  }
  // During `next build` several workers import this module at once; give each an in-memory
  // instance (pages skip queries at build time) instead of fighting over the data dir.
  const client =
    process.env.NEXT_PHASE === "phase-production-build"
      ? new PGlite()
      : new PGlite(process.env.PGLITE_DIR ?? join(process.cwd(), ".pglite"));
  return drizzlePglite(client, { schema }) as unknown as Db;
}

export const db: Db = globalThis.__oppradarDb ?? (globalThis.__oppradarDb = create());
export { schema };

export const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";
