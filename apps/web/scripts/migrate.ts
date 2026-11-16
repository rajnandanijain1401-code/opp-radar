/* Apply Drizzle migrations to Postgres (DATABASE_URL) or embedded PGlite (.pglite). */
import { rmSync } from "node:fs";
import { join } from "node:path";

const migrationsFolder = join(process.cwd(), "drizzle");

async function main() {
  // E2E runs start from a clean embedded database. Only ever touches the PGlite dir.
  if (!process.env.DATABASE_URL && process.env.PGLITE_RESET === "1" && process.env.PGLITE_DIR) {
    rmSync(join(process.cwd(), process.env.PGLITE_DIR), { recursive: true, force: true });
  }
  const { db } = await import("../lib/db");
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
  }
  console.log(`migrations applied (${process.env.DATABASE_URL ? "postgres" : "pglite"})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
