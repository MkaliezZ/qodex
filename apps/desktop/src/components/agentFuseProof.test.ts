import { describe, expect, it, vi } from "vitest";
import type {
  AgentFuseBridgeClient,
  AgentFuseDecisionRequest,
} from "@qodex/agentfuse-adapter";
import {
  InMemorySessionStore,
  SessionRuntime,
} from "@qodex/session-runtime";
import {
  AGENTFUSE_COMMIT,
  AGENTFUSE_POLICY,
  AGENTFUSE_SCHEMA,
  prepareAgentFuseProof,
  ProofCounterStore,
  type AgentFuseProofFixture,
} from "./agentFuseProof";

const NOW = new Date("2026-07-24T00:00:00.000Z");

describe("AgentFuse desktop proof", () => {
  it("records an allow lifecycle and mutates the trusted counter exactly once", async () => {
    const sessionRuntime = new SessionRuntime(new InMemorySessionStore());
    const counter = new ProofCounterStore();
    const bridge = fixtureBridge("allow");
    const proof = await prepareAgentFuseProof({
      fixture: "allow",
      bridge,
      sessionRuntime,
      counterStore: counter,
      now: () => NOW,
      idFactory: sequenceIds(),
    });
    const [first, duplicate] = await Promise.all([
      proof.approveAndRun(),
      proof.approveAndRun(),
    ]);
    expect(first.state).toBe("Completed");
    expect(duplicate.outcome?.executionReceiptId).toBe(first.outcome?.executionReceiptId);
    expect(counter.snapshot()).toEqual({ count: 1, handlerInvocations: 1 });
    expect(bridge.requestDecision).toHaveBeenCalledTimes(1);

    const entries = await sessionRuntime.loadActivePath(proof.sessionId);
    expect(entries.map(({ type }) => type)).toEqual([
      "SESSION_CREATED",
      "ACTION_PROPOSED",
      "ACTION_APPROVED",
      "ACTION_DECIDED",
      "ACTION_STARTED",
      "ACTION_COMPLETED",
    ]);
    const decided = entries.find(({ type }) => type === "ACTION_DECIDED");
    expect(decided?.safeMetadata).toMatchObject({
      actionId: proof.proposal.actionId,
      decisionId: expect.any(String),
      decision: "allow",
      approvalId: expect.any(String),
      agentFuseCommit: AGENTFUSE_COMMIT,
      policyVersion: AGENTFUSE_POLICY,
      decisionSchemaVersion: AGENTFUSE_SCHEMA,
    });
    const started = entries.find(({ type }) => type === "ACTION_STARTED");
    expect(started?.safeMetadata).toMatchObject({
      actionId: proof.proposal.actionId,
      decisionId: expect.any(String),
      approvalId: expect.any(String),
      executionReceiptId: expect.any(String),
    });
  });

  it("records a deny decision without dispatch or outcome", async () => {
    const sessionRuntime = new SessionRuntime(new InMemorySessionStore());
    const counter = new ProofCounterStore();
    const proof = await prepareAgentFuseProof({
      fixture: "deny",
      bridge: fixtureBridge("deny"),
      sessionRuntime,
      counterStore: counter,
      now: () => NOW,
      idFactory: sequenceIds(),
    });
    const result = await proof.approveAndRun();
    expect(result.state).toBe("Denied");
    expect(result.started).toBeNull();
    expect(result.outcome).toBeNull();
    expect(counter.snapshot()).toEqual({ count: 0, handlerInvocations: 0 });
    expect((await sessionRuntime.loadActivePath(proof.sessionId)).map(({ type }) => type))
      .toEqual(["SESSION_CREATED", "ACTION_PROPOSED", "ACTION_APPROVED", "ACTION_DECIDED"]);
  });

  it("fails closed when the bridge is unavailable", async () => {
    const sessionRuntime = new SessionRuntime(new InMemorySessionStore());
    const counter = new ProofCounterStore();
    const proof = await prepareAgentFuseProof({
      fixture: "allow",
      bridge: {
        requestDecision: vi.fn(async () => {
          throw new Error("bridge unavailable");
        }),
      },
      sessionRuntime,
      counterStore: counter,
      now: () => NOW,
      idFactory: sequenceIds(),
    });
    const result = await proof.approveAndRun();
    expect(result.state).toBe("DecisionError");
    expect(result.started).toBeNull();
    expect(counter.snapshot()).toEqual({ count: 0, handlerInvocations: 0 });
    const entries = await sessionRuntime.loadActivePath(proof.sessionId);
    expect(entries.map(({ type }) => type))
      .toEqual(["SESSION_CREATED", "ACTION_PROPOSED", "ACTION_APPROVED", "ACTION_DECIDED"]);
    expect(entries.at(-1)?.safeMetadata).toMatchObject({
      decision: "error",
      agentFuseCommit: "local-fail-closed",
    });
  });

  it("records interruption honestly when settlement persistence fails", async () => {
    const sessionRuntime = new SessionRuntime(new InMemorySessionStore());
    const counter = new ProofCounterStore();
    const bridge = fixtureBridge("allow");
    const proof = await prepareAgentFuseProof({
      fixture: "allow",
      bridge,
      sessionRuntime,
      counterStore: counter,
      now: () => NOW,
      idFactory: sequenceIds(),
      failSettlementPersistence: true,
    });
    const first = await proof.approveAndRun();
    const duplicate = await proof.approveAndRun();
    expect(first).toMatchObject({
      state: "Interrupted",
      outcome: {
        status: "unknown_or_interrupted",
        error: { code: "settlement_persistence_failed" },
      },
    });
    expect(duplicate).toEqual(first);
    expect(counter.snapshot()).toEqual({ count: 1, handlerInvocations: 1 });
    expect(bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect((await sessionRuntime.loadActivePath(proof.sessionId)).map(({ type }) => type))
      .toEqual([
        "SESSION_CREATED",
        "ACTION_PROPOSED",
        "ACTION_APPROVED",
        "ACTION_DECIDED",
        "ACTION_STARTED",
        "SESSION_INTERRUPTED",
      ]);
    expect(await sessionRuntime.projectCurrentState(proof.sessionId)).toMatchObject({
      status: "Interrupted",
      pendingAction: {
        started: true,
        recoveryRequired: false,
      },
    });
  });

  it("restart recovery records interruption when both immediate evidence writes fail", async () => {
    const sessionRuntime = new SessionRuntime(new InMemorySessionStore());
    const counter = new ProofCounterStore();
    const proof = await prepareAgentFuseProof({
      fixture: "allow",
      bridge: fixtureBridge("allow"),
      sessionRuntime,
      counterStore: counter,
      now: () => NOW,
      idFactory: sequenceIds(),
      failSettlementPersistence: true,
      failInterruptionPersistence: true,
    });
    const result = await proof.approveAndRun();
    expect(result.state).toBe("Interrupted");
    expect(counter.snapshot()).toEqual({ count: 1, handlerInvocations: 1 });
    expect((await sessionRuntime.loadActivePath(proof.sessionId)).at(-1)?.type)
      .toBe("ACTION_STARTED");
    const recovered = await sessionRuntime.recoverSession(proof.sessionId);
    expect(recovered).toMatchObject({
      status: "Interrupted",
      pendingAction: {
        started: true,
        recoveryRequired: false,
      },
    });
    expect((await sessionRuntime.loadActivePath(proof.sessionId)).at(-1)?.type)
      .toBe("SESSION_INTERRUPTED");
  });
});

function fixtureBridge(fixture: AgentFuseProofFixture): AgentFuseBridgeClient {
  return {
    requestDecision: vi.fn(async (request: AgentFuseDecisionRequest) => ({
      protocolVersion: request.protocolVersion,
      messageId: request.messageId,
      messageType: "decision_result",
      payload: {
        decisionId: `decision-${fixture}-${request.payload.proposal.actionId}`,
        actionId: request.payload.proposal.actionId,
        decision: fixture,
        reasonCode: `${fixture}_fixture`,
        summary: `Canonical fixture returned ${fixture}.`,
        policyVersion: AGENTFUSE_POLICY,
        schemaVersion: AGENTFUSE_SCHEMA,
        agentFuseCommit: AGENTFUSE_COMMIT,
        evidence: {
          record_id: `record-${fixture}`,
          schema_version: AGENTFUSE_SCHEMA,
        },
        decidedAt: NOW.toISOString(),
      },
    })),
  };
}

function sequenceIds(): () => string {
  let index = 0;
  return () => `proof-id-${++index}`;
}
