import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("security", () => {
  test("20 - api key input is password type by default", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Settings");
    await expect(page.locator('[data-testid="api-key-input"]')).toHaveAttribute("type", "password");
  });

  test("21 - api key does not appear in model switcher", async ({ page }) => {
    await setupApp(page);
    await page.click("text=Settings");
    await page.fill('[data-testid="api-key-input"]', "sk-test-key-12345");
    await page.click('[data-testid="api-key-toggle"]'); // hide
    // Go back to agent view
    await page.click("text=Files");
    const switcher = page.locator('[data-testid="model-switcher"]');
    const text = await switcher.textContent();
    expect(text).not.toContain("sk-test-key-12345");
  });

  test("22 - localStorage does not contain API key", async ({ page }) => {
    await setupApp(page);
    const hasKey = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const val = localStorage.getItem(localStorage.key(i)!);
        if (val && val.includes("sk-")) return true;
      }
      return false;
    });
    expect(hasKey).toBe(false);
  });

  test("23 - sessionStorage does not contain API key", async ({ page }) => {
    await setupApp(page);
    const hasKey = await page.evaluate(() => {
      for (let i = 0; i < sessionStorage.length; i++) {
        const val = sessionStorage.getItem(sessionStorage.key(i)!);
        if (val && val.includes("sk-")) return true;
      }
      return false;
    });
    expect(hasKey).toBe(false);
  });

  test("24 - console free of API key errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    await setupApp(page);
    // No API keys should appear in console errors
    const hasKeyInLogs = errors.some((e) => e.includes("sk-"));
    expect(hasKeyInLogs).toBe(false);
  });
});
