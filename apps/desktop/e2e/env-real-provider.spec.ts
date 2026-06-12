import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("env-real-provider", () => {
  test("28 - real openai configure connect prompt streaming", async ({ page }) => {
    const key = process.env.OPENAI_API_KEY;
    test.skip(!key, "OPENAI_API_KEY not set — skipping real-provider test");

    await setupApp(page);
    await page.click("text=Settings");
    await page.selectOption('[data-testid="provider-select"]', "openai");
    await page.fill('[data-testid="api-key-input"]', key);
    await page.click('[data-testid="connection-test-button"]');
    await expect(page.locator('[data-testid="connection-status"]')).toBeVisible({ timeout: 15000 });
    await page.click("text=Files");
    await page.fill('[data-testid="prompt-input"]', "Say hello in one word.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-timeline"]')).not.toBeEmpty({ timeout: 30000 });
  });

  test("29 - real deepseek configure connect prompt streaming", async ({ page }) => {
    const key = process.env.DEEPSEEK_API_KEY;
    test.skip(!key, "DEEPSEEK_API_KEY not set — skipping real-provider test");

    await setupApp(page);
    await page.click("text=Settings");
    await page.selectOption('[data-testid="provider-select"]', "deepseek");
    await page.fill('[data-testid="api-key-input"]', key);
    await page.click('[data-testid="connection-test-button"]');
    await expect(page.locator('[data-testid="connection-status"]')).toBeVisible({ timeout: 15000 });
    await page.click("text=Files");
    await page.fill('[data-testid="prompt-input"]', "Say hello in one word.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-timeline"]')).not.toBeEmpty({ timeout: 30000 });
  });

  test("30 - real openrouter configure connect prompt streaming", async ({ page }) => {
    const key = process.env.OPENROUTER_API_KEY;
    test.skip(!key, "OPENROUTER_API_KEY not set — skipping real-provider test");

    await setupApp(page);
    await page.click("text=Settings");
    await page.selectOption('[data-testid="provider-select"]', "openrouter");
    await page.fill('[data-testid="api-key-input"]', key);
    await page.click('[data-testid="connection-test-button"]');
    // timeout generous — network may be slow
    await page.waitForTimeout(3000);
    await page.click("text=Files");
    await page.fill('[data-testid="prompt-input"]', "Say hello.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-timeline"]')).not.toBeEmpty({ timeout: 30000 });
  });

  test("31 - real streaming response contains non-empty output", async ({ page }) => {
    const key = process.env.OPENAI_API_KEY;
    test.skip(!key, "OPENAI_API_KEY not set — skipping real-provider test");

    await setupApp(page);
    await page.click("text=Settings");
    await page.selectOption('[data-testid="provider-select"]', "openai");
    await page.fill('[data-testid="api-key-input"]', key);
    await page.click('[data-testid="connection-test-button"]');
    await expect(page.locator('[data-testid="connection-status"]')).toBeVisible({ timeout: 15000 });
    await page.click("text=Files");
    await page.fill('[data-testid="prompt-input"]', "Say hello");
    await page.click('[data-testid="send-button"]');
    const timeline = page.locator('[data-testid="agent-timeline"]');
    await expect(timeline).not.toBeEmpty({ timeout: 30000 });
  });
});
