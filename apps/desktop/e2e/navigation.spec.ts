import { test, expect } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";

test.describe("navigation", () => {
  test("primary navigation and empty Agent state are accessible", async ({ page }) => {
    await setupApp(page);
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    for (const label of ["Agent", "Files", "Sessions", "Skills", "Git", "Settings", "Marketplace"]) {
      await expect(navigation.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expect(page.getByText("No task is running.")).toBeVisible();
    await expect(page.getByText("Describe what you want KerniQ to inspect or change.")).toBeVisible();
    await expect(page.locator('[data-testid="context-inspector"]')).toBeVisible();
    await expect(page.locator('[data-testid="prompt-input"]')).toBeEnabled();
    await expect(page.locator('[data-testid="send-button"]')).toBeEnabled();
  });

  test("4 - Files nav renders FilesView", async ({ page }) => {
    await setupApp(page);
    await page.getByRole("button", { name: "Files" }).click();
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(page.getByText("No project opened")).toBeVisible();
  });

  test("5 - Sessions nav renders SessionsView", async ({ page }) => {
    await setupApp(page);
    await page.getByRole("button", { name: "Sessions" }).click();
    await expect(page.locator('[data-testid="sessions-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="session-persistence-status"]')).toContainText("Browser memory only");
  });

  test("6 - Skills nav renders SkillsView", async ({ page }) => {
    await setupApp(page);
    await page.getByRole("button", { name: "Skills" }).click();
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
    await expect(page.getByText("2 of 3 enabled")).toBeVisible();
  });

  test("7 - Git nav renders GitView", async ({ page }) => {
    await setupApp(page);
    await page.getByRole("button", { name: "Git" }).click();
    await expect(page.getByRole("heading", { name: "Source control" })).toBeVisible();
    await expect(page.getByText("No repository detected")).toBeVisible();
  });

  test("8 - Settings nav renders ProviderSettings", async ({ page }) => {
    await setupApp(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.locator('[data-testid="provider-select"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registry sources" })).toBeVisible();
  });

  test("9 - Marketplace renders a truthful empty state", async ({ page }) => {
    await setupApp(page);
    await page.getByRole("button", { name: "Marketplace Beta" }).click();
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await expect(page.getByText("Search the connected registries")).toBeVisible();
  });
});
