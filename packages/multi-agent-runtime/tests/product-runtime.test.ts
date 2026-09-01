import { describe, expect, it, vi } from "vitest";
import {
  ControlPlaneProductRuntime,
  type AgentBackend,
  type ControlPlaneSessionLedger,
  type ControlPlaneWorkerSession,
  type WorkerRun,
} from "../src/index.js";

describe("ControlPlaneProductRuntime", () => {
  it("creates durable worker sessions before starting either backend", async () => {
    const order: string[] = [];
    const ledger = recordingLedger(order);
    const runtime = new ControlPlaneProductRuntime({ ledger });
    const backends = [backend("codex", "codex-cli", order), backend("dsh", "deepseek-harness", order)];

    const result = await runtime.runTask(task(), backends);

    expect(order.slice(0, 4)).toEqual([
      "probe:codex",
      "probe:dsh",
      "session:codex",
      "session:dsh",
    ]);
    expect(order.indexOf("start:codex")).toBeGreaterThan(order.indexOf("session:dsh"));
    expect(order.indexOf("start:dsh")).toBeGreaterThan(order.indexOf("session:dsh"));
    expect(result.workers.map((worker) => [worker.runId, worker.sessionId])).toEqual([
      ["product-task:worker:1", "session-codex"],
      ["product-task:worker:2", "session-dsh"],
    ]);
    expect(ledger.recordWorkerResult).toHaveBeenCalledTimes(2);
    expect(runtime.activeTask).toBeNull();
  });

  it("records admission failure against every pre-created session without starting agents", async () => {
    const order: string[] = [];
    const ledger = recordingLedger(order);
    const runtime = new ControlPlaneProductRuntime({ ledger });
    const codex = backend("codex", "codex-cli", order);
    const dsh = backend("dsh", "deepseek-harness", order);

    await expect(runtime.runTask({
      ...task(),
      workers: [{ backendId: "dsh", governanceRequired: true }],
    }, [codex, dsh])).rejects.toThrow("governed execution is required");

    expect(order).not.toContain("start:codex");
    expect(order).not.toContain("start:dsh");
    expect(ledger.recordWorkerFailure).toHaveBeenCalledTimes(2);
  });

  it("allows only one active top-level product task", async () => {
    const ledger = recordingLedger([]);
    let release = () => {};
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const slow = backend("codex", "codex-cli", [], barrier);
    const other = backend("dsh", "deepseek-harness", [], barrier);
    const runtime = new ControlPlaneProductRuntime({ ledger });
    const active = runtime.runTask(task(), [slow, other]);
    await vi.waitFor(() => expect(runtime.activeTask).toBe("product-task"));

    await expect(runtime.runTask({ ...task(), taskId: "another" }, [slow, other]))
      .rejects.toThrow("already active");
    release();
    await active;
  });
});

function task() {
  return {
    taskId: "product-task",
    title: "Product architecture review",
    workspace: "fixture",
    prompt: "Review the product boundary.",
  };
}

function backend(
  id: string,
  kind: string,
  order: string[],
  barrier: Promise<void> = Promise.resolve(),
): AgentBackend {
  return {
    id,
    kind,
    async probeCapabilities() {
      order.push(`probe:${id}`);
      return {
        version: "1.0.0",
        model: `${id}-model`,
        capabilities: {
          supportsStreaming: true,
          supportsCancel: false,
          supportsToolEvents: true,
          governanceTier: "OBSERVED",
          governanceMode: "none",
          supportsResume: false,
        },
      };
    },
    async startTask() {
      order.push(`start:${id}`);
      await barrier;
      return {
        result: {
          findings: [{
            finding: "Shared product risk",
            evidence: "packages/shared.ts:1",
            severity: "low",
            smallestFix: "Keep the boundary small.",
            files: ["packages/shared.ts"],
          }],
          rawResultReference: `sha256:${id}`,
        },
        governanceEvidence: [],
      };
    },
  };
}

function recordingLedger(order: string[]) {
  const sessions = new Map<string, ControlPlaneWorkerSession>();
  const ledger: ControlPlaneSessionLedger & {
    recordWorkerResult: ReturnType<typeof vi.fn>;
    recordWorkerFailure: ReturnType<typeof vi.fn>;
  } = {
    async createWorkerSession(input) {
      order.push(`session:${input.backendId}`);
      const session = {
        sessionId: `session-${input.backendId}`,
        workerRunId: input.workerRunId,
        backendId: input.backendId,
      };
      sessions.set(input.backendId, session);
      return session;
    },
    recordWorkerResult: vi.fn(async (worker: WorkerRun) => {
      expect(worker.sessionId).toBe(sessions.get(worker.agentId)?.sessionId);
    }),
    recordWorkerFailure: vi.fn(async () => {}),
  };
  return ledger;
}
