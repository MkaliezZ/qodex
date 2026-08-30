import { describe, expect, it, vi } from "vitest";
import {
  createAgentGovernanceEvidence,
  type AgentBackendAdmission,
  type WorkerRun,
} from "@qodex/multi-agent-runtime";
import { InMemorySessionStore, SessionRuntime } from "@qodex/session-runtime";
import { DesktopControlPlaneSessionLedger } from "./controlPlaneSessionLedger";

describe("DesktopControlPlaneSessionLedger", () => {
  it("durably links WorkerRun identity, structured results, and governance evidence", async () => {
    const runtime = new SessionRuntime(new InMemorySessionStore());
    const refreshed = vi.fn();
    const ledger = new DesktopControlPlaneSessionLedger(runtime, refreshed, () => "ledger-dsh");
    const session = await ledger.createWorkerSession(sessionInput());
    const worker = workerRun(session.sessionId);

    await ledger.recordWorkerResult(worker, {
      classification: "AGREEMENT",
      sharedFiles: ["packages/shared.ts"],
      matchedFindings: [],
      agentOnlyFiles: {},
      summary: "Both workers identified the same bounded risk.",
    });

    const entries = await runtime.loadActivePath(session.sessionId);
    expect(entries.map((entry) => entry.type)).toEqual([
      "SESSION_CREATED",
      "AGENT_STATE_CHANGED",
      "AGENT_STATE_CHANGED",
      "AGENT_STATE_CHANGED",
      "MODEL_MESSAGE",
      "TOOL_REQUESTED",
      "TOOL_COMPLETED",
      "SESSION_COMPLETED",
    ]);
    expect(entries[1]!.safeMetadata).toMatchObject({
      controlPlaneTaskId: "task-product",
      workerRunId: "task-product:worker:2",
      agentId: "dsh-deepseek",
      governanceTier: "GOVERNED",
      governanceMode: "pre_dispatch_plugin",
    });
    expect(entries.at(-2)).toMatchObject({
      type: "TOOL_COMPLETED",
      payload: {
        status: "blocked",
        decision: { value: "block", provenance: "observed" },
        dispatchOccurred: { value: false, provenance: "observed" },
        toolBodyStarted: { value: "unknown", provenance: "unknown" },
      },
      safeMetadata: {
        toolCallId: "call-block",
        governanceDecision: "block",
        governanceOutcome: "blocked",
      },
    });
    expect((await runtime.projectCurrentState(session.sessionId)).status).toBe("Completed");
    expect(refreshed).toHaveBeenCalled();
  });

  it("settles a pre-created session as failed when product admission fails", async () => {
    const runtime = new SessionRuntime(new InMemorySessionStore());
    const ledger = new DesktopControlPlaneSessionLedger(runtime, undefined, () => "ledger-failed");
    const session = await ledger.createWorkerSession(sessionInput());

    await ledger.recordWorkerFailure(session, new Error("Governed admission unavailable."));

    const projection = await runtime.projectCurrentState(session.sessionId);
    expect(projection.status).toBe("Failed");
    expect(projection.lastEntry.payload).toEqual({ reason: "Governed admission unavailable." });
  });
});

function sessionInput() {
  return {
    taskId: "task-product",
    taskTitle: "Product review",
    workerRunId: "task-product:worker:2",
    backendId: "dsh-deepseek",
    backendKind: "deepseek-harness",
    admission: admission(),
    governanceRequired: true,
  };
}

function admission(): AgentBackendAdmission {
  return {
    version: "0.1.2-alpha.1",
    model: "deepseek-v4-flash",
    capabilities: {
      supportsStreaming: true,
      supportsCancel: false,
      supportsToolEvents: true,
      governanceTier: "GOVERNED",
      governanceMode: "pre_dispatch_plugin",
      supportsResume: false,
    },
  };
}

function workerRun(sessionId: string): WorkerRun {
  return {
    runId: "task-product:worker:2",
    taskId: "task-product",
    sessionId,
    agentId: "dsh-deepseek",
    agentKind: "deepseek-harness",
    agentVersion: "0.1.2-alpha.1",
    model: "deepseek-v4-flash",
    capabilities: admission().capabilities,
    governance: {
      tier: "GOVERNED",
      mode: "pre_dispatch_plugin",
      evidence: [createAgentGovernanceEvidence({
        taskId: "task-product",
        workerRunId: "task-product:worker:2",
        agentId: "dsh-deepseek",
        agentKind: "deepseek-harness",
        agentVersion: "0.1.2-alpha.1",
        toolCallId: "call-block",
        toolName: "kerniq_write_probe",
        actionSummary: "Bounded governance probe.",
        modelToolCallObserved: { value: true, provenance: "observed" },
        policyDecision: { value: "block", provenance: "observed" },
        policyReason: "explicit_denylist",
        preExecuteObserved: { value: true, provenance: "observed" },
        dispatchOccurred: { value: false, provenance: "observed" },
        toolBodyStarted: { value: "unknown", provenance: "unknown" },
        physicalSideEffect: { value: false, provenance: "observed" },
        outcome: "blocked",
        provenance: {
          runtimeSource: "deepseek-harness@fixture",
          modelProvider: "deepseek-official",
          model: "deepseek-v4-flash",
          policyAdapter: "agentfuse@fixture",
          captureMethod: "deterministic fixture",
        },
      })],
    },
    status: "completed",
    startedAt: "2026-08-30T00:00:00.000Z",
    endedAt: "2026-08-30T00:00:01.000Z",
    lifecycle: [
      { status: "queued", at: "2026-08-30T00:00:00.000Z", summary: "Queued." },
      { status: "completed", at: "2026-08-30T00:00:01.000Z", summary: "Completed." },
    ],
    observations: [{
      kind: "tool_observed",
      at: "2026-08-30T00:00:00.500Z",
      summary: "Governed tool request observed.",
    }],
    result: {
      findings: [{
        finding: "Shared bounded risk",
        evidence: "packages/shared.ts:1",
        severity: "low",
        smallestFix: "Keep the boundary.",
        files: ["packages/shared.ts"],
      }],
      rawResultReference: "sha256:fixture",
    },
  };
}
