import { describe, expect, it } from "vitest";
import {
  createTauriDshTransport,
  type TauriControlPlaneInvoker,
} from "./tauriControlPlaneTransport";

describe("TauriControlPlaneTransport", () => {
  it("uses only fixed probe/run commands and validates native governance evidence", async () => {
    const calls: Array<readonly [string, Record<string, unknown> | undefined]> = [];
    const invoke: TauriControlPlaneInvoker = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      calls.push([command, args]);
      if (command === "control_plane_probe_backend") {
        return {
          available: true,
          version: "0.1.2-alpha.1",
          model: "deepseek-v4-flash",
          supportsStreaming: true,
          supportsCancel: false,
          supportsToolEvents: true,
          supportsResume: false,
          governance: {
            mode: "pre_dispatch_plugin",
            compatibleRuntime: true,
            agentFuseAdapterAvailable: true,
            preDispatchSeamAvailable: true,
            governedProfileValid: true,
            evidenceCaptureAvailable: true,
          },
        } as T;
      }
      return {
        result: {
          findings: [{
            finding: "Risk",
            evidence: "src/a.ts:1",
            severity: "low",
            smallestFix: "Fix",
            files: ["src/a.ts"],
          }],
          rawResultReference: "sha256:fixture",
        },
        observations: [{ kind: "process_started", at: "0", summary: "Started." }],
        governanceEvidenceInputs: [evidenceInput()],
      } as T;
    };
    const transport = createTauriDshTransport(invoke);
    const observations: unknown[] = [];

    await transport.probe();
    const output = await transport.runTask(taskInput(), (event) => observations.push(event));

    expect(calls.map(([command]) => command)).toEqual([
      "control_plane_probe_backend",
      "control_plane_run_backend",
    ]);
    expect(calls[1]![1]).toEqual({
      request: expect.objectContaining({
        backendId: "dsh-deepseek",
        governanceRequired: true,
      }),
    });
    expect(observations).toEqual([
      { kind: "process_started", at: "1970-01-01T00:00:00.000Z", summary: "Started." },
    ]);
    expect(output.governanceEvidence[0]).toMatchObject({
      schemaVersion: "kerniq.agent-governance-evidence.v0.2",
      outcome: "blocked",
    });
  });
});

function taskInput() {
  return {
    taskId: "task-product",
    title: "Product review",
    workspace: "/authorized/project",
    prompt: "Review safely.",
    workerRunId: "task-product:worker:2",
    governanceRequired: true,
  };
}

function evidenceInput() {
  return {
    taskId: "task-product",
    workerRunId: "task-product:worker:2",
    agentId: "dsh-deepseek",
    agentKind: "deepseek-harness",
    agentVersion: "0.1.2-alpha.1",
    toolCallId: "call-block",
    toolName: "kerniq_write_probe",
    actionSummary: "Governed diagnostic.",
    modelToolCallObserved: { value: true as const, provenance: "observed" as const },
    policyDecision: { value: "block" as const, provenance: "observed" as const },
    policyReason: "explicit_denylist",
    preExecuteObserved: { value: true as const, provenance: "observed" as const },
    dispatchOccurred: { value: false as const, provenance: "observed" as const },
    toolBodyStarted: { value: false as const, provenance: "observed" as const },
    physicalSideEffect: { value: false as const, provenance: "observed" as const },
    outcome: "blocked" as const,
    provenance: {
      runtimeSource: "deepseek-harness@test",
      modelProvider: "deepseek-official",
      model: "deepseek-v4-flash",
      policyAdapter: "agentfuse@test",
      captureMethod: "fixture",
    },
  };
}
