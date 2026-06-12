import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("mock-fallback", () => {
  test("18 - no provider configured uses mock runtime", async ({ page }) => {
    await setupApp(page);
    await page.fill('[data-testid="prompt-input"]', "Test mock");
    const sendBtn = page.locator('[data-testid="send-button"]');
    await sendBtn.click();
    await expect(page.locator('[data-testid="agent-timeline"]')).toBeVisible({ timeout: 10000 });
  });

  test("19 - mock streaming produces text output", async ({ page }) => {
    await setupApp(page);
    await page.fill('[data-testid="prompt-input"]', "Hello");
    const sendBtn = page.locator('[data-testid="send-button"]');
    await sendBtn.click();
    const timeline = page.locator('[data-testid="agent-timeline"]');
    await expect(timeline).toContainText("Qodex", { timeout: 10000 });
  });
});
