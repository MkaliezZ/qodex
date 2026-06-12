import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("app-launch", () => {
  test("1 - app shell renders", async ({ page }) => {
    await setupApp(page);
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
  });

  test("2 - agent workspace header visible", async ({ page }) => {
    await setupApp(page);
    await expect(page.locator("text=Agent Workspace")).toBeVisible();
  });

  test("3 - prompt input and send button visible", async ({ page }) => {
    await setupApp(page);
    await expect(page.locator('[data-testid="prompt-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="send-button"]')).toBeVisible();
  });
});
