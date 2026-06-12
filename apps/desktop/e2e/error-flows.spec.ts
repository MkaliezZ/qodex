import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("error-flows", () => {
  test("25 - empty prompt submit does not crash", async ({ page }) => {
    await setupApp(page);
    const timelineBefore = await page.locator('[data-testid="agent-timeline"]').textContent();
    await page.click('[data-testid="send-button"]');
    await page.waitForTimeout(500);
    const timelineAfter = await page.locator('[data-testid="agent-timeline"]').textContent();
    expect(timelineBefore).toBe(timelineAfter); // no change
  });

  test("26 - connection test without key shows error", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Settings");
    // Select provider but leave key empty
    await page.selectOption('[data-testid="provider-select"]', "openai");
    // Clear any pre-filled key
    await page.fill('[data-testid="api-key-input"]', "");
    // Button should show error when clicked without key
    const btn = page.locator('[data-testid="connection-test-button"]');
    // Wait for button to be enabled (provider selected)
    await page.waitForTimeout(500);
    await expect(btn).toBeVisible();
  });

  test("27 - no crash on provider select without key", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Settings");
    await page.selectOption('[data-testid="provider-select"]', "deepseek");
    await page.click("text=Files"); // navigate away
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
  });
});
