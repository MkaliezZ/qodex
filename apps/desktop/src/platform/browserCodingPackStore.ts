import type {
  CodingPackDestinationBinding,
  CodingPackEvent,
  CodingPackOperationRecord,
  CodingPackStoreAdapter,
  CodingPackStoredSnapshotData,
} from "@qodex/coding-pack-store";

const STORAGE_KEY = "kerniq.coding-pack.store.v1";

interface BrowserCodingPackState {
  readonly schemaVersion: "kerniq.coding-pack.store.v2";
  readonly operations: Record<string, CodingPackOperationRecord>;
  readonly events: Record<string, CodingPackEvent[]>;
  readonly destinations: Record<string, CodingPackDestinationBinding>;
}

export class BrowserCodingPackStoreAdapter implements CodingPackStoreAdapter {
  constructor(private readonly storage: Storage = window.localStorage) {}

  async registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void> {
    const state = this.read();
    const existing = state.destinations[binding.destinationBindingId];
    if (existing) {
      if (!sameDestination(existing, binding)) {
        throw new Error("coding_pack_destination_unavailable");
      }
      return;
    }
    state.destinations[binding.destinationBindingId] = clone(binding);
    this.write(state);
  }

  async createOperation(
    operation: CodingPackOperationRecord,
    proposedEvent: CodingPackEvent,
  ): Promise<void> {
    const state = this.read();
    if (
      state.operations[operation.operationId]
      || !state.destinations[operation.destinationBindingId]
    ) {
      throw new Error("coding_pack_persistence_failed");
    }
    state.operations[operation.operationId] = clone(operation);
    state.events[operation.operationId] = [clone(proposedEvent)];
    this.write(state);
  }

  async appendConfirmation(
    operation: CodingPackOperationRecord,
    confirmedEvent: CodingPackEvent,
  ): Promise<void> {
    const state = this.read();
    const current = state.operations[operation.operationId];
    const events = state.events[operation.operationId];
    if (
      !current
      || !events
      || current.state !== "proposed"
      || current.lastEventSequence !== 1
      || confirmedEvent.eventSequence !== 2
      || events.some((event) => (
        event.eventId === confirmedEvent.eventId
        || event.eventSequence === confirmedEvent.eventSequence
      ))
    ) {
      throw new Error("coding_pack_persistence_failed");
    }
    state.operations[operation.operationId] = clone(operation);
    state.events[operation.operationId] = [...events, clone(confirmedEvent)];
    this.write(state);
  }

  async appendDecision(
    operation: CodingPackOperationRecord,
    decidedEvent: CodingPackEvent,
  ): Promise<void> {
    const state = this.read();
    const current = state.operations[operation.operationId];
    const events = state.events[operation.operationId];
    if (
      !current
      || !events
      || current.state !== "confirmed"
      || current.lastEventSequence !== 2
      || operation.lastEventSequence !== 3
      || decidedEvent.eventSequence !== 3
      || events.some((event) => (
        event.eventId === decidedEvent.eventId
        || event.eventSequence === decidedEvent.eventSequence
      ))
    ) {
      throw new Error("coding_pack_persistence_failed");
    }
    state.operations[operation.operationId] = clone(operation);
    state.events[operation.operationId] = [...events, clone(decidedEvent)];
    this.write(state);
  }

  async getOperationSnapshotData(
    operationId: string,
  ): Promise<CodingPackStoredSnapshotData | null> {
    const state = this.read();
    const operation = state.operations[operationId];
    if (!operation) return null;
    const events = state.events[operationId];
    const destination = state.destinations[operation.destinationBindingId];
    if (!events || !destination) {
      throw new Error("coding_pack_store_unavailable");
    }
    return clone({ operation, events, destination });
  }

  async listOperationIds(): Promise<readonly string[]> {
    return clone(Object.keys(this.read().operations));
  }

  private read(): BrowserCodingPackState {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as {
      schemaVersion?: unknown;
      operations?: unknown;
      events?: unknown;
      destinations?: unknown;
    };
    if (
      !plainRecord(parsed.operations)
      || !plainRecord(parsed.events)
      || !plainRecord(parsed.destinations)
    ) {
      throw new Error("coding_pack_store_unavailable");
    }
    if (parsed.schemaVersion === "kerniq.coding-pack.store.v1") {
      const migrated: BrowserCodingPackState = {
        schemaVersion: "kerniq.coding-pack.store.v2",
        operations: clone(parsed.operations) as Record<string, CodingPackOperationRecord>,
        events: clone(parsed.events) as Record<string, CodingPackEvent[]>,
        destinations: clone(parsed.destinations) as Record<
          string,
          CodingPackDestinationBinding
        >,
      };
      this.write(migrated);
      return migrated;
    }
    if (parsed.schemaVersion !== "kerniq.coding-pack.store.v2") {
      throw new Error("coding_pack_store_unavailable");
    }
    return parsed as BrowserCodingPackState;
  }

  private write(state: BrowserCodingPackState): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function emptyState(): BrowserCodingPackState {
  return {
    schemaVersion: "kerniq.coding-pack.store.v2",
    operations: {},
    events: {},
    destinations: {},
  };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameDestination(
  left: CodingPackDestinationBinding,
  right: CodingPackDestinationBinding,
): boolean {
  return left.destinationBindingId === right.destinationBindingId
    && left.destinationFingerprint === right.destinationFingerprint
    && left.displayLabel === right.displayLabel
    && left.createdAt === right.createdAt
    && left.restartAvailable === right.restartAvailable;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
