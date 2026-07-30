import { CodingPackStoreError } from "./errors.js";
import type {
  CodingPackDestinationBinding,
  CodingPackEvent,
  CodingPackOperationRecord,
  CodingPackStoreAdapter,
  CodingPackStoredSnapshotData,
} from "./types.js";

export class InMemoryCodingPackStoreAdapter implements CodingPackStoreAdapter {
  private readonly operations = new Map<string, CodingPackOperationRecord>();
  private readonly events = new Map<string, CodingPackEvent[]>();
  private readonly destinations = new Map<string, CodingPackDestinationBinding>();

  async registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void> {
    const existing = this.destinations.get(binding.destinationBindingId);
    if (existing) {
      if (!sameDestination(existing, binding)) {
        throw new CodingPackStoreError("coding_pack_destination_unavailable");
      }
      return;
    }
    this.destinations.set(binding.destinationBindingId, clone(binding));
  }

  async createOperation(
    operation: CodingPackOperationRecord,
    proposedEvent: CodingPackEvent,
  ): Promise<void> {
    if (this.operations.has(operation.operationId)) {
      throw new CodingPackStoreError("coding_pack_persistence_failed");
    }
    const destination = this.destinations.get(operation.destinationBindingId);
    if (!destination) {
      throw new CodingPackStoreError("coding_pack_destination_unavailable");
    }
    this.operations.set(operation.operationId, clone(operation));
    this.events.set(operation.operationId, [clone(proposedEvent)]);
  }

  async appendConfirmation(
    operation: CodingPackOperationRecord,
    confirmedEvent: CodingPackEvent,
  ): Promise<void> {
    const current = this.operations.get(operation.operationId);
    const events = this.events.get(operation.operationId);
    if (
      !current
      || !events
      || current.state !== "proposed"
      || current.lastEventSequence + 1 !== confirmedEvent.eventSequence
    ) {
      throw new CodingPackStoreError("coding_pack_persistence_failed");
    }
    if (
      events.some((event) => (
        event.eventId === confirmedEvent.eventId
        || event.eventSequence === confirmedEvent.eventSequence
      ))
    ) {
      throw new CodingPackStoreError("coding_pack_persistence_failed");
    }
    events.push(clone(confirmedEvent));
    this.operations.set(operation.operationId, clone(operation));
  }

  async getOperationSnapshotData(
    operationId: string,
  ): Promise<CodingPackStoredSnapshotData | null> {
    const operation = this.operations.get(operationId);
    if (!operation) return null;
    const events = this.events.get(operationId);
    const destination = this.destinations.get(operation.destinationBindingId);
    if (!events || !destination) {
      throw new CodingPackStoreError("coding_pack_store_unavailable");
    }
    return clone({ operation, events, destination });
  }

  async listOperationIds(): Promise<readonly string[]> {
    return clone([...this.operations.keys()]);
  }
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
