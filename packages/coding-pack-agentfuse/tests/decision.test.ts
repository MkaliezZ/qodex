import { describe, expect, it, vi } from "vitest";
import {
  CodingPackStore,
  InMemoryCodingPackStoreAdapter,
  createCodingPackDestinationBinding,
  type CodingPackOperationSnapshot,
} from "@qodex/coding-pack-store";
import {
  AGENTFUSE_BRIDGE_PROTOCOL,
  AGENTFUSE_EVIDENCE_SCHEMA,
  AGENTFUSE_POLICY_VERSION,
  AGENTFUSE_SOURCE_COMMIT,
  CODING_PACK_EXPORT_POLICY_DIGEST,
  CODING_PACK_EXPORT_POLICY_ID,
  CodingPackAgentFuseAdapter,
  createCodingPackAgentFuseExportRequest,
  createCodingPackAgentFuseRequestDigest,
  evaluateCodingPackExportPolicy,
  trustedCodingPackExportPolicyDigest,
  validateCodingPackAgentFuseExportRequest,
  type CodingPackAgentFuseBridgeClient,
  type CodingPackAgentFuseBridgeRequest,
} from "../src/index.js";

const NOW = "2026-07-30T00:00:01.000Z";
const EXPIRES = "2026-07-30T00:10:00.000Z";

describe("Coding Pack AgentFuse request", () => {
  it("maps only the exact durable confirmed identity with a stable digest", async () => {
    const snapshot = await confirmedSnapshot();
    const request = createCodingPackAgentFuseExportRequest(snapshot, new Date(NOW));
    const first = await createCodingPackAgentFuseRequestDigest(request);
    const second = await createCodingPackAgentFuseRequestDigest(
      structuredClone(request),
    );

    expect(second).toBe(first);
    expect(request.approvalEvidenceDigest).toBe(snapshot.events[1]?.payloadDigest);
    expect(request).toEqual({
      protocolVersion: "kerniq.coding-pack.agentfuse-export.v1",
      operationId: snapshot.operation.operationId,
      proposalDigest: snapshot.proposal.proposalDigest,
      approvalEvidenceDigest: snapshot.events[1]?.payloadDigest,
      candidatePathsDigest: snapshot.proposal.candidatePathsDigest,
      sourceFingerprint: snapshot.proposal.sourceFingerprint,
      packId: snapshot.proposal.packId,
      manifestDigest: snapshot.proposal.manifestDigest,
      destinationBindingId: snapshot.proposal.destinationBindingId,
      destinationFingerprint: snapshot.proposal.destinationFingerprint,
      exportFormat: "kerniq-coding-pack-bundle-v1",
    });
    const encoded = JSON.stringify({ request, requestDigest: first });
    for (const forbidden of [
      "/Users/",
      "C:\\",
      "sourceContents",
      "manifestContents",
      "shell",
      "command",
      "displayLabel",
      "privateRoot",
    ]) {
      expect(encoded).not.toContain(forbidden);
    }
  });

  it("rejects unknown keys and malformed approval evidence", async () => {
    const request = createCodingPackAgentFuseExportRequest(
      await confirmedSnapshot(),
      new Date(NOW),
    );
    expect(() => validateCodingPackAgentFuseExportRequest({
      ...request,
      absoluteDestination: "/private/export",
    })).toThrow(TypeError);
    expect(() => validateCodingPackAgentFuseExportRequest({
      ...request,
      approvalEvidenceDigest: "approved=true",
    })).toThrow(TypeError);
    expect(() => validateCodingPackAgentFuseExportRequest({
      ...request,
      operationId: "/private/export",
    })).toThrow(TypeError);
    expect(() => validateCodingPackAgentFuseExportRequest({
      ...request,
      operationId: "C:\\private\\export",
    })).toThrow(TypeError);
  });

  it("verifies the separately frozen export policy digest", async () => {
    expect(await trustedCodingPackExportPolicyDigest()).toBe(
      CODING_PACK_EXPORT_POLICY_DIGEST,
    );
  });

  it("matches the reviewed Python request-digest vector", async () => {
    const request = validateCodingPackAgentFuseExportRequest({
      protocolVersion: "kerniq.coding-pack.agentfuse-export.v1",
      operationId: "operation-1",
      proposalDigest: digest("a"),
      approvalEvidenceDigest: digest("b"),
      candidatePathsDigest: digest("c"),
      sourceFingerprint: digest("a"),
      packId: `pack-${"b".repeat(64)}`,
      manifestDigest: digest("c"),
      destinationBindingId: `destination-${"c".repeat(24)}`,
      destinationFingerprint: digest("b"),
      exportFormat: "kerniq-coding-pack-bundle-v1",
    });
    expect(await createCodingPackAgentFuseRequestDigest(request)).toBe(
      "sha256:28c7e50774a4b51e62a476a73567886b94b52367d7cc1b534ce6426d4762f917",
    );
  });
});

describe("Coding Pack AgentFuse decision lifecycle", () => {
  it.each([
    ["allow", "decided_allow"],
    ["block", "decided_deny"],
  ] as const)("persists AgentFuse %s as %s with zero export work", async (
    bridgeDecision,
    state,
  ) => {
    const prepared = await preparedStore();
    const bridge = bridgeFor(bridgeDecision);
    const result = await evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date(NOW),
    });

    expect(result.decision).toBe(bridgeDecision === "block" ? "deny" : "allow");
    const durable = await prepared.store.getCodingPackOperation(
      prepared.confirmed.operation.operationId,
    );
    expect(durable?.operation.state).toBe(state);
    expect(durable?.decision).toMatchObject({
      requestDigest: result.requestDigest,
      decision: result.decision,
      policyId: CODING_PACK_EXPORT_POLICY_ID,
      policyDigest: CODING_PACK_EXPORT_POLICY_DIGEST,
    });
    expect(bridge.requestCodingPackExportDecision).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["bridge unavailable", async () => { throw new Error("bridge process exited"); }],
    ["protocol mismatch", async (request: CodingPackAgentFuseBridgeRequest) => ({
      ...response(request, "allow"),
      protocolVersion: "future",
    })],
    ["malformed response", async () => "invalid"],
    ["policy identity mismatch", async (request: CodingPackAgentFuseBridgeRequest) => ({
      ...response(request, "allow"),
      payload: {
        ...response(request, "allow").payload,
        policyDigest: digest("f"),
      },
    })],
  ] as const)("persists %s as decided_error", async (_name, implementation) => {
    const prepared = await preparedStore();
    const bridge: CodingPackAgentFuseBridgeClient = {
      requestCodingPackExportDecision: vi.fn(implementation),
    };
    const result = await evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date(NOW),
    });

    expect(result.decision).toBe("error");
    expect((await prepared.store.getCodingPackOperation(
      prepared.confirmed.operation.operationId,
    ))?.operation.state).toBe("decided_error");
  });

  it("does not call AgentFuse when confirmation or destination capability is absent", async () => {
    const adapterStore = new InMemoryCodingPackStoreAdapter();
    const store = createStore(adapterStore);
    const destination = await binding();
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(
      proposalInput(destination),
    );
    const bridge = bridgeFor("allow");

    await expect(evaluateCodingPackExportPolicy({
      store,
      adapter: adapter(bridge),
      operationId: proposed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date(NOW),
    })).rejects.toBeTruthy();
    expect(bridge.requestCodingPackExportDecision).not.toHaveBeenCalled();

    const approval = store.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: NOW,
      expiresAt: EXPIRES,
    });
    await store.confirmCodingPackExportProposal(approval);
    await expect(evaluateCodingPackExportPolicy({
      store,
      adapter: adapter(bridge),
      operationId: proposed.operation.operationId,
      destinationCapabilityAvailable: () => false,
      now: () => new Date(NOW),
    })).rejects.toBeTruthy();
    expect(bridge.requestCodingPackExportDecision).not.toHaveBeenCalled();
  });

  it("does not call AgentFuse for expired or already decided operations", async () => {
    const expired = await preparedStore();
    const expiredBridge = bridgeFor("allow");
    await expect(evaluateCodingPackExportPolicy({
      store: expired.store,
      adapter: adapter(expiredBridge),
      operationId: expired.confirmed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date("2026-07-30T00:10:00.000Z"),
    })).rejects.toMatchObject({ code: "coding_pack_proposal_expired" });
    expect(expiredBridge.requestCodingPackExportDecision).not.toHaveBeenCalled();

    const decided = await preparedStore();
    const firstBridge = bridgeFor("allow");
    await evaluateCodingPackExportPolicy({
      store: decided.store,
      adapter: adapter(firstBridge),
      operationId: decided.confirmed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date(NOW),
    });
    const secondBridge = bridgeFor("allow");
    await expect(evaluateCodingPackExportPolicy({
      store: decided.store,
      adapter: adapter(secondBridge),
      operationId: decided.confirmed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date(NOW),
    })).rejects.toBeTruthy();
    expect(secondBridge.requestCodingPackExportDecision).not.toHaveBeenCalled();
  });

  it("does not call AgentFuse when durable snapshot reconstruction fails", async () => {
    const prepared = await preparedStore();
    const bridge = bridgeFor("allow");
    vi.spyOn(prepared.store, "getCodingPackOperation")
      .mockRejectedValueOnce(new Error("corrupt durable event chain"));
    await expect(evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date(NOW),
    })).rejects.toThrow("corrupt durable event chain");
    expect(bridge.requestCodingPackExportDecision).not.toHaveBeenCalled();
  });

  it("keeps confirmed state when decision persistence fails", async () => {
    const prepared = await preparedStore();
    const record = vi.spyOn(prepared.store, "recordCodingPackExportDecision")
      .mockRejectedValueOnce(new Error("durable write failed"));
    await expect(evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridgeFor("allow")),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityAvailable: () => true,
      now: () => new Date(NOW),
    })).rejects.toThrow("durable write failed");
    expect(record).toHaveBeenCalledTimes(1);
    expect((await prepared.store.getCodingPackOperation(
      prepared.confirmed.operation.operationId,
    ))?.operation.state).toBe("confirmed");
  });
});

function adapter(bridge: CodingPackAgentFuseBridgeClient) {
  return new CodingPackAgentFuseAdapter({
    bridge,
    messageIdFactory: () => "message-1",
    clock: () => new Date(NOW),
  });
}

function bridgeFor(decision: "allow" | "block") {
  return {
    requestCodingPackExportDecision: vi.fn(
      async (request: CodingPackAgentFuseBridgeRequest) => response(request, decision),
    ),
  };
}

function response(
  request: CodingPackAgentFuseBridgeRequest,
  decision: "allow" | "block",
) {
  return {
    protocolVersion: AGENTFUSE_BRIDGE_PROTOCOL,
    messageId: request.messageId,
    messageType: "coding_pack_export_decision_result",
    payload: {
      decisionId: `decision-${decision}`,
      operationId: request.payload.request.operationId,
      requestDigest: request.payload.requestDigest,
      decision,
      reasonCode: decision === "allow" ? "policy_allowed" : "policy_blocked",
      policyVersion: AGENTFUSE_POLICY_VERSION,
      schemaVersion: AGENTFUSE_EVIDENCE_SCHEMA,
      agentFuseCommit: AGENTFUSE_SOURCE_COMMIT,
      policyProfileId: CODING_PACK_EXPORT_POLICY_ID,
      policyDigest: CODING_PACK_EXPORT_POLICY_DIGEST,
      decidedAt: NOW,
    },
  };
}

async function confirmedSnapshot(): Promise<CodingPackOperationSnapshot> {
  return (await preparedStore()).confirmed;
}

async function preparedStore() {
  const store = createStore(new InMemoryCodingPackStoreAdapter());
  const destination = await binding();
  await store.registerDestinationBinding(destination);
  const proposed = await store.createCodingPackExportProposal(
    proposalInput(destination),
  );
  const approval = store.createCodingPackExportApproval({
    operationId: proposed.operation.operationId,
    proposalDigest: proposed.proposal.proposalDigest,
    approvedAt: NOW,
    expiresAt: EXPIRES,
  });
  const confirmed = await store.confirmCodingPackExportProposal(approval);
  return { store, confirmed };
}

function createStore(adapter: InMemoryCodingPackStoreAdapter): CodingPackStore {
  let id = 0;
  return new CodingPackStore(adapter, {
    now: () => new Date(NOW),
    createId: () => `coding-pack-id-${++id}`,
  });
}

async function binding() {
  return createCodingPackDestinationBinding({
    privateIdentityMaterial: "browser\0private-capability",
    displayLabel: "Private export destination",
    createdAt: "2026-07-30T00:00:00.000Z",
    restartAvailable: false,
  });
}

function proposalInput(destination: Awaited<ReturnType<typeof binding>>) {
  return {
    operationId: "operation-1",
    createdAt: "2026-07-30T00:00:00.000Z",
    expiresAt: EXPIRES,
    destination,
    preview: {
      projectBindingId: "project-1",
      projectGeneration: 1,
      candidatePathsDigest: digest("1"),
      sourceFingerprint: digest("2"),
      packId: `pack-${"3".repeat(64)}`,
      manifestDigest: digest("4"),
    },
    previewConfirmation: {
      projectBindingId: "project-1",
      projectGeneration: 1,
      selectedPathsDigest: digest("1"),
      sourceFingerprint: digest("2"),
      packId: `pack-${"3".repeat(64)}`,
      manifestDigest: digest("4"),
      confirmedAt: "2026-07-30T00:00:00.000Z",
    },
  } as const;
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}
