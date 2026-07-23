import { describe, expect, it, vi } from "vitest";
import {
  createActionProposal,
  type ActionApproval,
  type ActionProposal,
} from "@qodex/action-runtime";
import {
  AgentFuseAdapter,
  mapActionProposalToDecisionRequest,
  validateDecisionResponse,
  type AgentFuseBridgeClient,
} from "../src/index.js";

const COMMIT = "8c6ae9875b3618a529d5150c96385da7461099c2";
const PROTOCOL = "kerniq.agentfuse.bridge.v1";
const SCHEMA = "agentfuse-evidence-schema-v0.1";
const POLICY = "dhms-agentfuse-runtime-guard@3.5.0";
const NOW = "2026-07-24T00:00:00.000Z";

async function proposal(): Promise<ActionProposal> {
  return createActionProposal({
    actionId: "action-1",
    taskId: "task-1",
    sessionId: "session-1",
    actionType: "kerniq.proof.increment-counter",
    title: "Proof counter",
    summary: "Increment a disposable proof counter.",
    risk: "write",
    parameters: {
      sandboxId: "sandbox-1",
      markerName: "counter",
      contentDigest: "sha256:fixture",
    },
    requestedAt: NOW,
  });
}

function approval(action: ActionProposal): ActionApproval {
  return {
    approvalId: "approval-1",
    actionId: action.actionId,
    taskId: action.taskId,
    proposalDigest: action.proposalDigest,
    generation: 1,
    approvedAt: NOW,
    expiresAt: "2026-07-24T00:10:00.000Z",
  };
}

function response(
  action: ActionProposal,
  decision: "allow" | "deny" | "hold" | "error" = "allow",
) {
  return {
    protocolVersion: PROTOCOL,
    messageId: "message-1",
    messageType: "decision_result",
    payload: {
      decisionId: `decision-${decision}`,
      actionId: action.actionId,
      decision,
      reasonCode: `${decision}_fixture`,
      summary: `Canonical AgentFuse returned ${decision}.`,
      policyVersion: POLICY,
      schemaVersion: SCHEMA,
      agentFuseCommit: COMMIT,
      evidence: {
        record_id: `evidence-${decision}`,
        boundary_decision: { decision: decision === "allow" ? "allow" : "block" },
      },
      decidedAt: NOW,
    },
  };
}

function adapter(client: AgentFuseBridgeClient, fixture = "kerniq-proof-allow-v1") {
  return new AgentFuseAdapter({
    bridge: client,
    expectedAgentFuseCommit: COMMIT,
    expectedProtocolVersion: PROTOCOL,
    expectedSchemaVersion: SCHEMA,
    expectedPolicyVersion: POLICY,
    policyFixtureId: fixture,
    messageIdFactory: () => "message-1",
    clock: () => new Date(NOW),
  });
}

describe("AgentFuse adapter", () => {
  it("maps the full action and approval identity without execution fields", async () => {
    const action = await proposal();
    const request = mapActionProposalToDecisionRequest(
      action,
      approval(action),
      "trusted-fixture",
      "message-1",
    );
    expect(request.payload.proposal).toEqual(action);
    expect(request.payload.approval).toEqual(approval(action));
    expect(request.payload.policyFixtureId).toBe("trusted-fixture");
    expect(JSON.stringify(request)).not.toContain("handler");
  });

  it.each(["allow", "deny", "hold", "error"] as const)(
    "preserves a validated canonical %s decision and evidence",
    async (decision) => {
      const action = await proposal();
      const bridge: AgentFuseBridgeClient = {
        requestDecision: vi.fn(async () => response(action, decision)),
      };
      const result = await adapter(bridge).decide(
        action,
        approval(action),
        new AbortController().signal,
      );
      expect(result.decision).toBe(decision);
      expect(result.policyVersion).toBe(POLICY);
      expect(result.evidence).toMatchObject({
        agentFuseCommit: COMMIT,
        schemaVersion: SCHEMA,
        canonical: { record_id: `evidence-${decision}` },
      });
    },
  );

  it.each([
    ["protocol mismatch", (value: ReturnType<typeof response>) => ({ ...value, protocolVersion: "future" })],
    ["message ID mismatch", (value: ReturnType<typeof response>) => ({ ...value, messageId: "wrong" })],
    ["source revision mismatch", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, agentFuseCommit: "0".repeat(40) },
    })],
    ["schema mismatch", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, schemaVersion: "future" },
    })],
    ["unknown decision", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, decision: "maybe" },
    })],
    ["missing evidence", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, evidence: undefined },
    })],
    ["action mismatch", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, actionId: "other" },
    })],
  ])("fails closed on %s", async (_name, mutate) => {
    const action = await proposal();
    const bridge: AgentFuseBridgeClient = {
      requestDecision: async () => mutate(response(action)),
    };
    const result = await adapter(bridge).decide(
      action,
      approval(action),
      new AbortController().signal,
    );
    expect(result.decision).toBe("error");
    expect(result.reasonCode).not.toBe("");
  });

  it("fails closed on malformed JSON, timeout, and bridge process exit", async () => {
    const action = await proposal();
    for (const failure of [
      async () => "not-an-object",
      async () => { throw new Error("request timeout"); },
      async () => { throw new Error("bridge process exited"); },
    ]) {
      const result = await adapter({ requestDecision: failure }).decide(
        action,
        approval(action),
        new AbortController().signal,
      );
      expect(result.decision).toBe("error");
    }
  });

  it("rejects duplicate canonical decision IDs", async () => {
    const action = await proposal();
    const bridge: AgentFuseBridgeClient = {
      requestDecision: async () => response(action),
    };
    const instance = adapter(bridge);
    expect((await instance.decide(action, approval(action), new AbortController().signal)).decision)
      .toBe("allow");
    const duplicate = await instance.decide(
      action,
      approval(action),
      new AbortController().signal,
    );
    expect(duplicate).toMatchObject({ decision: "error", reasonCode: "duplicate_response" });
  });

  it("validates a complete response independently", async () => {
    const action = await proposal();
    expect(validateDecisionResponse(response(action), {
      messageId: "message-1",
      actionId: action.actionId,
      expectedAgentFuseCommit: COMMIT,
      expectedProtocolVersion: PROTOCOL,
      expectedSchemaVersion: SCHEMA,
      expectedPolicyVersion: POLICY,
    }).payload.decision).toBe("allow");
  });
});
