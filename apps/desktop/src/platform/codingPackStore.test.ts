import { describe, expect, it, vi } from "vitest";
import {
  CodingPackStore,
  InMemoryCodingPackStoreAdapter,
  createCodingPackDestinationBinding,
  type CodingPackDestinationBinding,
} from "@qodex/coding-pack-store";
import {
  confirmCodingPackPreview,
  createSelectedFileCodingPackPreview,
} from "../codingPack/preview";
import { BrowserCodingPackStoreAdapter } from "./browserCodingPackStore";
import {
  type CodingPackDestinationInvoker,
  chooseCodingPackDestination,
  createCodingPackDestinationCapabilityVerifier,
  hasCodingPackDestinationCapability,
} from "./codingPackDestination";
import {
  TauriCodingPackStoreAdapter,
  type TauriCodingPackInvoker,
} from "./tauriCodingPackStore";
import { createVerifiedCodingPackExportProposal } from "./codingPackStore";

const CREATED_AT = "2026-07-30T00:00:00.000Z";

describe("Desktop Coding Pack store adapters", () => {
  it("maps durable Tauri operations to dedicated commands", async () => {
    const binding = await destination("tauri", true);
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === "coding_pack_destination_get") return binding;
      if (command === "coding_pack_store_get") return null;
      if (command === "coding_pack_store_events") return [];
      return undefined;
    });
    const adapter = new TauriCodingPackStoreAdapter(
      invokeCommand as unknown as TauriCodingPackInvoker,
    );
    await adapter.registerDestinationBinding(binding);
    await adapter.createOperation(operation(binding), proposedEvent(binding));
    await adapter.appendConfirmation(
      { ...operation(binding), state: "confirmed", lastEventSequence: 2 },
      confirmedEvent(),
    );
    await adapter.appendDecision(
      { ...operation(binding), state: "decided_allow", lastEventSequence: 3 },
      decidedEvent(),
    );

    expect(invokeCommand.mock.calls.map(([command]) => command)).toEqual([
      "coding_pack_destination_get",
      "coding_pack_store_create",
      "coding_pack_store_confirm",
      "coding_pack_store_decide",
    ]);
    expect(JSON.stringify(invokeCommand.mock.calls)).not.toContain("/Users/private");
  });

  it("keeps browser records restart-readable without serializing directory handles", async () => {
    const storage = new MemoryStorage();
    const firstAdapter = new BrowserCodingPackStoreAdapter(storage);
    const binding = await destination("browser", false);
    await firstAdapter.registerDestinationBinding(binding);
    await firstAdapter.createOperation(operation(binding), proposedEvent(binding));

    const restarted = new BrowserCodingPackStoreAdapter(storage);
    expect(await restarted.getOperationSnapshotData("operation-1")).toEqual({
      operation: operation(binding),
      events: [proposedEvent(binding)],
      destination: binding,
    });
    expect(await restarted.listOperationIds()).toEqual(["operation-1"]);
    expect(storage.readCount).toBe(4);
    expect(storage.value()).not.toContain("FileSystemDirectoryHandle");
  });

  it("migrates browser v1 records to v2 without deciding or exporting", async () => {
    const storage = new MemoryStorage();
    const adapter = new BrowserCodingPackStoreAdapter(storage);
    const binding = await destination("browser-migration", false);
    await adapter.registerDestinationBinding(binding);
    await adapter.createOperation(operation(binding), proposedEvent(binding));
    storage.replaceValue(
      storage.value().replace(
        "kerniq.coding-pack.store.v2",
        "kerniq.coding-pack.store.v1",
      ),
    );

    const migrated = new BrowserCodingPackStoreAdapter(storage);
    const snapshot = await migrated.getOperationSnapshotData("operation-1");
    expect(snapshot?.operation.state).toBe("proposed");
    expect(snapshot?.events).toHaveLength(1);
    expect(storage.value()).toContain("kerniq.coding-pack.store.v2");
    expect(storage.value()).not.toContain("PACK_DECIDED");
  });

  it("rejects browser rebinding and never mixes a concurrent confirmation into a snapshot", async () => {
    const storage = new MemoryStorage();
    const adapter = new BrowserCodingPackStoreAdapter(storage);
    const binding = await destination("immutable-browser", false);
    await adapter.registerDestinationBinding(binding);
    await adapter.registerDestinationBinding(binding);
    await expect(adapter.registerDestinationBinding({
      ...binding,
      destinationFingerprint: digest("9"),
    })).rejects.toThrow("coding_pack_destination_unavailable");
    await adapter.createOperation(operation(binding), proposedEvent(binding));
    const proposedState = storage.value();
    await adapter.appendConfirmation(
      { ...operation(binding), state: "confirmed", lastEventSequence: 2 },
      confirmedEvent(),
    );
    const confirmedState = storage.value();
    storage.replaceValue(proposedState);
    storage.afterNextRead = () => storage.replaceValue(confirmedState);
    const readsBefore = storage.readCount;
    const snapshot = await adapter.getOperationSnapshotData("operation-1");
    expect(storage.readCount - readsBefore).toBe(1);
    expect(snapshot?.operation.state).toBe("proposed");
    expect(snapshot?.events).toHaveLength(1);
    expect(snapshot?.destination).toEqual(binding);
    expect(storage.value()).toContain("\"state\":\"confirmed\"");
  });

  it("marks browser destination authority as session-only and performs no writes", async () => {
    const handle = { kind: "directory", name: "Safe exports" } as FileSystemDirectoryHandle;
    const picker = vi.fn(async () => handle);
    const store = new CodingPackStore(new InMemoryCodingPackStoreAdapter());
    const binding = await chooseCodingPackDestination(store, {
      isTauriRuntime: () => false,
      browserHost: { showDirectoryPicker: picker },
      createId: () => "capability-1",
      now: () => new Date(CREATED_AT),
    });

    expect(binding?.displayLabel).toBe("Safe exports");
    expect(binding?.restartAvailable).toBe(false);
    expect(binding && hasCodingPackDestinationCapability(binding)).toBe(true);
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite" });
    expect("createWritable" in handle).toBe(false);
    await expect(createCodingPackDestinationCapabilityVerifier({
      isTauriRuntime: () => false,
    }).verifyDestinationCapability(binding!)).resolves.toBe(true);
    await expect(createCodingPackDestinationCapabilityVerifier({
      isTauriRuntime: () => false,
    }).verifyDestinationCapability({
      ...binding!,
      destinationBindingId: `destination-${"f".repeat(24)}`,
    })).resolves.toBe(false);
  });

  it("accepts only the public Tauri binding returned by the native picker", async () => {
    const binding = await destination("native", true);
    const store = new CodingPackStore(new InMemoryCodingPackStoreAdapter());
    const invokeCommand = vi.fn(async () => binding);
    const selected = await chooseCodingPackDestination(store, {
      isTauriRuntime: () => true,
      invokeCommand: invokeCommand as unknown as CodingPackDestinationInvoker,
      now: () => new Date(CREATED_AT),
    });

    expect(selected).toEqual(binding);
    expect(invokeCommand).toHaveBeenCalledWith(
      "coding_pack_destination_pick_and_bind",
      { request: { createdAt: CREATED_AT } },
    );
    expect(JSON.stringify(selected)).not.toContain("/");
  });

  it("uses only the read-only native destination verifier command", async () => {
    const binding = await destination("native-verifier", true);
    const invokeCommand = vi.fn(async (command: string) => (
      command === "coding_pack_destination_verify"
    ));
    const verifier = createCodingPackDestinationCapabilityVerifier({
      isTauriRuntime: () => true,
      invokeCommand: invokeCommand as unknown as CodingPackDestinationInvoker,
    });

    await expect(verifier.verifyDestinationCapability(binding)).resolves.toBe(true);
    expect(invokeCommand).toHaveBeenCalledWith("coding_pack_destination_verify", {
      destinationBindingId: binding.destinationBindingId,
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);
  });

  it("does not call the store when product-level preview confirmation is tampered", async () => {
    const preview = await createSelectedFileCodingPackPreview({
      projectBindingId: "project-1",
      projectGeneration: 1,
      selectedPaths: ["src/index.ts"],
      purpose: "review_handoff",
      source: {
        readFileBytes: async () => new TextEncoder().encode("export const value = 1;\n"),
      },
      createdAt: CREATED_AT,
    });
    const confirmation = await confirmCodingPackPreview(preview, {
      projectBindingId: preview.projectBindingId,
      projectGeneration: preview.projectGeneration,
      selectedPathsDigest: preview.selectedPathsDigest,
      purpose: preview.selection.purpose,
      selectionRulesVersion: preview.selection.selectionRulesVersion,
    }, {
      confirmationId: "confirmation-1",
      confirmedAt: CREATED_AT,
    });
    const binding = await destination("verified-product", false);
    const createProposal = vi.fn();
    const store = {
      createCodingPackExportProposal: createProposal,
    } as unknown as CodingPackStore;

    await expect(createVerifiedCodingPackExportProposal({
      store,
      preview,
      confirmation: {
        ...confirmation,
        manifestDigest: digest("9"),
      },
      proposalInput: {
        preview: {
          projectBindingId: preview.projectBindingId,
          projectGeneration: preview.projectGeneration,
          candidatePathsDigest: preview.selection.candidatePathsDigest,
          sourceFingerprint: preview.selection.sourceFingerprint,
          packId: preview.selection.packId,
          manifestDigest: preview.manifest.manifestDigest,
        },
        previewConfirmation: confirmation,
        destination: binding,
      },
    })).rejects.toMatchObject({ code: "coding_pack_confirmation_mismatch" });
    expect(createProposal).not.toHaveBeenCalled();
  });
});

async function destination(
  seed: string,
  restartAvailable: boolean,
): Promise<CodingPackDestinationBinding> {
  return createCodingPackDestinationBinding({
    privateIdentityMaterial: seed,
    displayLabel: `${seed} destination`,
    createdAt: CREATED_AT,
    restartAvailable,
  });
}

function operation(binding: CodingPackDestinationBinding) {
  return {
    operationId: "operation-1",
    state: "proposed" as const,
    projectBindingId: "project-1",
    projectGeneration: 1,
    candidatePathsDigest: digest("1"),
    sourceFingerprint: digest("2"),
    packId: packId("3"),
    manifestDigest: digest("4"),
    destinationBindingId: binding.destinationBindingId,
    proposalDigest: digest("5"),
    createdAt: CREATED_AT,
    expiresAt: "2026-07-30T00:10:00.000Z",
    lastEventSequence: 1,
  };
}

function proposedEvent(binding: CodingPackDestinationBinding) {
  return {
    eventId: "event-1",
    operationId: "operation-1",
    eventSequence: 1,
    eventType: "PACK_PROPOSED" as const,
    eventVersion: 1 as const,
    recordedAt: CREATED_AT,
    payloadDigest: digest("6"),
    payload: {
      proposal: {
        schemaVersion: "kerniq.coding-pack.export-proposal.v1" as const,
        operationId: "operation-1",
        projectBindingId: "project-1",
        projectGeneration: 1,
        candidatePathsDigest: digest("1"),
        sourceFingerprint: digest("2"),
        packId: packId("3"),
        manifestDigest: digest("4"),
        destinationBindingId: binding.destinationBindingId,
        destinationFingerprint: binding.destinationFingerprint,
        exportFormat: "kerniq-coding-pack-bundle-v1" as const,
        createdAt: CREATED_AT,
        expiresAt: "2026-07-30T00:10:00.000Z",
        proposalDigest: digest("5"),
      },
    },
  };
}

function confirmedEvent() {
  return {
    eventId: "event-2",
    operationId: "operation-1",
    eventSequence: 2,
    eventType: "PACK_CONFIRMED" as const,
    eventVersion: 1 as const,
    recordedAt: CREATED_AT,
    payloadDigest: digest("8"),
    payload: {
      approval: {
        schemaVersion: "kerniq.coding-pack.export-approval.v1" as const,
        operationId: "operation-1",
        proposalDigest: digest("5"),
        approvedAt: CREATED_AT,
        expiresAt: "2026-07-30T00:05:00.000Z",
      },
    },
  };
}

function decidedEvent() {
  return {
    eventId: "event-3",
    operationId: "operation-1",
    eventSequence: 3,
    eventType: "PACK_DECIDED" as const,
    eventVersion: 1 as const,
    recordedAt: CREATED_AT,
    payloadDigest: digest("9"),
    payload: {
      decisionId: "decision-1",
      requestDigest: digest("a"),
      proposalDigest: digest("5"),
      approvalEvidenceDigest: digest("8"),
      agentFuseSourceCommit:
        "ec4b5842339dccfba0db62df7541920759203bc9" as const,
      agentFusePackageVersion: "3.6.0" as const,
      bridgeProtocol: "kerniq.agentfuse.bridge.v1" as const,
      policyId: "kerniq-coding-pack-export-v1" as const,
      policyDigest:
        "sha256:752a8bf1f251e5c05f07ddd8d820af3c5554fb37e3a47fbcf41933f614167d07",
      decision: "allow" as const,
      reasonCode: "policy_allowed",
      evaluationStartedAt: CREATED_AT,
      decidedAt: CREATED_AT,
    },
  };
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function packId(character: string): string {
  return `pack-${character.repeat(64)}`;
}
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  readCount = 0;
  afterNextRead: (() => void) | null = null;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) {
    this.readCount += 1;
    const value = this.values.get(key) ?? null;
    const afterRead = this.afterNextRead;
    this.afterNextRead = null;
    afterRead?.();
    return value;
  }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
  value() { return [...this.values.values()].join(""); }
  replaceValue(value: string) {
    this.values.set("kerniq.coding-pack.store.v1", value);
  }
}
