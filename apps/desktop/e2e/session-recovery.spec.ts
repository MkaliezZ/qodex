import { expect, test, type Page, type Route } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";
import {
  changePersistentProjectFile,
  configureDeterministicProvider,
  installAgentCommandFixture,
  installDelayedAgentCommandFixture,
  installPersistentSessionStore,
  installProjectFixture,
  readAgentCommandFixture,
  readProjectFixture,
  readSessionEntryTypes,
} from "./fixtures/project-fixture";

const original = "export const value = 1;\n";
const changed = "export const value = 2;\n";
const external = "export const value = 99;\n";
const files = {
  "src/value.ts": original,
  "package.json": JSON.stringify({ scripts: { test: "node test.mjs" } }),
};

function textEvent(content: string) {
  return { choices: [{ delta: { content }, finish_reason: "stop" }] };
}

function toolEvent(id: string, name: string, args: unknown, index = 0) {
  return {
    choices: [{
      delta: { tool_calls: [{ index, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
      finish_reason: "tool_calls",
    }],
  };
}

function patchResponse(): string {
  return `Update the value.\n<KERNIQ_PATCH_V1>\n${JSON.stringify({
    version: "1",
    summary: "Update value",
    files: [{ path: "src/value.ts", oldContent: original, newContent: changed }],
  })}\n</KERNIQ_PATCH_V1>`;
}

async function fulfillSse(route: Route, events: unknown[]) {
  await route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body: `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
  });
}

async function installPersistentHarness(page: Page) {
  await installPersistentSessionStore(page);
  await installProjectFixture(page, files, { persistent: true });
  await setupApp(page);
  await configureDeterministicProvider(page, "unused");
}

async function openProject(page: Page) {
  await page.getByRole("button", { name: "Open Project" }).click();
  await expect(page.locator('[data-testid="project-access-source"]')).toHaveAttribute("data-project-source", "browser");
}

async function openSessions(page: Page) {
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.locator('[data-testid="sessions-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="session-row"]').first()).toBeVisible();
}

test.describe("KerniQ Universal Session and Recovery v0.5", () => {
  test("completed session reload reconstructs history without another provider call", async ({ page }) => {
    await installPersistentHarness(page);
    let providerCalls = 0;
    await page.route("**/chat/completions", async (route) => {
      providerCalls += 1;
      await fulfillSse(route, [textEvent("Completed with durable evidence.")]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Complete a deterministic session.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Done");
    expect(providerCalls).toBe(1);

    await page.reload();
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
    await openSessions(page);
    await expect(page.locator('[data-testid="session-row"]').first()).toContainText("Completed");
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.locator('[data-testid="reconstructed-timeline"]')).toContainText("Completed with durable evidence");
    expect(providerCalls).toBe(1);

    const download = page.waitForEvent("download");
    await page.locator('[data-testid="session-row"]').first().locator('[data-testid="export-session"]').click();
    expect((await download).suggestedFilename()).toContain("kerniq-session.json");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-testid="session-row"]').first().locator('[data-testid="delete-session"]').click();
    await expect(page.locator('[data-testid="session-row"]')).toHaveCount(0);
  });

  test("pending patch reload requires matching project and explicit reapproval", async ({ page }) => {
    await installPersistentHarness(page);
    let providerCalls = 0;
    await page.route("**/chat/completions", async (route) => {
      providerCalls += 1;
      await fulfillSse(route, [textEvent(patchResponse())]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Propose a durable patch.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForPatchApproval");
    expect((await readProjectFixture(page)).writes).toBe(0);

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-filter-recovery-required"]').click();
    await expect(page.locator('[data-testid="session-row"]').first()).toContainText("RecoveryRequired");
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("Patch approval expired");
    expect((await readProjectFixture(page)).writes).toBe(0);
    await page.locator('[data-testid="reauthorize-project"]').click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("target files reread");
    await page.locator('[data-testid="approve-recovered-action"]').click();
    await expect(page.locator('[data-testid="session-notice"]')).toContainText("explicit reapproval");
    expect((await readProjectFixture(page)).writes).toBe(1);
    expect((await readProjectFixture(page)).files["src/value.ts"]).toBe(changed);
    expect(providerCalls).toBe(1);
  });

  test("pending command reload rediscovers the catalog and starts once after reapproval", async ({ page }) => {
    await installPersistentSessionStore(page);
    await installProjectFixture(page, files, { persistent: true });
    await installAgentCommandFixture(page, changed);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let providerCalls = 0;
    await page.route("**/chat/completions", async (route) => {
      providerCalls += 1;
      await fulfillSse(route, [
        toolEvent("catalog-call", "list_project_commands", {}, 0),
        toolEvent("command-call", "run_project_command", { commandId: "package-script:test" }, 1),
      ]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Ask before running tests.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForCommandApproval");
    expect((await readAgentCommandFixture(page)).starts).toBe(0);

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("Command approval expired");
    expect((await readAgentCommandFixture(page)).starts).toBe(0);
    await page.locator('[data-testid="reauthorize-project"]').click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("command catalog verified");
    await page.locator('[data-testid="approve-recovered-action"]').click();
    await expect(page.locator('[data-testid="session-notice"]')).toContainText("explicit reapproval");
    expect(await readAgentCommandFixture(page)).toMatchObject({
      starts: 1,
      decisions: 1,
    });
    expect(providerCalls).toBe(1);
  });

  test("running command evidence becomes Interrupted and never restarts", async ({ page }) => {
    await installPersistentSessionStore(page);
    await installProjectFixture(page, files, { persistent: true });
    await installDelayedAgentCommandFixture(page);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    await page.route("**/chat/completions", async (route) => {
      await fulfillSse(route, [
        toolEvent("catalog-interrupted", "list_project_commands", {}, 0),
        toolEvent("command-interrupted", "run_project_command", { commandId: "package-script:test" }, 1),
      ]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Start a delayed test.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForCommandApproval");
    await page.click('[data-testid="approve-command"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("RunningCommand");
    await expect.poll(async () => (await readAgentCommandFixture(page)).starts).toBe(1);
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("kerniq-e2e-session-ledger")?.includes("COMMAND_STARTED") ?? false)).toBe(true);

    await page.reload();
    await openSessions(page);
    await expect(page.locator('[data-testid="session-row"]').first()).toContainText("Interrupted");
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("Execution was interrupted");
    await expect(page.locator('[data-testid="reauthorize-project"]')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(await readAgentCommandFixture(page)).toMatchObject({
      starts: 1,
      decisions: 1,
    });
  });

  test("started patch evidence becomes Interrupted and never writes after restart", async ({ page }) => {
    await installPersistentSessionStore(page);
    await installProjectFixture(page, files, { persistent: true, writeDelayMs: 5000 });
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let providerCalls = 0;
    await page.route("**/chat/completions", async (route) => {
      providerCalls += 1;
      await fulfillSse(route, [textEvent(patchResponse())]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Start a delayed patch.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForPatchApproval");
    await page.click('[data-testid="apply-patch"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("ApplyingPatch");
    await expect.poll(async () => page.evaluate(() => (
      localStorage.getItem("kerniq-e2e-session-ledger")?.includes("PATCH_STARTED") ?? false
    ))).toBe(true);
    expect((await readProjectFixture(page)).writes).toBe(0);

    await page.reload();
    await openSessions(page);
    await expect(page.locator('[data-testid="session-row"]').first()).toContainText("Interrupted");
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("Execution was interrupted");
    await expect(page.locator('[data-testid="reauthorize-project"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="approve-recovered-action"]')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect((await readProjectFixture(page)).writes).toBe(0);
    expect((await readProjectFixture(page)).files["src/value.ts"]).toBe(original);
    expect(providerCalls).toBe(1);
  });

  test("session persistence and export redact recognised sensitive text", async ({ page }) => {
    await installPersistentHarness(page);
    const privatePath = "/Users/example/Private/project/report.txt";
    const githubFixture = `github_pat_${"A1".repeat(15)}`;
    await page.route("**/chat/completions", async (route) => {
      await fulfillSse(route, [textEvent(`Reviewed ${privatePath}; result token ${githubFixture}`)]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', `Inspect ${privatePath} with ${githubFixture}`);
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("Done");

    const persisted = await page.evaluate(() => localStorage.getItem("kerniq-e2e-session-ledger") ?? "");
    expect(persisted).not.toContain(privatePath);
    expect(persisted).not.toContain(githubFixture);
    expect(persisted).toContain("[redacted-path]");
    expect(persisted).toContain("[redacted-secret]");

    await openSessions(page);
    await expect(page.locator('[data-testid="sessions-view"]')).not.toContainText(privatePath);
    await expect(page.locator('[data-testid="sessions-view"]')).not.toContainText(githubFixture);
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-testid="session-row"]').first().locator('[data-testid="export-session"]').click();
    const stream = await (await downloadPromise).createReadStream();
    let exported = "";
    for await (const chunk of stream) exported += chunk.toString();
    expect(exported).not.toContain(privatePath);
    expect(exported).not.toContain(githubFixture);
  });

  test("recovered Patch settlement persistence failure remains Interrupted without replay", async ({ page }) => {
    await installPersistentSessionStore(page, { failOnceOn: ["PATCH_APPLIED"] });
    await installProjectFixture(page, files, { persistent: true });
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let providerCalls = 0;
    await page.route("**/chat/completions", async (route) => {
      providerCalls += 1;
      await fulfillSse(route, [textEvent(patchResponse())]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Propose a patch with injected settlement failure.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForPatchApproval");

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await page.locator('[data-testid="reauthorize-project"]').click();
    await page.locator('[data-testid="approve-recovered-action"]').click();
    await expect(page.locator('[data-testid="session-notice"]')).toContainText("physical result is unknown");
    await expect(page.locator('[data-testid="session-row"]').first()).toContainText("Interrupted");
    expect((await readProjectFixture(page)).writes).toBe(1);
    expect((await readProjectFixture(page)).files["src/value.ts"]).toBe(changed);
    expect(providerCalls).toBe(1);
    const entryTypes = await readSessionEntryTypes(page);
    expect(entryTypes).toContain("PATCH_STARTED");
    expect(entryTypes).toContain("SESSION_INTERRUPTED");
    expect(entryTypes).not.toContain("PATCH_APPLIED");
    expect(entryTypes).not.toContain("SESSION_FAILED");
    expect(entryTypes).not.toContain("SESSION_COMPLETED");
    expect(entryTypes).not.toContain("RECOVERY_COMPLETED");

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await expect(page.locator('[data-testid="approve-recovered-action"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="reauthorize-project"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="abandon-session"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("cannot be replayed");
    expect((await readProjectFixture(page)).writes).toBe(1);
    expect(providerCalls).toBe(1);
  });

  test("recovered Command settlement persistence failure remains Interrupted without replay", async ({ page }) => {
    await installPersistentSessionStore(page, { failOnceOn: ["COMMAND_COMPLETED"] });
    await installProjectFixture(page, files, { persistent: true });
    await installDelayedAgentCommandFixture(page, 0);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    let providerCalls = 0;
    await page.route("**/chat/completions", async (route) => {
      providerCalls += 1;
      await fulfillSse(route, [
        toolEvent("catalog-settlement", "list_project_commands", {}, 0),
        toolEvent("command-settlement", "run_project_command", { commandId: "package-script:test" }, 1),
      ]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Propose a command with injected settlement failure.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForCommandApproval");

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await page.locator('[data-testid="reauthorize-project"]').click();
    await page.locator('[data-testid="approve-recovered-action"]').click();
    await expect(page.locator('[data-testid="session-notice"]')).toContainText("physical result is unknown");
    await expect(page.locator('[data-testid="session-row"]').first()).toContainText("Interrupted");
    expect((await readAgentCommandFixture(page)).starts).toBe(1);
    expect(providerCalls).toBe(1);
    const entryTypes = await readSessionEntryTypes(page);
    expect(entryTypes).toContain("COMMAND_STARTED");
    expect(entryTypes).toContain("SESSION_INTERRUPTED");
    expect(entryTypes).not.toContain("COMMAND_COMPLETED");
    expect(entryTypes).not.toContain("SESSION_FAILED");
    expect(entryTypes).not.toContain("SESSION_COMPLETED");
    expect(entryTypes).not.toContain("RECOVERY_COMPLETED");

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await expect(page.locator('[data-testid="approve-recovered-action"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="reauthorize-project"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="abandon-session"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("cannot be replayed");
    expect((await readAgentCommandFixture(page)).starts).toBe(1);
    expect(providerCalls).toBe(1);
  });

  test("changed command catalog blocks recovered execution", async ({ page }) => {
    await installPersistentSessionStore(page);
    await installProjectFixture(page, files, { persistent: true });
    await installAgentCommandFixture(page, changed);
    await setupApp(page);
    await configureDeterministicProvider(page, "unused");
    await page.route("**/chat/completions", async (route) => {
      await fulfillSse(route, [
        toolEvent("catalog-changed", "list_project_commands", {}, 0),
        toolEvent("command-changed", "run_project_command", { commandId: "package-script:test" }, 1),
      ]);
    });
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Ask before the command changes.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForCommandApproval");
    await changePersistentProjectFile(page, "package.json", JSON.stringify({ scripts: { test: "node changed-test.mjs" } }));

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await page.locator('[data-testid="reauthorize-project"]').click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("absent or changed");
    await expect(page.locator('[data-testid="approve-recovered-action"]')).toHaveCount(0);
    expect((await readAgentCommandFixture(page)).starts).toBe(0);
  });

  test("stale recovered patch remains inspectable but cannot write", async ({ page }) => {
    await installPersistentHarness(page);
    await page.route("**/chat/completions", async (route) => fulfillSse(route, [textEvent(patchResponse())]));
    await openProject(page);
    await page.fill('[data-testid="prompt-input"]', "Propose a patch that will become stale.");
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="agent-state"]')).toHaveText("WaitingForPatchApproval");
    await changePersistentProjectFile(page, "src/value.ts", external);

    await page.reload();
    await openSessions(page);
    await page.locator('[data-testid="session-row"]').first().getByRole("button", { name: "Resume recovery" }).click();
    await page.locator('[data-testid="reauthorize-project"]').click();
    await expect(page.locator('[data-testid="recovery-banner"]')).toContainText("Target files changed");
    await expect(page.locator('[data-testid="approve-recovered-action"]')).toHaveCount(0);
    expect((await readProjectFixture(page)).writes).toBe(0);
    expect((await readProjectFixture(page)).files["src/value.ts"]).toBe(external);
  });
});
