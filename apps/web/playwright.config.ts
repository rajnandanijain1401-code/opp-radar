import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/** Smoke tests run against `next dev` with an isolated embedded PGlite database and the console email provider. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm db:setup && pnpm exec next dev -p ${PORT}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PGLITE_DIR: ".pglite-e2e",
      PGLITE_RESET: "1",
      RADAR_PUBLIC_URL: baseURL,
      RADAR_EMAIL_PROVIDER: "console",
      RADAR_FIXTURES: "1",
      ADMIN_EMAILS: "admin@oppradar.test",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
