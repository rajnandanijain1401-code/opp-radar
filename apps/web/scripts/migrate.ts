/* Apply Drizzle migrations to Postgres (DATABASE_URL) or embedded PGlite (.pglite). */
import { join } from "node:path";
import { db } from "../lib/db";

const migrationsFolder = join(process.cwd(), "drizzle");

async function main() {
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
