import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Generates README / landing images. Run `pnpm radar preview` at the repo root first, then
 * `pnpm --filter @opp-radar/web screenshots`.
 */
const ROOT = resolve(process.cwd(), "..", "..");
const DOCS = join(ROOT, "docs", "images");
const PUBLIC = join(process.cwd(), "public", "images");

test.beforeAll(() => {
  mkdirSync(DOCS, { recursive: true });
  mkdirSync(PUBLIC, { recursive: true });
});

test("@screenshots email previews", async ({ page }) => {
  for (const [file, out] of [
    ["preview-instant.html", "email-preview.png"],
    ["preview.html", "digest-preview.png"],
  ] as const) {
    const src = join(ROOT, "out", file);
    test.skip(!existsSync(src), "run `pnpm radar preview` first");
    await page.setViewportSize({ width: 680, height: 900 });
    await page.goto(`file://${src}`);
    await page.screenshot({ path: join(DOCS, out), fullPage: false });
  }
  copyFileSync(join(DOCS, "email-preview.png"), join(PUBLIC, "email-preview.png"));
});

test("@screenshots landing and dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/");
  await expect(page.getByTestId("landing-signals").locator("li").first()).toBeVisible();
  await page.screenshot({ path: join(DOCS, "landing.png") });

  await signUp(page, `shots-${Date.now()}@oppradar.test`);
  await page.getByRole("button", { name: "Engineering", exact: true }).click();
  await page.getByRole("button", { name: "Product", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "fintech", exact: true }).click();
  await page.getByRole("button", { name: "ai", exact: true }).click();
  await page.getByRole("button", { name: "India", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Zeta Pay, Fieldstack");
  await page.getByLabel("Company name").press("Enter");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("onboarding-preview")).toBeVisible();
  await page.screenshot({ path: join(DOCS, "onboarding-preview.png") });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my radar" }).click();
  await expect(page.getByTestId("feed").getByTestId("signal-card").first()).toBeVisible();
  await page.goto("/dashboard");
  await page.screenshot({ path: join(DOCS, "dashboard.png") });
});
