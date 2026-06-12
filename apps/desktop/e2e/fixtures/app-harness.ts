import { test as base, expect, type Page } from "@playwright/test";

export const test = base;

export async function setupApp(page: Page) {
  await page.goto("/");
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 10000 });
}

export async function navigateTo(page: Page, navLabel: string) {
  await page.click(`text=${navLabel}`);
  await page.waitForTimeout(300);
}

export async function configureProvider(page: Page, providerId: string, apiKey: string) {
  await navigateTo(page, "Settings");
  await page.selectOption('[data-testid="provider-select"]', providerId);
  await page.fill('[data-testid="api-key-input"]', apiKey);
}

export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  return errors;
}
