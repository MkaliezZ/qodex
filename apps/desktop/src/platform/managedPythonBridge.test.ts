import { describe, expect, it, vi } from "vitest";
import { TauriManagedPythonBridge } from "./managedPythonBridge";
import type { AgentFuseDecisionRequest } from "@qodex/agentfuse-adapter";

const REQUEST: AgentFuseDecisionRequest = {
  protocolVersion: "kerniq.agentfuse.bridge.v1",
  messageId: "message-1",
  messageType: "decision_request",
  payload: {
    proposal: {
      schemaVersion: "kerniq.action.v1",
      actionId: "action-1",
      taskId: "task-1",
      actionType: "kerniq.proof.increment-counter",
      title: "Proof",
      summary: "Proof",
      risk: "write",
      parameters: {},
      requestedAt: "2026-07-24T00:00:00.000Z",
      proposalDigest: "sha256:fixture",
    },
    approval: {
      approvalId: "approval-1",
      actionId: "action-1",
      taskId: "task-1",
      proposalDigest: "sha256:fixture",
      generation: 1,
      approvedAt: "2026-07-24T00:00:00.000Z",
      expiresAt: "2026-07-24T00:05:00.000Z",
    },
    policyFixtureId: "kerniq-proof-allow-v1",
  },
};

describe("TauriManagedPythonBridge", () => {
  it("maps runtime lifecycle calls to fixed native commands", async () => {
    const invoke = vi.fn(async (command: string) => ({ command }));
    const bridge = new TauriManagedPythonBridge(invoke);
    await bridge.inspect();
    await bridge.provision();
    await bridge.verify();
    await bridge.remove();
    await bridge.selfCheck();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "managed_python_inspect",
      "managed_python_provision",
      "managed_python_verify",
      "managed_python_remove",
      "managed_python_self_check",
    ]);
  });

  it("passes only the structured decision request to the native command", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const bridge = new TauriManagedPythonBridge(invoke);
    await bridge.requestDecision(REQUEST, new AbortController().signal);
    expect(invoke).toHaveBeenCalledWith("agentfuse_decide", { request: REQUEST });
  });

  it("does not invoke native code when already cancelled", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const bridge = new TauriManagedPythonBridge(invoke);
    const controller = new AbortController();
    controller.abort();
    await expect(bridge.requestDecision(REQUEST, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(invoke).not.toHaveBeenCalled();
  });
});
