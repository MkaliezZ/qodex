import { describe, expect, it, vi } from "vitest";
import {
  ActionRuntime,
  ActionRuntimeError,
  InMemoryActionEvidenceStore,
  createActionProposal,
  type ActionApproval,
  type ActionDecision,
  type ActionDecisionProvider,
  type ActionLifecycleHooks,
  type ActionProposal,
} from "../src/index.js";

const NOW = "2026-07-24T00:00:00.000Z";

async function proposal(
  actionId = "action-1",
  actionType = "kerniq.proof.increment-counter",
): Promise<ActionProposal> {
  return createActionProposal({
    actionId,
    taskId: "task-1",
    sessionId: "session-1",
    actionType,
    title: "Increment proof counter",
    summary: "Increment one disposable proof counter.",
    risk: "write",
    parameters: {
      sandboxId: "sandbox-1",
      markerName: "counter",
      contentDigest: "sha256:fixture",
    },
    requestedAt: NOW,
  });
}

function approvalFor(
  action: ActionProposal,
  overrides: Partial<ActionApproval> = {},
): ActionApproval {
  return {
    approvalId: `approval-${action.actionId}`,
    actionId: action.actionId,
    taskId: action.taskId,
    proposalDigest: action.proposalDigest,
    generation: 1,
    approvedAt: NOW,
    expiresAt: "2026-07-24T00:10:00.000Z",
    ...overrides,
  };
}

function decisionFor(
  action: ActionProposal,
  decision: ActionDecision["decision"],
): ActionDecision {
  return {
    decisionId: `decision-${action.actionId}-${decision}`,
    actionId: action.actionId,
    decision,
    reasonCode: `${decision}_fixture`,
    summary: `Canonical fixture returned ${decision}.`,
    policyVersion: "dhms-agentfuse@3.5.0",
    evidence: { schemaVersion: "agentfuse-evidence-schema-v0.1" },
    decidedAt: NOW,
  };
}

function runtime(
  hooks?: ActionLifecycleHooks,
  idFactory: () => string = () => "receipt-1",
): ActionRuntime {
  return new ActionRuntime({
    hooks,
    clock: () => new Date(NOW),
    idFactory,
  });
}

describe("ActionRuntime contracts and dispatch barrier", () => {
  it("creates and accepts a valid proposal with a deterministic digest", async () => {
    const first = await proposal();
    const second = await proposal();
    expect(first.schemaVersion).toBe("kerniq.action.v1");
    expect(first.proposalDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(second.proposalDigest).toBe(first.proposalDigest);
    expect((await runtime().propose(first)).state).toBe("AwaitingApproval");
  });

  it("rejects a proposal whose content no longer matches its digest", async () => {
    const action = await proposal();
    await expect(runtime().propose({ ...action, title: "Tampered" }))
      .rejects.toMatchObject({ code: "invalid_proposal" });
  });

  it("rejects approval bound to another proposal or task", async () => {
    const action = await proposal();
    const instance = runtime();
    await instance.propose(action);
    await expect(instance.approve(approvalFor(action, { proposalDigest: "sha256:wrong" })))
      .rejects.toMatchObject({ code: "approval_mismatch" });
  });

  it("rejects expired approval", async () => {
    const action = await proposal();
    const instance = runtime();
    await instance.propose(action);
    await expect(instance.approve(approvalFor(action, { expiresAt: NOW })))
      .rejects.toMatchObject({ code: "approval_expired" });
  });

  it("rejects stale approval generation", async () => {
    const action = await proposal();
    const instance = runtime();
    await instance.propose(action);
    await expect(instance.approve(approvalFor(action, { generation: 2 })))
      .rejects.toMatchObject({ code: "approval_generation_mismatch" });
  });

  it("allow dispatches the handler exactly once and keeps decision separate from outcome", async () => {
    const action = await proposal();
    const instance = runtime();
    let calls = 0;
    instance.registry.register(action.actionType, async () => {
      calls += 1;
      return { count: calls };
    });
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    const result = await instance.execute(action.actionId, async () => decisionFor(action, "allow"));
    expect(calls).toBe(1);
    expect(result.state).toBe("Completed");
    expect(result.decision?.decision).toBe("allow");
    expect(result.started?.executionReceiptId).toBe("receipt-1");
    expect(result.outcome).toMatchObject({ status: "completed", result: { count: 1 } });
  });

  it.each(["deny", "hold", "error"] as const)(
    "%s never dispatches",
    async (decision) => {
      const action = await proposal();
      const instance = runtime();
      let calls = 0;
      instance.registry.register(action.actionType, async () => {
        calls += 1;
      });
      await instance.propose(action);
      await instance.approve(approvalFor(action));
      const result = await instance.execute(action.actionId, async () => decisionFor(action, decision));
      expect(calls).toBe(0);
      expect(result.started).toBeNull();
      expect(result.outcome).toBeNull();
      expect(result.state).toBe({ deny: "Denied", hold: "Held", error: "DecisionError" }[decision]);
    },
  );

  it("decision provider failure becomes a decision error and never dispatches", async () => {
    const action = await proposal();
    const instance = runtime();
    const handler = vi.fn(async () => undefined);
    instance.registry.register(action.actionType, handler);
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    const result = await instance.execute(action.actionId, async () => {
      throw new Error("bridge unavailable");
    });
    expect(result.state).toBe("DecisionError");
    expect(result.decision?.reasonCode).toBe("decision_provider_failed");
    expect(handler).not.toHaveBeenCalled();
  });

  it("unknown action fails closed before AgentFuse or dispatch", async () => {
    const action = await proposal();
    const instance = runtime();
    const decide = vi.fn<ActionDecisionProvider>(async () => decisionFor(action, "allow"));
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    const result = await instance.execute(action.actionId, decide);
    expect(result.state).toBe("DecisionError");
    expect(result.decision?.reasonCode).toBe("unknown_action");
    expect(decide).not.toHaveBeenCalled();
  });

  it("beforeDispatch failure blocks the physical handler", async () => {
    const action = await proposal();
    const handler = vi.fn(async () => undefined);
    const instance = runtime({
      beforeDispatch: async () => {
        throw new Error("ledger unavailable");
      },
    });
    instance.registry.register(action.actionType, handler);
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    await expect(instance.execute(action.actionId, async () => decisionFor(action, "allow")))
      .rejects.toMatchObject({ code: "dispatch_barrier_failed" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("handler exception becomes a failed outcome, not a decision", async () => {
    const action = await proposal();
    const instance = runtime();
    instance.registry.register(action.actionType, async () => {
      throw new Error("raw handler failure");
    });
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    const result = await instance.execute(action.actionId, async () => decisionFor(action, "allow"));
    expect(result.decision?.decision).toBe("allow");
    expect(result.state).toBe("Failed");
    expect(result.outcome).toMatchObject({
      status: "failed",
      error: { code: "handler_failed", message: "Action handler failed after dispatch." },
    });
    expect(JSON.stringify(result)).not.toContain("raw handler failure");
  });

  it("cancellation before dispatch invokes neither decision provider nor handler", async () => {
    const action = await proposal();
    const instance = runtime();
    const handler = vi.fn(async () => undefined);
    const decide = vi.fn<ActionDecisionProvider>(async () => decisionFor(action, "allow"));
    instance.registry.register(action.actionType, handler);
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    expect(instance.cancel(action.actionId).state).toBe("Cancelled");
    await expect(instance.execute(action.actionId, decide))
      .rejects.toMatchObject({ code: "invalid_transition" });
    expect(decide).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancellation after dispatch is best effort and preserves a completed handler outcome", async () => {
    const action = await proposal();
    const instance = runtime();
    let release: (() => void) | undefined;
    instance.registry.register(action.actionType, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { physicalMutation: 1 };
    });
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    const running = instance.execute(action.actionId, async () => decisionFor(action, "allow"));
    await vi.waitFor(() => expect(instance.get(action.actionId)?.state).toBe("Running"));
    expect(instance.cancel(action.actionId).state).toBe("Running");
    release?.();
    const result = await running;
    expect(result.state).toBe("Completed");
    expect(result.outcome?.result).toEqual({ physicalMutation: 1 });
  });

  it("an AbortError after dispatch becomes an honest cancelled outcome", async () => {
    const instance = runtime();
    const abortingAction = await proposal("action-abort", "proof.abort");
    instance.registry.register(abortingAction.actionType, async () => {
      const error = new Error("cancelled");
      error.name = "AbortError";
      throw error;
    });
    await instance.propose(abortingAction);
    await instance.approve(approvalFor(abortingAction));
    const result = await instance.execute(
      abortingAction.actionId,
      async () => decisionFor(abortingAction, "allow"),
    );
    expect(result.state).toBe("Cancelled");
    expect(result.outcome?.status).toBe("cancelled");
  });

  it("duplicate execute calls share one execution and one physical mutation", async () => {
    const action = await proposal();
    const instance = runtime();
    let mutations = 0;
    instance.registry.register(action.actionType, async () => ({ count: ++mutations }));
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    const decide = async () => decisionFor(action, "allow");
    const [first, duplicate] = await Promise.all([
      instance.execute(action.actionId, decide),
      instance.execute(action.actionId, decide),
    ]);
    expect(mutations).toBe(1);
    expect(duplicate).toEqual(first);
  });

  it("duplicate execution receipt fails closed before the second handler", async () => {
    const instance = runtime(undefined, () => "same-receipt");
    const first = await proposal("action-1");
    const second = await proposal("action-2");
    let mutations = 0;
    instance.registry.register(first.actionType, async () => ({ count: ++mutations }));
    for (const action of [first, second]) {
      await instance.propose(action);
      await instance.approve(approvalFor(action));
    }
    await instance.execute(first.actionId, async () => decisionFor(first, "allow"));
    await expect(instance.execute(second.actionId, async () => decisionFor(second, "allow")))
      .rejects.toMatchObject({ code: "duplicate_dispatch" });
    expect(mutations).toBe(1);
  });

  it("records awaited lifecycle evidence in causal order", async () => {
    const evidence = new InMemoryActionEvidenceStore();
    const action = await proposal();
    const instance = runtime(evidence.hooks());
    instance.registry.register(action.actionType, async () => ({ count: 1 }));
    await instance.propose(action);
    await instance.approve(approvalFor(action));
    await instance.execute(action.actionId, async () => decisionFor(action, "allow"));
    expect(evidence.events.map((event) => event.type)).toEqual([
      "approval.accepted",
      "decision.requested",
      "decision.received",
      "dispatch.recorded",
      "outcome.settled",
    ]);
  });

  it("surfaces ActionRuntimeError with stable codes", () => {
    const error = new ActionRuntimeError("duplicate_terminal_outcome", "duplicate");
    expect(error).toMatchObject({
      name: "ActionRuntimeError",
      code: "duplicate_terminal_outcome",
    });
  });
});
