import { describe, expect, it } from "vitest";
import {
  ControlPlaneSupervisor,
  createGovernanceLimitationEvidence,
  reconcileWorkerResults,
  type AgentAdapter,
  type AgentTaskResult,
  type WorkerRun,
} from "../src/index.js";

const capabilities = Object.freeze({
  supportsStreaming: true,
  supportsCancel: false,
  supportsToolEvents: true,
  supportsExternalGovernance: false,
  governanceTier: "OBSERVED" as const,
  supportsResume: false,
});

describe("ControlPlaneSupervisor", () => {
  it("starts two independent adapters before either result settles", async () => {
    const started: string[] = [];
    let release = () => {};
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const adapter = (id: string, kind: string): AgentAdapter => ({
      id,
      kind,
      version: "1.0.0",
      capabilities,
      async runTask(_input, observe) {
        started.push(id);
        observe({ kind: "process_started", at: new Date(0).toISOString(), summary: `${id} started` });
        if (started.length === 2) release();
        await barrier;
        return result(["packages/shared.ts"], "Unsafe command dispatch bypasses approval");
      },
    });

    const output = await new ControlPlaneSupervisor({ now: clock() }).runParallel(task(), [
      adapter("agent-a", "runtime-a"),
      adapter("agent-b", "runtime-b"),
    ]);

    expect(started).toEqual(["agent-a", "agent-b"]);
    expect(output.status).toBe("completed");
    expect(output.workers.map((worker) => worker.lifecycle.map((entry) => entry.status))).toEqual([
      ["queued", "starting", "running", "completed"],
      ["queued", "starting", "running", "completed"],
    ]);
    expect(output.reconciliation.classification).toBe("AGREEMENT");
  });

  it("preserves adapter capabilities and propagates worker failure", async () => {
    const success = immediateAdapter("agent-a", "runtime-a", result(["packages/a.ts"]));
    const failure: AgentAdapter = {
      ...immediateAdapter("agent-b", "runtime-b", result(["packages/b.ts"])),
      async runTask() { throw new Error("real agent exited 2"); },
    };

    const output = await new ControlPlaneSupervisor({ now: clock() }).runParallel(task(), [success, failure]);

    expect(output.status).toBe("failed");
    expect(output.workers[0].capabilities).toEqual(capabilities);
    expect(output.workers[1]).toMatchObject({ status: "failed", error: "real agent exited 2" });
    expect(output.reconciliation.classification).toBe("UNRESOLVED");
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
    const output = reconcileWorkerResults([
      worker("a", ["apps/desktop/src-tauri/src/lib.rs"], "Duplicate run IDs overwrite cancellation state"),
      worker("b", ["apps/desktop/src-tauri/src/lib.rs"], "Descendant processes can keep output pipes open"),
    ]);

    expect(output).toMatchObject({
      classification: "DISAGREEMENT",
      sharedFiles: ["apps/desktop/src-tauri/src/lib.rs"],
      matchedFindings: [],
    });
  });

  it("serializes the governance limitation without claiming a block", () => {
    expect(createGovernanceLimitationEvidence()).toEqual({
      action: "git push",
      interception: "not_proven",
      decision: "unknown",
      dispatchOccurred: "unknown",
      handlerStarted: "unknown",
      outcome: "not_tested",
      reason: expect.stringContaining("no supported pre-execution interception boundary"),
    });
  });

  it("rejects two adapters that are the same runtime kind", async () => {
    const supervisor = new ControlPlaneSupervisor();
    await expect(supervisor.runParallel(task(), [
      immediateAdapter("a", "same-runtime", result(["a.ts"])),
      immediateAdapter("b", "same-runtime", result(["b.ts"])),
    ])).rejects.toThrow("independent agent runtime kinds");
  });
});

function immediateAdapter(id: string, kind: string, output: AgentTaskResult): AgentAdapter {
  return {
    id,
    kind,
    version: "1.0.0",
    capabilities,
    async runTask() { return output; },
  };
}

function task() {
  return {
    taskId: "task-1",
    title: "Independent repository review",
    workspace: "fixture",
    prompt: "Review the repository.",
  };
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
    capabilities,
    status: "completed",
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(1).toISOString(),
    lifecycle: [],
    observations: [],
    result: result(files, finding),
  };
}

function clock(): () => Date {
  let tick = 0;
  return () => new Date(tick++);
}
