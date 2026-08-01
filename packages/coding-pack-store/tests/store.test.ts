import { describe, expect, it } from "vitest";
import {
  CodingPackStore,
  CodingPackStoreError,
  InMemoryCodingPackStoreAdapter,
  canonicalJson,
  createCodingPackAgentFuseExportRequestIdentity,
  createCodingPackAgentFuseRequestDigest,
  createCodingPackDestinationBinding,
  createEventPayloadDigest,
  sha256Canonical,
  sha256Text,
  validateCodingPackExportProposal,
  type CodingPackDestinationBinding,
  type CodingPackEvent,
  type CodingPackOperationRecord,
  type CodingPackOperationSnapshot,
  type CodingPackStoreAdapter,
  type CreateCodingPackExportProposalInput,
} from "../src/index.js";

const CREATED_AT = "2026-07-30T00:00:00.000Z";
const PROPOSAL_EXPIRES_AT = "2026-07-30T00:10:00.000Z";
const APPROVAL_EXPIRES_AT = "2026-07-30T00:05:00.000Z";

describe("CodingPackStore canonical identity", () => {
  it("uses reviewed UTF-8 canonical vectors across TypeScript and Rust", async () => {
    const proposal = canonicalVectorProposal();
    const proposalDigest = await sha256Canonical(proposal);
    expect(proposalDigest).toBe(
      "sha256:50d56ad331620d45c343d10b4df06192ebdc94cfd7d1df1637debc857cc331a2",
    );
    expect(await sha256Canonical({ proposal: { ...proposal, proposalDigest } })).toBe(
      "sha256:24dcd9be102988d7e00e373b07afe8c02d768f260c393430dcb4896bea76f66a",
    );
    expect(await sha256Text("tauri\0/fixture/Exports")).toBe(
      "sha256:1d742926433865d0d7a3e5f69c6f989a1a86b89aa045f0b78b1be4862b8a4214",
    );
    expect(canonicalJson({ "\u00e9": 1, z: 2 })).toBe("{\"z\":2,\"é\":1}");
  });

  it("rejects malformed Unicode and non-canonical numeric identity", () => {
    expect(() => canonicalJson("\ud800")).toThrow(CodingPackStoreError);
    expect(() => canonicalJson({ value: undefined } as never)).toThrow(CodingPackStoreError);
    expect(() => canonicalJson(Number.NaN)).toThrow(CodingPackStoreError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(CodingPackStoreError);
    expect(() => canonicalJson(-0)).toThrow(CodingPackStoreError);
  });
});

describe("CodingPackStore lifecycle", () => {
  it("persists PACK_PROPOSED then PACK_CONFIRMED with strict sequence and restart readback", async () => {
    const adapter = new InspectableAdapter();
    const store = createStore(adapter);
    const destination = await destinationBinding("primary");
    await store.registerDestinationBinding(destination);

    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    expect(proposed.operation.state).toBe("proposed");
    expect(proposed.operation.lastEventSequence).toBe(1);
    expect(proposed.events.map((event) => event.eventType)).toEqual(["PACK_PROPOSED"]);
    expect(proposed.approval).toBeNull();

    const restarted = createStore(adapter, 20);
    const readBack = await restarted.getCodingPackOperation(proposed.operation.operationId);
    expect(readBack?.operation).toEqual(proposed.operation);
    expect(readBack?.operation.state).toBe("proposed");
    expect((await restarted.listCodingPackOperations()).map((item) => item.operation.operationId))
      .toEqual([proposed.operation.operationId]);

    const approval = restarted.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: "2026-07-30T00:00:00.020Z",
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    const confirmed = await restarted.confirmCodingPackExportProposal(approval);
    expect(confirmed.operation.state).toBe("confirmed");
    expect(confirmed.operation.lastEventSequence).toBe(2);
    expect(confirmed.events.map((event) => event.eventType)).toEqual([
      "PACK_PROPOSED",
      "PACK_CONFIRMED",
    ]);
    expect(confirmed.approval).toEqual(approval);
    expect(confirmed.decision).toBeNull();
  });

  it.each([
    ["allow", "decided_allow"],
    ["deny", "decided_deny"],
    ["error", "decided_error"],
  ] as const)(
    "persists one PACK_DECIDED %s event and reconstructs %s after restart",
    async (decision, state) => {
      const adapter = new InspectableAdapter();
      const store = createStore(adapter);
      const destination = await destinationBinding(`decision-${decision}`);
      await store.registerDestinationBinding(destination);
      const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
      const approval = store.createCodingPackExportApproval({
        operationId: proposed.operation.operationId,
        proposalDigest: proposed.proposal.proposalDigest,
        approvedAt: CREATED_AT,
        expiresAt: APPROVAL_EXPIRES_AT,
      });
      const confirmed = await store.confirmCodingPackExportProposal(approval);
      const decided = await store.recordCodingPackExportDecision({
        operationId: confirmed.operation.operationId,
        decision: await decisionPayload(confirmed, decision),
      });

      expect(decided.operation.state).toBe(state);
      expect(decided.operation.lastEventSequence).toBe(3);
      expect(decided.events.map((event) => event.eventType)).toEqual([
        "PACK_PROPOSED",
        "PACK_CONFIRMED",
        "PACK_DECIDED",
      ]);
      expect(decided.decision?.decision).toBe(decision);
      const restarted = createStore(adapter);
      expect((await restarted.getCodingPackOperation(
        confirmed.operation.operationId,
      ))?.operation.state).toBe(state);
      await expect(store.recordCodingPackExportDecision({
        operationId: confirmed.operation.operationId,
        decision: await decisionPayload(confirmed, decision),
      })).rejects.toMatchObject({ code: "coding_pack_approval_mismatch" });
    },
  );

  it("leaves a confirmed operation unchanged when PACK_DECIDED persistence fails", async () => {
    const adapter = new InspectableAdapter();
    const store = createStore(adapter);
    const destination = await destinationBinding("decision-failure");
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    const approval = store.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    const confirmed = await store.confirmCodingPackExportProposal(approval);
    adapter.failDecision = true;

    await expect(store.recordCodingPackExportDecision({
      operationId: confirmed.operation.operationId,
      decision: await decisionPayload(confirmed, "allow"),
    })).rejects.toMatchObject({ code: "coding_pack_persistence_failed" });
    expect((await store.getCodingPackOperation(
      confirmed.operation.operationId,
    ))?.operation.state).toBe("confirmed");
  });

  it("rejects a PACK_DECIDED request digest not bound to the confirmed snapshot", async () => {
    const adapter = new InspectableAdapter();
    const store = createStore(adapter);
    const destination = await destinationBinding("wrong-request");
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    const approval = store.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    const confirmed = await store.confirmCodingPackExportProposal(approval);
    const decision = await decisionPayload(confirmed, "allow");

    await expect(store.recordCodingPackExportDecision({
      operationId: confirmed.operation.operationId,
      decision: {
        ...decision,
        requestDigest: digest("f"),
      },
    })).rejects.toMatchObject({ code: "coding_pack_approval_mismatch" });
    expect((await store.getCodingPackOperation(
      confirmed.operation.operationId,
    ))?.operation.state).toBe("confirmed");
  });

  it("rejects a PACK_DECIDED timestamp at the approval expiry boundary", async () => {
    const store = createStore(new InMemoryCodingPackStoreAdapter());
    const destination = await destinationBinding("decision-expiry");
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    const approval = store.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    const confirmed = await store.confirmCodingPackExportProposal(approval);

    await expect(store.recordCodingPackExportDecision({
      operationId: confirmed.operation.operationId,
      decision: {
        ...await decisionPayload(confirmed, "allow"),
        decidedAt: APPROVAL_EXPIRES_AT,
      },
    })).rejects.toMatchObject({ code: "coding_pack_approval_mismatch" });
  });

  it("persists terminal error evidence after expiry when evaluation began in-window", async () => {
    const adapter = new InMemoryCodingPackStoreAdapter();
    const store = createStore(adapter);
    const destination = await destinationBinding("late-error");
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    const approval = store.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    const confirmed = await store.confirmCodingPackExportProposal(approval);
    const persistenceRetryStore = createStore(adapter, 5 * 60 * 1000 + 1);

    const decided = await persistenceRetryStore.recordCodingPackExportDecision({
      operationId: confirmed.operation.operationId,
      decision: {
        ...await decisionPayload(confirmed, "error"),
        reasonCode: "bridge_timeout",
        evaluationStartedAt: "2026-07-30T00:04:59.999Z",
        decidedAt: "2026-07-30T00:05:00.001Z",
      },
    });

    expect(decided.operation.state).toBe("decided_error");
    expect(decided.decision?.evaluationStartedAt).toBe(
      "2026-07-30T00:04:59.999Z",
    );
  });

  it("derives the same proposal digest from the same exact inputs", async () => {
    const destination = await destinationBinding("same");
    const firstStore = createStore(new InMemoryCodingPackStoreAdapter());
    const secondStore = createStore(new InMemoryCodingPackStoreAdapter());
    await firstStore.registerDestinationBinding(destination);
    await secondStore.registerDestinationBinding(destination);

    const first = await firstStore.createCodingPackExportProposal(proposalInput(destination));
    const second = await secondStore.createCodingPackExportProposal(proposalInput(destination));
    expect(second.proposal.proposalDigest).toBe(first.proposal.proposalDigest);
  });

  it("changes proposal identity when preview or destination identity changes", async () => {
    const firstDestination = await destinationBinding("one");
    const secondDestination = await destinationBinding("two");
    const adapter = new InMemoryCodingPackStoreAdapter();
    const store = createStore(adapter);
    await store.registerDestinationBinding(firstDestination);
    await store.registerDestinationBinding(secondDestination);
    const first = await store.createCodingPackExportProposal(proposalInput(firstDestination));
    const second = await store.createCodingPackExportProposal({
      ...proposalInput(secondDestination),
      operationId: "operation-2",
    });

    expect(second.proposal.proposalDigest).not.toBe(first.proposal.proposalDigest);

    const thirdStore = createStore(new InMemoryCodingPackStoreAdapter());
    await thirdStore.registerDestinationBinding(firstDestination);
    const third = await thirdStore.createCodingPackExportProposal({
      ...proposalInput(firstDestination),
      preview: {
        ...proposalInput(firstDestination).preview,
        candidatePathsDigest: digest("9"),
      },
      previewConfirmation: {
        ...proposalInput(firstDestination).previewConfirmation,
        selectedPathsDigest: digest("9"),
      },
    });
    expect(third.proposal.proposalDigest).not.toBe(first.proposal.proposalDigest);
  });

  it("keeps absolute paths, source bytes, and preview confirmation out of the proposal", async () => {
    const destination = await createCodingPackDestinationBinding({
      privateIdentityMaterial: "tauri\0/Users/private/Exports",
      displayLabel: "Exports",
      createdAt: CREATED_AT,
      restartAvailable: true,
    });
    const store = createStore(new InMemoryCodingPackStoreAdapter());
    await store.registerDestinationBinding(destination);
    const snapshot = await store.createCodingPackExportProposal(proposalInput(destination));
    const serialized = JSON.stringify(snapshot.proposal);

    expect(serialized).not.toContain("/Users/private");
    expect(serialized).not.toContain("source bytes");
    expect(serialized).not.toContain("confirmedAt");
    expect(Object.keys(snapshot.proposal).sort()).toEqual([
      "candidatePathsDigest",
      "createdAt",
      "destinationBindingId",
      "destinationFingerprint",
      "expiresAt",
      "exportFormat",
      "manifestDigest",
      "operationId",
      "packId",
      "projectBindingId",
      "projectGeneration",
      "proposalDigest",
      "schemaVersion",
      "sourceFingerprint",
    ]);
    await expect(validateCodingPackExportProposal({
      ...snapshot.proposal,
      unknown: "rejected",
    })).rejects.toMatchObject({ code: "coding_pack_proposal_invalid" });
  });

  it("rejects preview confirmation alone, unknown fields, and mismatched preview evidence", async () => {
    const destination = await destinationBinding("privacy");
    const store = createStore(new InMemoryCodingPackStoreAdapter());
    await store.registerDestinationBinding(destination);
    const input = proposalInput(destination);

    await expect(store.createCodingPackExportProposal({
      ...input,
      preview: {
        ...input.preview,
        unknown: "not accepted",
      },
    } as CreateCodingPackExportProposalInput)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
    await expect(store.createCodingPackExportProposal({
      ...input,
      previewConfirmation: {
        ...input.previewConfirmation,
        manifestDigest: digest("0"),
      },
    })).rejects.toMatchObject({ code: "coding_pack_proposal_invalid" });
    const proposed = await store.createCodingPackExportProposal(input);
    await expect(store.confirmCodingPackExportProposal(
      input.previewConfirmation as unknown as ReturnType<
        CodingPackStore["createCodingPackExportApproval"]
      >,
    )).rejects.toBeInstanceOf(CodingPackStoreError);
    expect(proposed.operation.state).toBe("proposed");
  });

  it("rejects wrong operation, wrong digest, expired proposal, expired approval, and second confirmation", async () => {
    const destination = await destinationBinding("approval");
    const adapter = new InMemoryCodingPackStoreAdapter();
    const store = createStore(adapter);
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));

    const baseline = store.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    await expect(store.confirmCodingPackExportProposal({
      ...baseline,
      operationId: "another-operation",
    })).rejects.toMatchObject({ code: "coding_pack_approval_mismatch" });
    await expect(store.confirmCodingPackExportProposal({
      ...baseline,
      proposalDigest: digest("0"),
    })).rejects.toMatchObject({ code: "coding_pack_approval_mismatch" });
    await expect(store.confirmCodingPackExportProposal({
      ...baseline,
      expiresAt: "2026-07-29T23:59:59.000Z",
    })).rejects.toMatchObject({ code: "coding_pack_approval_mismatch" });

    await store.confirmCodingPackExportProposal(baseline);
    await expect(store.confirmCodingPackExportProposal(baseline)).rejects.toMatchObject({
      code: "coding_pack_approval_mismatch",
    });

    const expiredStore = createStore(new InMemoryCodingPackStoreAdapter(), 600_001);
    await expiredStore.registerDestinationBinding(destination);
    const expired = await expiredStore.createCodingPackExportProposal(proposalInput(destination));
    const approval = expiredStore.createCodingPackExportApproval({
      operationId: expired.operation.operationId,
      proposalDigest: expired.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    await expect(expiredStore.confirmCodingPackExportProposal(approval)).rejects.toMatchObject({
      code: "coding_pack_proposal_expired",
    });
  });

  it("fails closed when proposal or confirmation persistence fails", async () => {
    const destination = await destinationBinding("failure");
    const proposalAdapter = new InspectableAdapter();
    proposalAdapter.failCreate = true;
    const proposalStore = createStore(proposalAdapter);
    await proposalStore.registerDestinationBinding(destination);
    await expect(
      proposalStore.createCodingPackExportProposal(proposalInput(destination)),
    ).rejects.toMatchObject({ code: "coding_pack_persistence_failed" });
    expect(proposalAdapter.operations.size).toBe(0);

    const confirmationAdapter = new InspectableAdapter();
    const confirmationStore = createStore(confirmationAdapter);
    await confirmationStore.registerDestinationBinding(destination);
    const proposed = await confirmationStore.createCodingPackExportProposal(
      proposalInput(destination),
    );
    confirmationAdapter.failConfirmation = true;
    const approval = confirmationStore.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    await expect(
      confirmationStore.confirmCodingPackExportProposal(approval),
    ).rejects.toMatchObject({ code: "coding_pack_persistence_failed" });
    expect((await confirmationStore.getCodingPackOperation(
      proposed.operation.operationId,
    ))?.operation.state).toBe("proposed");
  });

  it("enforces exact 24-hour proposal and approval lifetime boundaries", async () => {
    const destination = await destinationBinding("lifetime");
    const acceptedStore = createStore(new InMemoryCodingPackStoreAdapter());
    await acceptedStore.registerDestinationBinding(destination);
    const proposed = await acceptedStore.createCodingPackExportProposal({
      ...proposalInput(destination),
      expiresAt: "2026-07-31T00:00:00.000Z",
    });
    expect(proposed.proposal.expiresAt).toBe("2026-07-31T00:00:00.000Z");
    expect(() => acceptedStore.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: "2026-07-31T00:00:00.000Z",
    })).not.toThrow();

    const rejectedStore = createStore(new InMemoryCodingPackStoreAdapter());
    await rejectedStore.registerDestinationBinding(destination);
    await expect(rejectedStore.createCodingPackExportProposal({
      ...proposalInput(destination),
      expiresAt: "2026-07-31T00:00:00.001Z",
    })).rejects.toMatchObject({ code: "coding_pack_proposal_invalid" });
    expect(() => rejectedStore.createCodingPackExportApproval({
      operationId: "operation-1",
      proposalDigest: digest("1"),
      approvedAt: CREATED_AT,
      expiresAt: "2026-07-31T00:00:00.001Z",
    })).toThrow(CodingPackStoreError);
  });

  it("keeps destination bindings immutable and preserves the first timestamp", async () => {
    const adapter = new InMemoryCodingPackStoreAdapter();
    const store = createStore(adapter);
    const destination = await destinationBinding("immutable");
    await store.registerDestinationBinding(destination);
    await store.registerDestinationBinding(destination);
    await expect(store.registerDestinationBinding({
      ...destination,
      destinationFingerprint: digest("9"),
    })).rejects.toMatchObject({ code: "coding_pack_destination_unavailable" });
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    expect(proposed.destination.createdAt).toBe(destination.createdAt);
    expect(proposed.destination.destinationFingerprint).toBe(destination.destinationFingerprint);
  });

  it("enforces well-formed UTF-8 byte bounds and exact identity formats", async () => {
    await expect(createCodingPackDestinationBinding({
      privateIdentityMaterial: "\ud800",
      displayLabel: "invalid",
      createdAt: CREATED_AT,
      restartAvailable: false,
    })).rejects.toMatchObject({ code: "coding_pack_destination_unavailable" });
    const destination = await destinationBinding("identity");
    const store = createStore(new InMemoryCodingPackStoreAdapter());
    await store.registerDestinationBinding(destination);
    const input = proposalInput(destination);
    await expect(store.createCodingPackExportProposal({
      ...input,
      operationId: "\ud800",
    })).rejects.toMatchObject({ code: "coding_pack_proposal_invalid" });
    await expect(store.createCodingPackExportProposal({
      ...input,
      preview: { ...input.preview, projectBindingId: "🌟".repeat(65) },
      previewConfirmation: {
        ...input.previewConfirmation,
        projectBindingId: "🌟".repeat(65),
      },
    })).rejects.toMatchObject({ code: "coding_pack_proposal_invalid" });
    await expect(store.createCodingPackExportProposal({
      ...input,
      preview: { ...input.preview, packId: digest("3") },
      previewConfirmation: { ...input.previewConfirmation, packId: digest("3") },
    })).rejects.toMatchObject({ code: "coding_pack_proposal_invalid" });
  });

  it("reads historical confirmed evidence after its approval has expired", async () => {
    const adapter = new InMemoryCodingPackStoreAdapter();
    const store = createStore(adapter);
    const destination = await destinationBinding("historical");
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    const approval = store.createCodingPackExportApproval({
      operationId: proposed.operation.operationId,
      proposalDigest: proposed.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    });
    await store.confirmCodingPackExportProposal(approval);
    const muchLater = createStore(adapter, 86_400_000);
    expect((await muchLater.getCodingPackOperation(
      proposed.operation.operationId,
    ))?.operation.state).toBe("confirmed");
  });
});

describe("CodingPackStore event integrity", () => {
  it("rejects missing, duplicate, out-of-order, and mutated event evidence", async () => {
    const destination = await destinationBinding("events");
    const adapter = new InspectableAdapter();
    const store = createStore(adapter);
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    const operationId = proposed.operation.operationId;

    adapter.events.set(operationId, []);
    await expect(store.getCodingPackOperation(operationId)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
    adapter.events.set(operationId, [await confirmedEventFixture(proposed.events[0])]);
    await expect(store.getCodingPackOperation(operationId)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
    adapter.events.set(operationId, [proposed.events[0], proposed.events[0]]);
    adapter.operations.set(operationId, {
      ...proposed.operation,
      state: "confirmed",
      lastEventSequence: 2,
    });
    await expect(store.getCodingPackOperation(operationId)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
    adapter.events.set(operationId, [{
      ...proposed.events[0],
      eventSequence: 2,
    }]);
    adapter.operations.set(operationId, proposed.operation);
    await expect(store.getCodingPackOperation(operationId)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
    adapter.events.set(operationId, [{
      ...proposed.events[0],
      payload: {
        proposal: {
          ...proposed.proposal,
          packId: packId("0"),
        },
      },
    }]);
    await expect(store.getCodingPackOperation(operationId)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
  });

  it("rejects corrupt operation and destination rows", async () => {
    const destination = await destinationBinding("corrupt");
    const adapter = new InspectableAdapter();
    const store = createStore(adapter);
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));

    adapter.operations.set(proposed.operation.operationId, {
      ...proposed.operation,
      proposalDigest: digest("0"),
    });
    await expect(store.getCodingPackOperation(proposed.operation.operationId)).rejects.toBeInstanceOf(
      CodingPackStoreError,
    );
    adapter.operations.set(proposed.operation.operationId, proposed.operation);
    adapter.destinations.set(destination.destinationBindingId, {
      ...destination,
      destinationFingerprint: digest("0"),
    });
    await expect(store.getCodingPackOperation(proposed.operation.operationId)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
  });

  it("rejects event chronology that does not match payload timestamps", async () => {
    const destination = await destinationBinding("chronology");
    const adapter = new InspectableAdapter();
    const store = createStore(adapter);
    await store.registerDestinationBinding(destination);
    const proposed = await store.createCodingPackExportProposal(proposalInput(destination));
    adapter.events.set(proposed.operation.operationId, [{
      ...proposed.events[0],
      recordedAt: "2026-07-30T00:00:00.001Z",
    }]);
    await expect(store.getCodingPackOperation(proposed.operation.operationId)).rejects.toMatchObject({
      code: "coding_pack_proposal_invalid",
    });
  });
});

function canonicalVectorProposal() {
  return {
    schemaVersion: "kerniq.coding-pack.export-proposal.v1",
    operationId: "operation-vector-🌟",
    projectBindingId: "project-vector",
    projectGeneration: 7,
    candidatePathsDigest: digest("1"),
    sourceFingerprint: digest("2"),
    packId: packId("3"),
    manifestDigest: digest("4"),
    destinationBindingId: `destination-${"a".repeat(24)}`,
    destinationFingerprint: digest("5"),
    exportFormat: "kerniq-coding-pack-bundle-v1",
    createdAt: CREATED_AT,
    expiresAt: PROPOSAL_EXPIRES_AT,
  } as const;
}

function createStore(adapter: CodingPackStoreAdapter, elapsedMs = 0): CodingPackStore {
  let nextId = 0;
  return new CodingPackStore(adapter, {
    now: () => new Date(Date.parse(CREATED_AT) + elapsedMs),
    createId: () => `id-${elapsedMs}-${++nextId}`,
    proposalLifetimeMs: 10 * 60 * 1000,
    approvalLifetimeMs: 5 * 60 * 1000,
  });
}

async function destinationBinding(seed: string): Promise<CodingPackDestinationBinding> {
  return createCodingPackDestinationBinding({
    privateIdentityMaterial: `browser\0${seed}`,
    displayLabel: `${seed} destination`,
    createdAt: CREATED_AT,
    restartAvailable: false,
  });
}

function proposalInput(
  destination: CodingPackDestinationBinding,
): CreateCodingPackExportProposalInput {
  return {
    operationId: "operation-1",
    createdAt: CREATED_AT,
    expiresAt: PROPOSAL_EXPIRES_AT,
    destination,
    preview: {
      projectBindingId: "project-1",
      projectGeneration: 1,
      candidatePathsDigest: digest("1"),
      sourceFingerprint: digest("2"),
      packId: packId("3"),
      manifestDigest: digest("4"),
    },
    previewConfirmation: {
      projectBindingId: "project-1",
      projectGeneration: 1,
      selectedPathsDigest: digest("1"),
      sourceFingerprint: digest("2"),
      packId: packId("3"),
      manifestDigest: digest("4"),
      confirmedAt: CREATED_AT,
    },
  };
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function packId(character: string): string {
  return `pack-${character.repeat(64)}`;
}

async function decisionPayload(
  snapshot: CodingPackOperationSnapshot,
  decision: "allow" | "deny" | "error",
) {
  if (!snapshot || !snapshot.approval || !snapshot.events[1]) {
    throw new Error("Expected a confirmed Coding Pack operation.");
  }
  return {
    decisionId: `decision-${decision}`,
    requestDigest: await createCodingPackAgentFuseRequestDigest(
      createCodingPackAgentFuseExportRequestIdentity(
        snapshot.proposal,
        snapshot.events[1].payloadDigest,
      ),
    ),
    proposalDigest: snapshot.proposal.proposalDigest,
    approvalEvidenceDigest: snapshot.events[1].payloadDigest,
    agentFuseSourceCommit:
      "ec4b5842339dccfba0db62df7541920759203bc9" as const,
    agentFusePackageVersion: "3.6.0" as const,
    bridgeProtocol: "kerniq.agentfuse.bridge.v1" as const,
    policyId: "kerniq-coding-pack-export-v1" as const,
    policyDigest:
      "sha256:752a8bf1f251e5c05f07ddd8d820af3c5554fb37e3a47fbcf41933f614167d07",
    decision,
    reasonCode: decision === "allow" ? "policy_allowed" : `policy_${decision}`,
    evaluationStartedAt: CREATED_AT,
    decidedAt: CREATED_AT,
  };
}

async function confirmedEventFixture(proposed: CodingPackEvent): Promise<CodingPackEvent> {
  if (!("proposal" in proposed.payload)) throw new Error("Expected proposed fixture.");
  const payload = {
    approval: {
      schemaVersion: "kerniq.coding-pack.export-approval.v1" as const,
      operationId: proposed.operationId,
      proposalDigest: proposed.payload.proposal.proposalDigest,
      approvedAt: CREATED_AT,
      expiresAt: APPROVAL_EXPIRES_AT,
    },
  };
  return {
    eventId: "confirmed-without-proposal",
    operationId: proposed.operationId,
    eventSequence: 1,
    eventType: "PACK_CONFIRMED",
    eventVersion: 1,
    recordedAt: CREATED_AT,
    payloadDigest: await createEventPayloadDigest(payload),
    payload,
  };
}

class InspectableAdapter implements CodingPackStoreAdapter {
  readonly operations = new Map<string, CodingPackOperationRecord>();
  readonly events = new Map<string, CodingPackEvent[]>();
  readonly destinations = new Map<string, CodingPackDestinationBinding>();
  failCreate = false;
  failConfirmation = false;
  failDecision = false;

  async registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void> {
    this.destinations.set(binding.destinationBindingId, structuredClone(binding));
  }

  async createOperation(
    operation: CodingPackOperationRecord,
    proposedEvent: CodingPackEvent,
  ): Promise<void> {
    if (this.failCreate) throw new Error("private SQLite detail");
    this.operations.set(operation.operationId, structuredClone(operation));
    this.events.set(operation.operationId, [structuredClone(proposedEvent)]);
  }

  async appendConfirmation(
    operation: CodingPackOperationRecord,
    confirmedEvent: CodingPackEvent,
  ): Promise<void> {
    if (this.failConfirmation) throw new Error("private SQLite detail");
    this.operations.set(operation.operationId, structuredClone(operation));
    this.events.get(operation.operationId)?.push(structuredClone(confirmedEvent));
  }

  async appendDecision(
    operation: CodingPackOperationRecord,
    decidedEvent: CodingPackEvent,
  ): Promise<void> {
    if (this.failDecision) throw new Error("private SQLite detail");
    this.operations.set(operation.operationId, structuredClone(operation));
    this.events.get(operation.operationId)?.push(structuredClone(decidedEvent));
  }

  async getOperationSnapshotData(operationId: string) {
    const operation = this.operations.get(operationId);
    if (!operation) return null;
    const events = this.events.get(operationId);
    const destination = this.destinations.get(operation.destinationBindingId);
    if (!events || !destination) throw new Error("corrupt snapshot");
    return structuredClone({ operation, events, destination });
  }

  async listOperationIds(): Promise<readonly string[]> {
    return [...this.operations.keys()];
  }
}
