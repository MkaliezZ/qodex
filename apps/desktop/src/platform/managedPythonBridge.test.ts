import { describe, expect, it, vi } from "vitest";
import { TauriManagedPythonBridge } from "./managedPythonBridge";
import type { AgentFuseDecisionRequest } from "@qodex/agentfuse-adapter";
import type { CodingPackAgentFuseBridgeRequest } from "@qodex/coding-pack-agentfuse";

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

const CODING_PACK_REQUEST: CodingPackAgentFuseBridgeRequest = {
  protocolVersion: "kerniq.agentfuse.bridge.v1",
  messageId: "coding-pack-message-1",
  messageType: "coding_pack_export_decision_request",
  payload: {
    request: {
      protocolVersion: "kerniq.coding-pack.agentfuse-export.v1",
      operationId: "operation-1",
      proposalDigest: `sha256:${"1".repeat(64)}`,
      approvalEvidenceDigest: `sha256:${"2".repeat(64)}`,
      candidatePathsDigest: `sha256:${"3".repeat(64)}`,
      sourceFingerprint: `sha256:${"4".repeat(64)}`,
      packId: `pack-${"5".repeat(64)}`,
      manifestDigest: `sha256:${"6".repeat(64)}`,
      destinationBindingId: `destination-${"7".repeat(24)}`,
      destinationFingerprint: `sha256:${"8".repeat(64)}`,
      exportFormat: "kerniq-coding-pack-bundle-v1",
    },
    requestDigest: `sha256:${"9".repeat(64)}`,
    policyProfileId: "kerniq-coding-pack-export-v1",
    expectedPolicyDigest:
      "sha256:752a8bf1f251e5c05f07ddd8d820af3c5554fb37e3a47fbcf41933f614167d07",
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
    await bridge.requestCodingPackExportDecision(
      CODING_PACK_REQUEST,
      new AbortController().signal,
    );
    expect(invoke).toHaveBeenLastCalledWith(
      "agentfuse_decide",
      { request: CODING_PACK_REQUEST },
    );
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
