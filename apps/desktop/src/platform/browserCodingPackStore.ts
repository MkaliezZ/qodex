import type {
  CodingPackDestinationBinding,
  CodingPackEvent,
  CodingPackOperationRecord,
  CodingPackStoreAdapter,
} from "@qodex/coding-pack-store";

const STORAGE_KEY = "kerniq.coding-pack.store.v1";

interface BrowserCodingPackState {
  readonly schemaVersion: "kerniq.coding-pack.store.v1";
  readonly operations: Record<string, CodingPackOperationRecord>;
  readonly events: Record<string, CodingPackEvent[]>;
  readonly destinations: Record<string, CodingPackDestinationBinding>;
}

export class BrowserCodingPackStoreAdapter implements CodingPackStoreAdapter {
  constructor(private readonly storage: Storage = window.localStorage) {}

  async registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void> {
    const state = this.read();
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

  async getOperation(operationId: string): Promise<CodingPackOperationRecord | null> {
    return clone(this.read().operations[operationId] ?? null);
  }

  async listOperations(): Promise<CodingPackOperationRecord[]> {
    return clone(Object.values(this.read().operations));
  }

  async listEvents(operationId: string): Promise<CodingPackEvent[]> {
    return clone(this.read().events[operationId] ?? []);
  }

  async getDestinationBinding(
    destinationBindingId: string,
  ): Promise<CodingPackDestinationBinding | null> {
    return clone(this.read().destinations[destinationBindingId] ?? null);
  }

  private read(): BrowserCodingPackState {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<BrowserCodingPackState>;
    if (
      parsed.schemaVersion !== "kerniq.coding-pack.store.v1"
      || !plainRecord(parsed.operations)
      || !plainRecord(parsed.events)
      || !plainRecord(parsed.destinations)
    ) {
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
    schemaVersion: "kerniq.coding-pack.store.v1",
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

function clone<T>(value: T): T {
  return structuredClone(value);
}
