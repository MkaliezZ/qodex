import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("provider-settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.click("text=Settings");
  });

  test("9 - provider dropdown has 4 options", async ({ page }) => {
    const options = page.locator('[data-testid="provider-select"] option');
    await expect(options).toHaveCount(5); // 4 + 1 disabled placeholder
  });

  test("10 - api key input masked by default", async ({ page }) => {
    const input = page.locator('[data-testid="api-key-input"]');
    await expect(input).toHaveAttribute("type", "password");
  });

  test("11 - show/hide toggle changes input type", async ({ page }) => {
    const input = page.locator('[data-testid="api-key-input"]');
    await page.click('[data-testid="api-key-toggle"]');
    await expect(input).toHaveAttribute("type", "text");
    await page.click('[data-testid="api-key-toggle"]');
    await expect(input).toHaveAttribute("type", "password");
  });

  test("12 - connection test without key shows error", async ({ page }) => {
    await page.click('[data-testid="connection-test-button"]');
    await expect(page.locator("text=Provider and API key required")).toBeVisible();
  });

  test("13 - model selector not visible before connection", async ({ page }) => {
    await expect(page.locator('[data-testid="model-select"]')).not.toBeVisible();
  });
});
