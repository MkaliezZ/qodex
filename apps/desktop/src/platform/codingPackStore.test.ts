import { describe, expect, it, vi } from "vitest";
import {
  CodingPackStore,
  InMemoryCodingPackStoreAdapter,
  createCodingPackDestinationBinding,
  type CodingPackDestinationBinding,
} from "@qodex/coding-pack-store";
import { BrowserCodingPackStoreAdapter } from "./browserCodingPackStore";
import {
  type CodingPackDestinationInvoker,
  chooseCodingPackDestination,
  hasCodingPackDestinationCapability,
} from "./codingPackDestination";
import {
  TauriCodingPackStoreAdapter,
  type TauriCodingPackInvoker,
} from "./tauriCodingPackStore";

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
    await adapter.createOperation(operation(binding), proposedEvent());
    await adapter.appendConfirmation(
      { ...operation(binding), state: "confirmed", lastEventSequence: 2 },
      confirmedEvent(),
    );

    expect(invokeCommand.mock.calls.map(([command]) => command)).toEqual([
      "coding_pack_destination_get",
      "coding_pack_store_create",
      "coding_pack_store_confirm",
    ]);
    expect(JSON.stringify(invokeCommand.mock.calls)).not.toContain("/Users/private");
  });

  it("keeps browser records restart-readable without serializing directory handles", async () => {
    const storage = new MemoryStorage();
    const firstAdapter = new BrowserCodingPackStoreAdapter(storage);
    const binding = await destination("browser", false);
    await firstAdapter.registerDestinationBinding(binding);
    await firstAdapter.createOperation(operation(binding), proposedEvent());

    const restarted = new BrowserCodingPackStoreAdapter(storage);
    expect(await restarted.getOperation("operation-1")).toEqual(operation(binding));
    expect(await restarted.listOperations()).toEqual([operation(binding)]);
    expect(await restarted.listEvents("operation-1")).toHaveLength(1);
    expect(storage.value()).not.toContain("FileSystemDirectoryHandle");
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
    packId: digest("3"),
    manifestDigest: digest("4"),
    destinationBindingId: binding.destinationBindingId,
    proposalDigest: digest("5"),
    createdAt: CREATED_AT,
    expiresAt: "2026-07-30T00:10:00.000Z",
    lastEventSequence: 1,
  };
}

function proposedEvent() {
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
        packId: digest("3"),
        manifestDigest: digest("4"),
        destinationBindingId: "destination-1",
        destinationFingerprint: digest("7"),
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

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
  value() { return [...this.values.values()].join(""); }
}
