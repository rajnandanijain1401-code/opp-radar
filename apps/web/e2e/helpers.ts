import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

const LINK_FILE = join(process.cwd(), ".data", "last-magic-link.json");

/** The console email provider saves the latest magic link to disk in dev. */
export async function magicLinkFor(email: string): Promise<string> {
  let url = "";
  await expect
    .poll(
      () => {
        if (!existsSync(LINK_FILE)) return "";
        const j = JSON.parse(readFileSync(LINK_FILE, "utf8")) as { email: string; url: string };
        url = j.email === email ? j.url : "";
        return url;
      },
      { timeout: 30_000 },
    )
    .not.toBe("");
  return url;
}

export async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByPlaceholder("you@email.com").fill(email);
  await page.getByRole("button", { name: /send my link/i }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible({
    timeout: 45_000,
  });
  const url = await magicLinkFor(email);
  // Links point at RADAR_PUBLIC_URL; keep the test on its own server.
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ""));
}
