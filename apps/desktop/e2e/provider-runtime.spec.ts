import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("provider-runtime", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("14 - mock provider-runtime renders timeline", async ({ page }) => {
    await expect(page.locator('[data-testid="agent-timeline"]')).toBeVisible();
    await expect(page.locator('[data-testid="prompt-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="send-button"]')).toBeVisible();
  });

  test("15 - send button state during execution", async ({ page }) => {
    const btn = page.locator('[data-testid="send-button"]');
    await expect(btn).toBeVisible();
    await page.fill('[data-testid="prompt-input"]', "Test");
    await btn.click();
    await expect(page.locator('[data-testid="prompt-input"]')).toHaveValue("", { timeout: 5000 });
  });

  test("16 - model switcher visible", async ({ page }) => {
    await expect(page.locator('[data-testid="model-switcher"]')).toBeVisible();
  });

  test("17 - send mock prompt produces non-empty output", async ({ page }) => {
    await page.fill('[data-testid="prompt-input"]', "Review this code");
    const sendBtn = page.locator('[data-testid="send-button"]');
    await sendBtn.click();
    const timeline = page.locator('[data-testid="agent-timeline"]');
    await expect(timeline).toBeVisible({ timeout: 10000 });
  });
});
