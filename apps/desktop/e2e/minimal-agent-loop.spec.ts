import { expect, test, type Page, type Route } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";
import {
  configureDeterministicProvider,
  installAgentCommandFixture,
  installProjectFixture,
  readAgentCommandFixture,
  readProjectFixture,
} from "./fixtures/project-fixture";

const originalMath = "export const divide = (a: number, b: number) => 0;\n";
const firstMath = "export const divide = (a: number, b: number) => a * b;\n";
const correctedMath = "export const divide = (a: number, b: number) => a / b;\n";

const projectFiles = {
  "src/math.ts": originalMath,
  "src/math.test.ts": "import { divide } from './math';\nexpect(divide(6, 2)).toBe(3);\n",
  "package.json": JSON.stringify({ scripts: { test: "node test.mjs", deploy: "curl example.test" } }),
};

function patch(summary: string, oldContent: string, newContent: string): string {
  return `${summary}\n<KERNIQ_PATCH_V1>\n${JSON.stringify({
    version: "1",
    summary,
    files: [{ path: "src/math.ts", oldContent, newContent }],
  })}\n</KERNIQ_PATCH_V1>`;
}

function textEvent(content: string) {
  return { choices: [{ delta: { content }, finish_reason: "stop" }] };
}

function toolEvent(id: string, name: string, args: unknown, index = 0) {
  return {
    choices: [{
      delta: {
        tool_calls: [{ index, id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
      },
      finish_reason: "tool_calls",
    }],
  };
}

async function fulfillSse(route: Route, events: unknown[]) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  await route.fulfill({ status: 200, contentType: "text/event-stream", body });
}

async function openFixture(page: Page) {
  await page.getByRole("button", { name: "Open Project" }).click();
  await expect(page.locator('[data-testid="project-access-source"]')).toHaveAttribute("data-project-source", "browser");
}

test.describe("KerniQ Minimal Agent Loop v0.4", () => {
  test("inspects, pauses twice for patches and commands, fixes a failed test, and rolls back", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await installAgentCommandFixture(page, correctedMath);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");

    let turn = 0;
    const requests: Array<Record<string, unknown>> = [];
    await page.route("**/chat/completions", async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      turn += 1;
      const events = turn === 1
        ? [toolEvent("call-search", "search_files", { query: "divide" })]
        : turn === 2
          ? [toolEvent("call-read", "read_file", { path: "src/math.ts" })]
          : turn === 3
            ? [textEvent(patch("First divide implementation", originalMath, firstMath))]
            : turn === 4
              ? [toolEvent("call-list", "list_project_commands", {})]
              : turn === 5
                ? [toolEvent("call-test-1", "run_project_command", { commandId: "package-script:test" })]
                : turn === 6
                  ? [toolEvent("call-read-test", "read_file", { path: "src/math.test.ts" })]
                  : turn === 7
                    ? [textEvent(patch("Correct divide after failed assertion", firstMath, correctedMath))]
                    : turn === 8
                      ? [toolEvent("call-test-2", "run_project_command", { commandId: "package-script:test" })]
                      : [textEvent("Implemented divide and verified the cataloged test command passed with exit code 0.")];
      await fulfillSse(route, events);
    });
    await openFixture(page);

    await page.fill('[data-testid="prompt-input"]', "Implement divide and run the project test.");
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('[data-testid="timeline-tool_result"]', { hasText: "search_files result" })).toBeVisible();
    await expect(page.locator('[data-testid="timeline-tool_result"]', { hasText: "read_file result" })).toBeVisible();
    await expect(page.locator('[data-testid="patch-proposal"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForPatchApproval");
    expect(await readProjectFixture(page)).toEqual({ files: projectFiles, writes: 0 });

    await page.click('[data-testid="apply-patch"]');
    await expect(page.locator('[data-testid="command-approval"]')).toBeVisible();
    await expect(page.locator('[data-testid="command-executable"]')).toHaveText("pnpm");
    await expect(page.locator('[data-testid="command-args"]')).toHaveText("run test");
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('[data-testid="deny-command"]')).toBeInViewport();
    await expect(page.locator('[data-testid="approve-command"]')).toBeInViewport();
    await expect(page.locator('[data-testid="prompt-input"]')).toBeInViewport();
    expect((await readAgentCommandFixture(page)).starts).toBe(0);

    await page.click('[data-testid="approve-command"]');
    await expect(page.locator('[data-testid="timeline-command_output"]')).toContainText("Exit code 1");
    await expect(page.locator('[data-testid="patch-summary"]')).toContainText("Correct divide after failed assertion");
    expect(await readAgentCommandFixture(page)).toMatchObject({
      starts: 1,
      decisions: 1,
    });

    await page.click('[data-testid="apply-patch"]');
    await expect(page.locator('[data-testid="command-approval"]')).toBeVisible();
    expect((await readAgentCommandFixture(page)).starts).toBe(1);
    await page.click('[data-testid="approve-command"]');

    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Done");
    await expect(page.locator('[data-testid="timeline-final"]')).toContainText("verified the cataloged test command passed");
    await expect(page.locator('[data-testid="agent-timeline"] .agent-card-status.status-running')).toHaveCount(0);
    await expect(page.locator('[data-testid="agent-timeline"] .agent-card-status.status-pending')).toHaveCount(0);
    expect(await readAgentCommandFixture(page)).toMatchObject({
      starts: 2,
      decisions: 2,
    });
    expect((await readProjectFixture(page)).files["src/math.ts"]).toBe(correctedMath);
    expect(requests.every((request) => Array.isArray(request.tools) && request.tools.length === 4)).toBe(true);
    expect(JSON.stringify(requests[6])).toContain('"tool_call_id":"call-test-1"');
    expect(JSON.stringify(requests[8])).toContain('"tool_call_id":"call-test-2"');

    await page.click('[data-testid="rollback-all-patches"]');
    await expect(page.locator('[data-testid="rollback-status"]')).toBeVisible();
    expect((await readProjectFixture(page)).files["src/math.ts"]).toBe(originalMath);
  });

  test("denial returns a structured result and starts no command", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await installAgentCommandFixture(page, correctedMath);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let turn = 0;
    await page.route("**/chat/completions", async (route) => {
      turn += 1;
      await fulfillSse(route, turn === 1
        ? [
            {
              choices: [{
                delta: {
                  tool_calls: [
                    { index: 0, id: "list", type: "function", function: { name: "list_project_commands", arguments: "{}" } },
                    { index: 1, id: "run", type: "function", function: { name: "run_project_command", arguments: "{\"commandId\":\"package-script:test\"}" } },
                  ],
                },
                finish_reason: "tool_calls",
              }],
            },
          ]
        : [textEvent("Command denial observed; no process started.")]);
    });
    await openFixture(page);
    await page.fill('[data-testid="prompt-input"]', "Inspect but ask before tests.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="command-approval"]')).toBeVisible();
    expect(await readAgentCommandFixture(page)).toMatchObject({
      starts: 0,
      decisions: 0,
    });
    await page.click('[data-testid="deny-command"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Done");
    await expect(page.locator('[data-testid="timeline-command_output"]')).toContainText("no process started");
    expect(await readAgentCommandFixture(page)).toMatchObject({
      starts: 0,
      decisions: 0,
    });
  });

  test("Stop prevents delayed provider output from advancing the loop", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await installAgentCommandFixture(page, correctedMath);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    await page.route("**/chat/completions", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await fulfillSse(route, [toolEvent("late-read", "read_file", { path: "src/math.ts" })]);
    });
    await openFixture(page);
    await page.fill('[data-testid="prompt-input"]', "Wait for inspection.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="stop-agent"]')).toBeVisible();
    await page.click('[data-testid="stop-agent"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Cancelled");
    await page.waitForTimeout(900);
    await expect(page.locator('[data-testid="timeline-tool_result"]')).toHaveCount(0);
  });

  test("Stop while waiting for patch approval discards every actionable path", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let turns = 0;
    await page.route("**/chat/completions", async (route) => {
      turns += 1;
      await fulfillSse(route, [textEvent(patch("Pending patch", originalMath, firstMath))]);
    });
    await openFixture(page);
    await page.fill('[data-testid="prompt-input"]', "Propose a patch and wait.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForPatchApproval");
    expect((await readProjectFixture(page)).writes).toBe(0);

    await page.click('[data-testid="stop-agent"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Cancelled");
    await expect(page.locator('[data-testid="apply-patch"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="reject-patch"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="proposal-disposition"]')).toContainText("cancelled");
    expect((await readProjectFixture(page)).writes).toBe(0);
    expect(turns).toBe(1);
  });

  test("Stop while waiting for command approval starts no process", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await installAgentCommandFixture(page, correctedMath);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let turns = 0;
    await page.route("**/chat/completions", async (route) => {
      turns += 1;
      await fulfillSse(route, [
        toolEvent("list-stop", "list_project_commands", {}, 0),
        toolEvent("run-stop", "run_project_command", { commandId: "package-script:test" }, 1),
      ]);
    });
    await openFixture(page);
    await page.fill('[data-testid="prompt-input"]', "Ask before running tests.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForCommandApproval");
    await expect(page.locator('[data-testid="command-approval"]')).toBeVisible();
    expect((await readAgentCommandFixture(page)).starts).toBe(0);

    await page.click('[data-testid="stop-agent"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Cancelled");
    await expect(page.locator('[data-testid="command-approval"]')).toHaveCount(0);
    expect(await readAgentCommandFixture(page)).toMatchObject({
      starts: 0,
      decisions: 0,
    });
    expect(turns).toBe(1);
  });

  test("rollback remains disabled until active Agent work settles", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let turns = 0;
    await page.route("**/chat/completions", async (route) => {
      turns += 1;
      if (turns === 1) {
        await fulfillSse(route, [textEvent(patch("Apply before delayed completion", originalMath, firstMath))]);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
      await fulfillSse(route, [textEvent("Finished after observing the approved patch.")]);
    });
    await openFixture(page);
    await page.fill('[data-testid="prompt-input"]', "Patch then finish slowly.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForPatchApproval");
    await page.click('[data-testid="apply-patch"]');

    await expect(page.locator('[data-testid="rollback-patch"]')).toBeVisible();
    await expect(page.locator('[data-testid="rollback-patch"]')).toBeDisabled();
    await expect(page.locator('[data-testid="rollback-unavailable"]')).toContainText("after the Agent");
    expect((await readProjectFixture(page)).files["src/math.ts"]).toBe(firstMath);

    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Done");
    await expect(page.locator('[data-testid="rollback-patch"]')).toBeEnabled();
    await page.click('[data-testid="rollback-patch"]');
    await expect(page.locator('[data-testid="rollback-status"]')).toBeVisible();
    expect((await readProjectFixture(page)).files["src/math.ts"]).toBe(originalMath);
  });

  test("browser mode never claims native command execution", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let turn = 0;
    await page.route("**/chat/completions", async (route) => {
      turn += 1;
      await fulfillSse(route, turn === 1
        ? [toolEvent("list", "list_project_commands", {})]
        : turn === 2
          ? [toolEvent("browser-run", "run_project_command", { commandId: "package-script:test" })]
          : [textEvent("Browser command execution was unavailable; no process result was fabricated.")]);
    });
    await openFixture(page);
    await page.fill('[data-testid="prompt-input"]', "Run tests if supported.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Done");
    await expect(page.locator('[data-testid="timeline-tool_result"]', { hasText: "command_unavailable" })).toBeVisible();
    await expect(page.locator('[data-testid="command-approval"]')).toHaveCount(0);
  });

  test("iteration limits display a terminal state and stop later turns", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let calls = 0;
    await page.route("**/chat/completions", async (route) => {
      calls += 1;
      await fulfillSse(route, [toolEvent(`read-${calls}`, "read_file", { path: "src/math.ts" })]);
    });
    await openFixture(page);
    await page.fill('[data-testid="prompt-input"]', "Keep reading forever.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("LimitReached");
    await expect(page.locator('[data-testid="timeline-limit"]')).toContainText("Maximum model turns");
    expect(calls).toBe(10);
  });
});
