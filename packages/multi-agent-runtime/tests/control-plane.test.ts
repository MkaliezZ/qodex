import { describe, expect, it, vi } from "vitest";
import {
  ControlPlaneSupervisor,
  GovernanceAdmissionError,
  createAgentGovernanceEvidence,
  reconcileWorkerResults,
  type AgentBackend,
  type AgentBackendCapabilities,
  type AgentTaskResult,
  type WorkerRun,
} from "../src/index.js";

const observedCapabilities = Object.freeze({
  supportsStreaming: true,
  supportsCancel: false,
  supportsToolEvents: true,
  governanceTier: "OBSERVED" as const,
  governanceMode: "none" as const,
  supportsResume: false,
});

describe("ControlPlaneSupervisor", () => {
  it("admits both independent backends before either task starts", async () => {
    const probed: string[] = [];
    const started: string[] = [];
    let release = () => {};
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const backend = (id: string, kind: string): AgentBackend => ({
      id,
      kind,
      async probeCapabilities() {
        probed.push(id);
        return admission(observedCapabilities);
      },
      async startTask(_input, observe) {
        expect(probed).toHaveLength(2);
        started.push(id);
        observe({ kind: "process_started", at: new Date(0).toISOString(), summary: `${id} started` });
        if (started.length === 2) release();
        await barrier;
        return output(result(["packages/shared.ts"], "Unsafe command dispatch bypasses approval"));
      },
    });

    const resultValue = await new ControlPlaneSupervisor({ now: clock() }).runParallel(task(), [
      backend("agent-a", "runtime-a"),
      backend("agent-b", "runtime-b"),
    ]);

    expect(started).toEqual(["agent-a", "agent-b"]);
    expect(resultValue.status).toBe("completed");
    expect(resultValue.workers.map((worker) => worker.lifecycle.map((entry) => entry.status))).toEqual([
      ["queued", "starting", "running", "completed"],
      ["queued", "starting", "running", "completed"],
    ]);
    expect(resultValue.reconciliation.classification).toBe("AGREEMENT");
    expect(resultValue).not.toHaveProperty("governance");
  });

  it("preserves backend capabilities and propagates worker failure", async () => {
    const success = immediateBackend("agent-a", "runtime-a", result(["packages/a.ts"]));
    const failure: AgentBackend = {
      ...immediateBackend("agent-b", "runtime-b", result(["packages/b.ts"])),
      async startTask() { throw new Error("real agent exited 2"); },
    };

    const resultValue = await new ControlPlaneSupervisor({ now: clock() }).runParallel(task(), [success, failure]);

    expect(resultValue.status).toBe("failed");
    expect(resultValue.workers[0]!.capabilities).toEqual(observedCapabilities);
    expect(resultValue.workers[0]!.governance).toEqual({
      tier: "OBSERVED",
      mode: "none",
      evidence: [],
    });
    expect(resultValue.workers[1]).toMatchObject({ status: "failed", error: "real agent exited 2" });
    expect(resultValue.reconciliation.classification).toBe("UNRESOLVED");
  });

  it("fails admission before any backend starts when governance is required", async () => {
    const first = immediateBackend("codex", "codex-cli", result(["packages/a.ts"]));
    const second = immediateBackend("dsh", "deepseek-harness", result(["packages/b.ts"]));
    const starts = vi.spyOn(second, "startTask");
    const firstStarts = vi.spyOn(first, "startTask");

    await expect(new ControlPlaneSupervisor().runParallel({
      ...task(),
      workers: [
        { backendId: "codex" },
        { backendId: "dsh", governanceRequired: true },
      ],
    }, [first, second])).rejects.toEqual(expect.objectContaining<Partial<GovernanceAdmissionError>>({
      name: "GovernanceAdmissionError",
      backendId: "dsh",
      admittedTier: "OBSERVED",
    }));

    expect(firstStarts).not.toHaveBeenCalled();
    expect(starts).not.toHaveBeenCalled();
  });

  it("attaches only evidence matching the worker identity", async () => {
    const governed = immediateBackend(
      "dsh",
      "deepseek-harness",
      result(["packages/shared.ts"]),
      {
        ...observedCapabilities,
        governanceTier: "GOVERNED",
        governanceMode: "pre_dispatch_plugin",
      },
    );
    governed.startTask = async (input) => output(
      result(["packages/shared.ts"]),
      [governanceEvidence(input.taskId, input.workerRunId)],
    );

    const resultValue = await new ControlPlaneSupervisor().runParallel({
      ...task(),
      workers: [
        { backendId: "codex", sessionId: "ledger-codex" },
        { backendId: "dsh", sessionId: "ledger-dsh", governanceRequired: true },
      ],
    }, [
      immediateBackend("codex", "codex-cli", result(["packages/shared.ts"])),
      governed,
    ]);

    expect(resultValue.workers[1]).toMatchObject({
      sessionId: "ledger-dsh",
      governance: { tier: "GOVERNED", mode: "pre_dispatch_plugin" },
    });
    expect(resultValue.workers[1]!.governance.evidence).toHaveLength(1);
  });

  it("rejects evidence for another worker identity", async () => {
    const invalid = immediateBackend("dsh", "deepseek-harness", result(["packages/b.ts"]));
    invalid.startTask = async (input) => output(
      result(["packages/b.ts"]),
      [governanceEvidence(input.taskId, "another-worker")],
    );

    const resultValue = await new ControlPlaneSupervisor().runParallel(task(), [
      immediateBackend("codex", "codex-cli", result(["packages/a.ts"])),
      invalid,
    ]);

    expect(resultValue.workers[1]).toMatchObject({
      status: "failed",
      error: "Agent governance evidence does not match its worker identity.",
    });
  });

  it("classifies overlapping and disjoint file evidence without erasing raw results", () => {
    const partial = reconcileWorkerResults([
      worker("a", ["packages/shared.ts", "packages/a.ts"], "Registry sync deletes unrelated source entries"),
      worker("b", ["packages/shared.ts", "packages/b.ts"], "Registry sync removes unrelated source entries"),
    ]);
    const disagreement = reconcileWorkerResults([
      worker("a", ["packages/a.ts"]),
      worker("b", ["packages/b.ts"]),
    ]);

    expect(partial).toMatchObject({
      classification: "PARTIAL_AGREEMENT",
      sharedFiles: ["packages/shared.ts"],
      matchedFindings: [{ files: ["packages/shared.ts"] }],
      agentOnlyFiles: { a: ["packages/a.ts"], b: ["packages/b.ts"] },
    });
    expect(disagreement.classification).toBe("DISAGREEMENT");
  });

  it("does not treat a shared file as agreement when the risks differ", () => {
    const resultValue = reconcileWorkerResults([
      worker("a", ["apps/desktop/src-tauri/src/lib.rs"], "Duplicate run IDs overwrite cancellation state"),
      worker("b", ["apps/desktop/src-tauri/src/lib.rs"], "Descendant processes can keep output pipes open"),
    ]);

    expect(resultValue).toMatchObject({
      classification: "DISAGREEMENT",
      sharedFiles: ["apps/desktop/src-tauri/src/lib.rs"],
      matchedFindings: [],
    });
  });

  it("rejects two backends that are the same runtime kind", async () => {
    const supervisor = new ControlPlaneSupervisor();
    await expect(supervisor.runParallel(task(), [
      immediateBackend("a", "same-runtime", result(["a.ts"])),
      immediateBackend("b", "same-runtime", result(["b.ts"])),
    ])).rejects.toThrow("independent agent runtime kinds");
  });
});

function immediateBackend(
  id: string,
  kind: string,
  taskResult: AgentTaskResult,
  capabilities: AgentBackendCapabilities = observedCapabilities,
): AgentBackend {
  return {
    id,
    kind,
    async probeCapabilities() { return admission(capabilities); },
    async startTask() { return output(taskResult); },
  };
}

function admission(capabilities: AgentBackendCapabilities) {
  return { version: "1.0.0", capabilities };
}

function task() {
  return {
    taskId: "task-1",
    title: "Independent repository review",
    workspace: "fixture",
    prompt: "Review the repository.",
  };
}

function output(taskResult: AgentTaskResult, governanceEvidence = []) {
  return { result: taskResult, governanceEvidence };
}

function result(files: string[], finding = "Risk"): AgentTaskResult {
  return {
    findings: [{
      finding,
      evidence: "Evidence",
      severity: "high",
      smallestFix: "Fix",
      files,
    }],
    rawResultReference: "memory:test",
  };
}

function worker(agentId: string, files: string[], finding = "Risk"): WorkerRun {
  return {
    runId: `run-${agentId}`,
    taskId: "task-1",
    agentId,
    agentKind: `runtime-${agentId}`,
    agentVersion: "1.0.0",
    capabilities: observedCapabilities,
    governance: { tier: "OBSERVED", mode: "none", evidence: [] },
    status: "completed",
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(1).toISOString(),
    lifecycle: [],
    observations: [],
    result: result(files, finding),
  };
}

function governanceEvidence(taskId: string, workerRunId: string) {
  return createAgentGovernanceEvidence({
    taskId,
    workerRunId,
    agentId: "dsh",
    agentKind: "deepseek-harness",
    agentVersion: "1.0.0",
    toolCallId: "call-block",
    toolName: "kerniq_write_probe",
    actionSummary: "Bounded write probe.",
    modelToolCallObserved: { value: true, provenance: "observed" },
    policyDecision: { value: "block", provenance: "observed" },
    policyReason: "explicit_denylist",
    preExecuteObserved: { value: true, provenance: "observed" },
    dispatchOccurred: { value: false, provenance: "observed" },
    toolBodyStarted: { value: false, provenance: "observed" },
    physicalSideEffect: { value: false, provenance: "observed" },
    outcome: "blocked",
    provenance: {
      runtimeSource: "deepseek-harness@test",
      modelProvider: "deepseek-official",
      model: "deepseek-v4-flash",
      policyAdapter: "agentfuse@test",
      captureMethod: "deterministic fixture",
    },
  });
}

function clock(): () => Date {
  let tick = 0;
  return () => new Date(tick++);
}
