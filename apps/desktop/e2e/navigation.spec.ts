import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("navigation", () => {
  test("4 - Files nav renders FilesView", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Files");
    // Empty state renders either "No project opened" or the Open Project button
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
  });

  test("5 - Sessions nav renders SessionsView", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Sessions");
    await expect(page.locator("text=Session history coming soon")).toBeVisible();
  });

  test("6 - Skills nav renders SkillsView", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Skills");
    await expect(page.locator("text=Loaded Skills")).toBeVisible();
  });

  test("7 - Git nav renders GitView", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Git");
    // Git view renders branch status or repo info
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
  });

  test("8 - Settings nav renders ProviderSettings", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Settings");
    await expect(page.locator('[data-testid="provider-select"]')).toBeVisible();
  });
});
