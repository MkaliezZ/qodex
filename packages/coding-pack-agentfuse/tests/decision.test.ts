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
      destinationCapabilityVerifier: verifier(true),
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
    ["array response", async () => []],
    ["prototype-bearing response", async (request: CodingPackAgentFuseBridgeRequest) => (
      Object.assign(Object.create({ inherited: true }), response(request, "allow"))
    )],
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
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    });

    expect(result.decision).toBe("error");
    expect((await prepared.store.getCodingPackOperation(
      prepared.confirmed.operation.operationId,
    ))?.operation.state).toBe("decided_error");
  });

  it.each([
    ["unknown outer field", (value: ReturnType<typeof response>) => ({
      ...value,
      futureDecisionMetadata: "unsafe",
    })],
    ["unknown payload field", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, futureDecisionMetadata: "unsafe" },
    })],
    ["missing outer field", (value: ReturnType<typeof response>) => {
      const { messageType: _messageType, ...missing } = value;
      return missing;
    }],
    ["missing payload field", (value: ReturnType<typeof response>) => {
      const { policyDigest: _policyDigest, ...missing } = value.payload;
      return { ...value, payload: missing };
    }],
    ["array payload", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: [],
    })],
    ["prototype-bearing payload", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: Object.assign(Object.create({ inherited: true }), value.payload),
    })],
    ["raw error", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, rawError: "/private/error" },
    })],
    ["absolute destination", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, absoluteDestination: "/private/export" },
    })],
    ["traceback", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, traceback: "sensitive" },
    })],
    ["source contents", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, sourceContents: "secret" },
    })],
    ["manifest contents", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, manifestContents: "secret" },
    })],
    ["shell", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, shell: "rm" },
    })],
    ["command", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, command: "rm" },
    })],
    ["ill-formed decision ID", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, decisionId: "decision-\ud800" },
    })],
    ["controlled decision ID", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, decisionId: "decision\nunsafe" },
    })],
    ["oversized decision ID", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, decisionId: "d".repeat(257) },
    })],
    ["invalid reason code", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, reasonCode: "Not_Canonical" },
    })],
    ["non-canonical timestamp", (value: ReturnType<typeof response>) => ({
      ...value,
      payload: { ...value.payload, decidedAt: "2026-07-30T00:00:01Z" },
    })],
  ] as const)("maps a bridge response with %s to exact terminal error evidence", async (
    _name,
    mutate,
  ) => {
    const prepared = await preparedStore();
    const bridge: CodingPackAgentFuseBridgeClient = {
      requestCodingPackExportDecision: vi.fn(async (request) => (
        mutate(response(request, "allow"))
      )),
    };
    const result = await evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    });

    expect(result).toMatchObject({
      decision: "error",
      reasonCode: "invalid_bridge_response",
      evaluationStartedAt: NOW,
    });
    expect(JSON.stringify(result)).not.toContain("/private");
  });

  it.each(["allow", "block"] as const)(
    "converts late AgentFuse %s into durable terminal error evidence",
    async (bridgeDecision) => {
      const prepared = await preparedStore();
      prepared.setStoreNow("2026-07-30T00:10:00.001Z");
      const result = await evaluateCodingPackExportPolicy({
        store: prepared.store,
        adapter: adapter(bridgeFor(bridgeDecision, EXPIRES)),
        operationId: prepared.confirmed.operation.operationId,
        destinationCapabilityVerifier: verifier(true),
        now: () => new Date("2026-07-30T00:09:59.999Z"),
      });

      expect(result).toMatchObject({
        decision: "error",
        reasonCode: "decision_window_expired_during_evaluation",
        evaluationStartedAt: "2026-07-30T00:09:59.999Z",
        decidedAt: EXPIRES,
      });
      expect((await prepared.store.getCodingPackOperation(
        prepared.confirmed.operation.operationId,
      ))?.operation.state).toBe("decided_error");
    },
  );

  it("persists bridge timeout evidence completed after expiry", async () => {
    const prepared = await preparedStore();
    const completedAt = "2026-07-30T00:10:00.001Z";
    prepared.setStoreNow(completedAt);
    const bridge: CodingPackAgentFuseBridgeClient = {
      requestCodingPackExportDecision: vi.fn(async () => {
        throw new Error("bridge timeout");
      }),
    };
    const result = await evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge, completedAt),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date("2026-07-30T00:09:59.999Z"),
    });

    expect(result).toMatchObject({
      decision: "error",
      reasonCode: "bridge_timeout",
      evaluationStartedAt: "2026-07-30T00:09:59.999Z",
      decidedAt: completedAt,
    });
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
      destinationCapabilityVerifier: verifier(true),
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
      destinationCapabilityVerifier: verifier(false),
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
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date("2026-07-30T00:10:00.000Z"),
    })).rejects.toMatchObject({ code: "coding_pack_proposal_expired" });
    expect(expiredBridge.requestCodingPackExportDecision).not.toHaveBeenCalled();

    const decided = await preparedStore();
    const firstBridge = bridgeFor("allow");
    await evaluateCodingPackExportPolicy({
      store: decided.store,
      adapter: adapter(firstBridge),
      operationId: decided.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    });
    const secondBridge = bridgeFor("allow");
    await expect(evaluateCodingPackExportPolicy({
      store: decided.store,
      adapter: adapter(secondBridge),
      operationId: decided.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    })).rejects.toBeTruthy();
    expect(secondBridge.requestCodingPackExportDecision).not.toHaveBeenCalled();
  });

  it("does not backdate evaluation when destination verification crosses expiry", async () => {
    const prepared = await preparedStore();
    const bridge = bridgeFor("allow");
    const verifierAfterDelay = verifier(true);
    const times = ["2026-07-30T00:09:59.999Z", EXPIRES];

    await expect(evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifierAfterDelay,
      now: () => new Date(times.shift() ?? EXPIRES),
    })).rejects.toMatchObject({ code: "coding_pack_proposal_expired" });

    expect(verifierAfterDelay.verifyDestinationCapability).toHaveBeenCalledTimes(1);
    expect(bridge.requestCodingPackExportDecision).not.toHaveBeenCalled();
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
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    })).rejects.toThrow("corrupt durable event chain");
    expect(bridge.requestCodingPackExportDecision).not.toHaveBeenCalled();
  });

  it("keeps confirmed state when decision persistence fails", async () => {
    const prepared = await preparedStore();
    const record = vi.spyOn(prepared.store, "recordCodingPackExportDecision")
      .mockRejectedValueOnce(new Error("durable write failed"));
    const bridge = bridgeFor("allow");
    await expect(evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    })).rejects.toThrow("durable write failed");
    expect(record).toHaveBeenCalledTimes(1);
    expect((await prepared.store.getCodingPackOperation(
      prepared.confirmed.operation.operationId,
    ))?.operation.state).toBe("confirmed");
    await expect(evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    })).resolves.toMatchObject({ decision: "allow" });
    expect(bridge.requestCodingPackExportDecision).toHaveBeenCalledTimes(2);
  });

  it("permits only one same-process evaluation for an operation", async () => {
    const prepared = await preparedStore();
    let release: (() => void) | undefined;
    const bridge: CodingPackAgentFuseBridgeClient = {
      requestCodingPackExportDecision: vi.fn(async (request) => new Promise((resolve) => {
        release = () => resolve(response(request, "allow"));
      })),
    };
    const first = evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    });
    await expect(evaluateCodingPackExportPolicy({
      store: prepared.store,
      adapter: adapter(bridge),
      operationId: prepared.confirmed.operation.operationId,
      destinationCapabilityVerifier: verifier(true),
      now: () => new Date(NOW),
    })).rejects.toMatchObject({ code: "coding_pack_decision_in_progress" });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release?.();
    await expect(first).resolves.toMatchObject({ decision: "allow" });
    expect(bridge.requestCodingPackExportDecision).toHaveBeenCalledTimes(1);
  });
});

function adapter(bridge: CodingPackAgentFuseBridgeClient, completedAt = NOW) {
  return new CodingPackAgentFuseAdapter({
    bridge,
    messageIdFactory: () => "message-1",
    clock: () => new Date(completedAt),
  });
}

function bridgeFor(decision: "allow" | "block", decidedAt = NOW) {
  return {
    requestCodingPackExportDecision: vi.fn(
      async (request: CodingPackAgentFuseBridgeRequest) => (
        response(request, decision, decidedAt)
      ),
    ),
  };
}

function verifier(available: boolean) {
  return {
    verifyDestinationCapability: vi.fn(async () => available),
  };
}

function response(
  request: CodingPackAgentFuseBridgeRequest,
  decision: "allow" | "block",
  decidedAt = NOW,
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
      decidedAt,
    },
  };
}

async function confirmedSnapshot(): Promise<CodingPackOperationSnapshot> {
  return (await preparedStore()).confirmed;
}

async function preparedStore() {
  let storeNow = NOW;
  const store = createStore(
    new InMemoryCodingPackStoreAdapter(),
    () => new Date(storeNow),
  );
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
  return {
    store,
    confirmed,
    setStoreNow(value: string) {
      storeNow = value;
    },
  };
}

function createStore(
  adapter: InMemoryCodingPackStoreAdapter,
  now: () => Date = () => new Date(NOW),
): CodingPackStore {
  let id = 0;
  return new CodingPackStore(adapter, {
    now,
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
