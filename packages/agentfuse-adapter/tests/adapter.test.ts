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

const COMMIT = "ec4b5842339dccfba0db62df7541920759203bc9";
const PROTOCOL = "kerniq.agentfuse.bridge.v1";
const SCHEMA = "agentfuse-evidence-schema-v0.1";
const POLICY = "dhms-agentfuse-runtime-guard@3.6.0";
const PROJECT_PROFILE = "kerniq-project-command-v1";
const PROJECT_POLICY_DIGEST =
  "sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad";
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

async function projectProposal(): Promise<ActionProposal> {
  return createActionProposal({
    actionId: "command-action-1",
    taskId: "task-1",
    sessionId: "session-1",
    actionType: "kerniq.project-command.run",
    title: "Run project tests",
    summary: "Run trusted catalog command package:test in the approved project.",
    risk: "process",
    parameters: {
      commandId: "package:test",
      catalogDigest: `sha256:${"a".repeat(64)}`,
      commandCategory: "test",
      projectBindingId: "project-1",
      projectFingerprint: `sha256:${"b".repeat(64)}`,
      policyProfileId: PROJECT_PROFILE,
      policyDigest: PROJECT_POLICY_DIGEST,
    },
    requestedAt: NOW,
  });
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

function projectResponse(
  action: ActionProposal,
  decision: "allow" | "block" = "allow",
) {
  return {
    ...response(action, decision === "allow" ? "allow" : "deny"),
    payload: {
      ...response(action, decision === "allow" ? "allow" : "deny").payload,
      decision,
      decisionId: `project-decision-${decision}`,
      policyProfileId: PROJECT_PROFILE,
      policyDigest: PROJECT_POLICY_DIGEST,
      evidence: {
        record_id: `project-evidence-${decision}`,
        boundary_decision: { decision },
      },
    },
  };
}

function projectAdapter(client: AgentFuseBridgeClient) {
  return new AgentFuseAdapter({
    bridge: client,
    expectedAgentFuseCommit: COMMIT,
    expectedProtocolVersion: PROTOCOL,
    expectedSchemaVersion: SCHEMA,
    expectedPolicyVersion: POLICY,
    policyProfileId: PROJECT_PROFILE,
    expectedPolicyDigest: PROJECT_POLICY_DIGEST,
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

  it("maps the trusted Project Command profile without execution fields", async () => {
    const action = await projectProposal();
    const request = mapActionProposalToDecisionRequest(
      action,
      approval(action),
      {
        policyProfileId: PROJECT_PROFILE,
        expectedPolicyDigest: PROJECT_POLICY_DIGEST,
      },
      "message-1",
    );
    expect(request.payload).toMatchObject({
      policyProfileId: PROJECT_PROFILE,
      expectedPolicyDigest: PROJECT_POLICY_DIGEST,
      proposal: action,
      approval: approval(action),
    });
    const encoded = JSON.stringify(request);
    for (const forbidden of [
      "projectRoot",
      "executable",
      "rawCommand",
      "environment",
      "stdout",
      "stderr",
    ]) {
      expect(encoded).not.toContain(forbidden);
    }
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

  it.each([
    ["allow", "allow"],
    ["block", "deny"],
  ] as const)("maps Project Command AgentFuse %s to KerniQ %s", async (core, mapped) => {
    const action = await projectProposal();
    const bridge: AgentFuseBridgeClient = {
      requestDecision: vi.fn(async () => projectResponse(action, core)),
    };
    const result = await projectAdapter(bridge).decide(
      action,
      approval(action),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      decision: mapped,
      policyVersion: POLICY,
      evidence: {
        agentFuseCommit: COMMIT,
        schemaVersion: SCHEMA,
        canonical: { record_id: `project-evidence-${core}` },
      },
    });
  });

  it.each([
    ["source", (value: ReturnType<typeof projectResponse>) => ({
      ...value,
      payload: { ...value.payload, agentFuseCommit: "0".repeat(40) },
    })],
    ["schema", (value: ReturnType<typeof projectResponse>) => ({
      ...value,
      payload: { ...value.payload, schemaVersion: "future" },
    })],
    ["policy", (value: ReturnType<typeof projectResponse>) => ({
      ...value,
      payload: { ...value.payload, policyVersion: "future" },
    })],
    ["profile", (value: ReturnType<typeof projectResponse>) => ({
      ...value,
      payload: { ...value.payload, policyProfileId: "other" },
    })],
    ["digest", (value: ReturnType<typeof projectResponse>) => ({
      ...value,
      payload: { ...value.payload, policyDigest: `sha256:${"0".repeat(64)}` },
    })],
    ["hold", (value: ReturnType<typeof projectResponse>) => ({
      ...value,
      payload: { ...value.payload, decision: "hold" },
    })],
  ])("fails closed on Project Command %s mismatch", async (_name, mutate) => {
    const action = await projectProposal();
    const bridge: AgentFuseBridgeClient = {
      requestDecision: async () => mutate(projectResponse(action)),
    };
    const result = await projectAdapter(bridge).decide(
      action,
      approval(action),
      new AbortController().signal,
    );
    expect(result.decision).toBe("error");
  });

  it("rejects duplicate Project Command decision IDs", async () => {
    const action = await projectProposal();
    const bridge: AgentFuseBridgeClient = {
      requestDecision: async () => projectResponse(action),
    };
    const instance = projectAdapter(bridge);
    expect((await instance.decide(
      action,
      approval(action),
      new AbortController().signal,
    )).decision).toBe("allow");
    await expect(instance.decide(
      action,
      approval(action),
      new AbortController().signal,
    )).resolves.toMatchObject({
      decision: "error",
      reasonCode: "duplicate_response",
    });
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
