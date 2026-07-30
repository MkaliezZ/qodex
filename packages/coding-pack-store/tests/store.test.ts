import { describe, expect, it } from "vitest";
import {
  CodingPackStore,
  CodingPackStoreError,
  InMemoryCodingPackStoreAdapter,
  createCodingPackDestinationBinding,
  createEventPayloadDigest,
  validateCodingPackExportProposal,
  type CodingPackDestinationBinding,
  type CodingPackEvent,
  type CodingPackOperationRecord,
  type CodingPackStoreAdapter,
  type CreateCodingPackExportProposalInput,
} from "../src/index.js";

const CREATED_AT = "2026-07-30T00:00:00.000Z";
const PROPOSAL_EXPIRES_AT = "2026-07-30T00:10:00.000Z";
const APPROVAL_EXPIRES_AT = "2026-07-30T00:05:00.000Z";

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
          packId: digest("0"),
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
});

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
      packId: digest("3"),
      manifestDigest: digest("4"),
    },
    previewConfirmation: {
      projectBindingId: "project-1",
      projectGeneration: 1,
      selectedPathsDigest: digest("1"),
      sourceFingerprint: digest("2"),
      packId: digest("3"),
      manifestDigest: digest("4"),
      confirmedAt: CREATED_AT,
    },
  };
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
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

  async getOperation(operationId: string): Promise<CodingPackOperationRecord | null> {
    return structuredClone(this.operations.get(operationId) ?? null);
  }

  async listOperations(): Promise<CodingPackOperationRecord[]> {
    return structuredClone([...this.operations.values()]);
  }

  async listEvents(operationId: string): Promise<CodingPackEvent[]> {
    return structuredClone(this.events.get(operationId) ?? []);
  }

  async getDestinationBinding(
    destinationBindingId: string,
  ): Promise<CodingPackDestinationBinding | null> {
    return structuredClone(this.destinations.get(destinationBindingId) ?? null);
  }
}
