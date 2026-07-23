import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Route } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";
import {
  configureDeterministicProvider,
  installAgentCommandFixture,
  installProjectFixture,
} from "./fixtures/project-fixture";

const projectFiles = {
  "src/math.ts": "export const add = (a: number, b: number) => a + b;\n",
  "src/nested/value.ts": "export const value = 42;\n",
  "package.json": JSON.stringify({ scripts: { test: "node test.mjs" } }),
};

async function openFixtureProject(page: Parameters<typeof setupApp>[0]) {
  await page.getByRole("button", { name: "Open Project" }).click();
  await expect(page.locator('[data-testid="project-access-source"]')).toHaveAttribute(
    "data-project-source",
    "browser",
  );
}

async function selectedText(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return selection?.toString() ?? "";
  });
}

async function fulfillSse(route: Route, event: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body: `data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`,
  });
}

test.describe("KerniQ v0.5.3.1 UI correction", () => {
  test("production imports the consolidated base stylesheet", async () => {
    const mainPath = new URL("../src/main.tsx", import.meta.url);
    const legacyPath = new URL("../src/styles/globals.css", import.meta.url);
    const source = readFileSync(mainPath, "utf8");

    expect(source).toContain('import "./styles/base.css";');
    expect(source).not.toContain("globals.css");
    expect(existsSync(legacyPath)).toBe(false);
  });

  test("Agent, Session, project path, and command evidence remain selectable", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await installAgentCommandFixture(page, projectFiles["src/math.ts"]);
    await setupApp(page);

    const agentCopy = page.getByText("Describe what you want KerniQ to inspect or change.");
    expect(await selectedText(agentCopy)).toContain("Describe what you want KerniQ");
    expect(await agentCopy.evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");

    await page.getByRole("button", { name: "Sessions" }).click();
    const sessionEvidence = page.locator('[data-testid="session-persistence-status"]');
    expect(await selectedText(sessionEvidence)).toContain("Browser memory only");

    await configureDeterministicProvider(page, "unused");
    await page.route("**/chat/completions", async (route) => {
      await fulfillSse(route, {
        choices: [{
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "list-ui",
                type: "function",
                function: { name: "list_project_commands", arguments: "{}" },
              },
              {
                index: 1,
                id: "run-ui",
                type: "function",
                function: {
                  name: "run_project_command",
                  arguments: "{\"commandId\":\"package-script:test\"}",
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        }],
      });
    });
    await openFixtureProject(page);

    const pathText = page.locator('button[title="src/math.ts"] .project-tree-name');
    await expect(pathText).toBeVisible();
    expect(await pathText.evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
    expect(await selectedText(pathText)).toBe("math.ts");

    await page.getByTestId("prompt-input").fill("Run the project test.");
    await page.getByTestId("send-button").click();
    await expect(page.getByTestId("command-approval")).toBeVisible();

    const command = page.getByTestId("command-executable");
    const args = page.getByTestId("command-args");
    expect(await command.evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
    expect(await args.evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
    expect(await selectedText(command)).toBe("pnpm");
    expect(await selectedText(args)).toBe("run test");
  });

  test("project directories toggle locally without changing file selection", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await setupApp(page);
    await openFixtureProject(page);

    const directory = page.getByRole("button", { name: "Collapse src" });
    const childFile = page.locator('button[title="src/math.ts"]');
    await expect(directory).toHaveAttribute("aria-expanded", "true");
    await expect(childFile).toBeVisible();
    await expect(page.getByTestId("context-inspector").getByText("None selected")).toBeVisible();

    await directory.click();
    const collapsedDirectory = page.getByRole("button", { name: "Expand src" });
    await expect(collapsedDirectory).toHaveAttribute("aria-expanded", "false");
    await expect(childFile).toBeHidden();
    await expect(page.getByTestId("context-inspector").getByText("None selected")).toBeVisible();

    await collapsedDirectory.focus();
    await expect(collapsedDirectory).toBeFocused();
    await collapsedDirectory.press("Enter");
    const expandedDirectory = page.getByRole("button", { name: "Collapse src" });
    await expect(expandedDirectory).toHaveAttribute("aria-expanded", "true");
    await expect(childFile).toBeVisible();

    await expandedDirectory.press(" ");
    await expect(page.getByRole("button", { name: "Expand src" })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Expand src" }).press(" ");
    await expect(childFile).toBeVisible();

    await childFile.click();
    await expect(childFile).toHaveClass(/is-selected/);
    await expect(page.getByTestId("context-inspector").getByText(/1 ·/)).toBeVisible();
  });

  test("composer popovers open upward, stay visible, close with Escape, and restore focus", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await setupApp(page);

    const modelTrigger = page.getByTestId("model-switcher");
    await modelTrigger.click();
    const modelPopover = page.getByTestId("model-popover");
    await expect(modelPopover).toBeVisible();

    const modelTriggerBox = await modelTrigger.boundingBox();
    const modelPopoverBox = await modelPopover.boundingBox();
    expect(modelTriggerBox).not.toBeNull();
    expect(modelPopoverBox).not.toBeNull();
    expect(modelPopoverBox!.y + modelPopoverBox!.height).toBeLessThanOrEqual(modelTriggerBox!.y + 1);
    expect(modelPopoverBox!.x).toBeGreaterThanOrEqual(0);
    expect(modelPopoverBox!.y).toBeGreaterThanOrEqual(0);
    expect(modelPopoverBox!.x + modelPopoverBox!.width).toBeLessThanOrEqual(1024);
    expect(modelPopoverBox!.y + modelPopoverBox!.height).toBeLessThanOrEqual(768);

    await page.keyboard.press("Escape");
    await expect(modelPopover).toBeHidden();
    await expect(modelTrigger).toBeFocused();

    const skillTrigger = page.getByTestId("skill-drawer-trigger");
    await skillTrigger.click();
    const skillPopover = page.getByTestId("skill-popover");
    await expect(skillPopover).toBeVisible();
    const skillTriggerBox = await skillTrigger.boundingBox();
    const skillPopoverBox = await skillPopover.boundingBox();
    expect(skillTriggerBox).not.toBeNull();
    expect(skillPopoverBox).not.toBeNull();
    expect(skillPopoverBox!.y + skillPopoverBox!.height).toBeLessThanOrEqual(skillTriggerBox!.y + 1);
    await page.keyboard.press("Escape");
    await expect(skillPopover).toBeHidden();
    await expect(skillTrigger).toBeFocused();
  });

  test("compact Inspector opens as an accessible drawer and restores trigger focus", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await setupApp(page);

    await expect(page.locator(".qodex-right-panel")).toBeHidden();
    const trigger = page.getByTestId("open-context-inspector");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const drawer = page.getByTestId("compact-inspector-layer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("dialog", { name: "Context inspector" })).toBeVisible();
    await expect(drawer.getByTestId("context-inspector")).toBeVisible();
    await expect(drawer.locator(".compact-inspector-close")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("wide layout keeps the fixed Inspector and hides the compact trigger", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupApp(page);

    await expect(page.locator(".qodex-right-panel")).toBeVisible();
    await expect(page.locator(".qodex-right-panel").getByTestId("context-inspector")).toBeVisible();
    await expect(page.getByTestId("open-context-inspector")).toBeHidden();
  });
});
