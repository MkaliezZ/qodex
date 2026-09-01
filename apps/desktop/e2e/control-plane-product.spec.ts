import { expect, test } from "@playwright/test";
import { installProjectFixture } from "./fixtures/project-fixture";
import { setupApp } from "./fixtures/app-harness";

test("runs a bounded Supervisor task through the existing product UI and session ledger", async ({ page }) => {
  await installProjectFixture(page, {
    "src/control-plane.ts": "export const governed = true;\n",
  });
  await page.addInitScript(() => {
    const capabilities = (governed: boolean) => ({
      supportsStreaming: false,
      supportsCancel: false,
      supportsToolEvents: true,
      governanceTier: governed ? "GOVERNED" as const : "OBSERVED" as const,
      governanceMode: governed ? "pre_dispatch_plugin" as const : "none" as const,
      supportsResume: false,
    });
    window.__kerniqTestControlPlaneBackends = [
      {
        id: "codex",
        kind: "codex-cli",
        async probeCapabilities() {
          return { version: "codex-cli fixture", model: "codex", capabilities: capabilities(false) };
        },
        async startTask(input, observe) {
          observe({ kind: "process_started", at: new Date().toISOString(), summary: "Codex started." });
          return {
            result: {
              findings: [{
                finding: "Control-plane boundary remains explicit",
                evidence: "src/control-plane.ts:1",
                severity: "low",
                smallestFix: "Keep the product boundary explicit.",
                files: ["src/control-plane.ts"],
              }],
              rawResultReference: "sha256:codex-fixture",
            },
            governanceEvidence: [],
          };
        },
      },
      {
        id: "dsh-deepseek",
        kind: "deepseek-harness",
        async probeCapabilities() {
          return { version: "0.1.2-alpha.1", model: "deepseek-v4-flash", capabilities: capabilities(true) };
        },
        async startTask(input, observe) {
          observe({ kind: "process_started", at: new Date().toISOString(), summary: "DSH started." });
          return {
            result: {
              findings: [{
                finding: "Control-plane boundary remains explicit",
                evidence: "src/control-plane.ts:1",
                severity: "low",
                smallestFix: "Keep the product boundary explicit.",
                files: ["src/control-plane.ts"],
              }],
              rawResultReference: "sha256:dsh-fixture",
            },
            governanceEvidence: [{
              schemaVersion: "kerniq.agent-governance-evidence.v0.2",
              taskId: input.taskId,
              workerRunId: input.workerRunId,
              agentId: "dsh-deepseek",
              agentKind: "deepseek-harness",
              agentVersion: "0.1.2-alpha.1",
              toolCallId: "fixture-block",
              toolName: "kerniq_write_probe",
              actionSummary: "Deterministic governed UI fixture.",
              modelToolCallObserved: { value: true, provenance: "observed" },
              policyDecision: { value: "block", provenance: "observed" },
              policyReason: "deterministic_ui_fixture",
              preExecuteObserved: { value: true, provenance: "observed" },
              dispatchOccurred: { value: false, provenance: "observed" },
              toolBodyStarted: { value: false, provenance: "observed" },
              physicalSideEffect: { value: false, provenance: "observed" },
              outcome: "blocked",
              provenance: {
                runtimeSource: "deepseek-harness@fixture",
                modelProvider: "fixture",
                model: "deepseek-v4-flash",
                policyAdapter: "agentfuse@fixture",
                captureMethod: "deterministic_ui_fixture",
              },
            }],
          };
        },
      },
    ];
  });

  await setupApp(page);
  await page.getByRole("button", { name: "Open Project" }).click();
  await page.getByRole("button", { name: "Codex + DSH" }).click();
  await page.getByTestId("prompt-input").fill("Review the bounded control-plane boundary.");
  await page.getByTestId("send-button").click();

  await expect(page.getByTestId("control-plane-state")).toHaveText("completed");
  await expect(page.getByTestId("control-plane-worker-codex")).toContainText("OBSERVED");
  const governedWorker = page.getByTestId("control-plane-worker-dsh-deepseek");
  await expect(governedWorker).toContainText("GOVERNED");
  await expect(governedWorker).toContainText("BLOCK");
  await expect(governedWorker).toContainText("NO");
  await expect(governedWorker).toContainText("PROVEN");
  await expect(page.getByText("AGREEMENT", { exact: true })).toBeVisible();
  await expect(page.getByTestId("context-inspector")).toContainText("pre dispatch plugin");
  await expect(page.getByTestId("context-inspector")).toContainText("Supervisor mode");
  await expect(page.getByTestId("context-inspector")).toContainText("Authorized repository");
  await expect(page.getByTestId("context-inspector")).toContainText("Backend-managed");
  await expect(page.getByTestId("context-inspector")).not.toContainText("Context budget");
  await expect(page.getByTestId("context-inspector")).not.toContainText("Estimated tokens");
  if (process.env.KERNIQ_CONTROL_PLANE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.KERNIQ_CONTROL_PLANE_SCREENSHOT,
      fullPage: false,
    });
  }

  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByTestId("session-row")).toHaveCount(2);
  await expect(page.getByTestId("session-row").filter({ hasText: "dsh-deepseek" })).toContainText("Completed");
});
