import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("landing page shows the pitch, live signals and pricing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every funding round is a job opening",
  );
  await expect(page.getByTestId("landing-signals").locator("li")).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Simple pricing" })).toBeVisible();
  await expect(page.getByRole("button", { name: /join pro waitlist/i })).toBeVisible();
});

test("public signals page lists today's signals with sources", async ({ page }) => {
  await page.goto("/signals");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today's hiring signals");
  await expect(page.getByTestId("signal-card").first()).toBeVisible();
});

test("signup with magic link, onboarding, dashboard and preferences", async ({ page }) => {
  const email = `e2e-${Date.now()}@oppradar.test`;
  await signUp(page, email);

  await expect(page).toHaveURL(/onboarding/);
  await page.getByRole("button", { name: "Engineering", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "fintech", exact: true }).click();
  await page.getByRole("button", { name: "India", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill("Zeta Pay");
  await page.getByLabel("Company name").press("Enter");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByTestId("onboarding-preview").getByTestId("signal-card").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my radar" }).click();

  await expect(page).toHaveURL(/dashboard\?welcome=1/);
  await expect(page.getByTestId("feed").getByTestId("signal-card").first()).toContainText(
    "Zeta Pay",
  );

  await page.getByRole("link", { name: "Delivery settings" }).click();
  await page.getByLabel("Delivery hour").selectOption("9");
  await page.getByRole("button", { name: "Save delivery settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByLabel("Delivery hour")).toHaveValue("9");

  const exp = await page.request.get("/api/account/export");
  expect(exp.ok()).toBeTruthy();
  expect((await exp.json()).user.email).toBe(email);
});

test("unsubscribe rejects invalid tokens without signing in", async ({ page }) => {
  await page.goto("/unsubscribe?token=nope");
  await expect(page.getByRole("heading", { name: "Link not valid" })).toBeVisible();
});

test("cron endpoint runs the pipeline on fixtures", async ({ request }) => {
  const res = await request.post("/api/cron/pipeline");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
});
