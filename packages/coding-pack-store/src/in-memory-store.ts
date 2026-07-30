import { CodingPackStoreError } from "./errors.js";
import type {
  CodingPackDestinationBinding,
  CodingPackEvent,
  CodingPackOperationRecord,
  CodingPackStoreAdapter,
} from "./types.js";

export class InMemoryCodingPackStoreAdapter implements CodingPackStoreAdapter {
  private readonly operations = new Map<string, CodingPackOperationRecord>();
  private readonly events = new Map<string, CodingPackEvent[]>();
  private readonly destinations = new Map<string, CodingPackDestinationBinding>();

  async registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void> {
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

  async getOperation(operationId: string): Promise<CodingPackOperationRecord | null> {
    const operation = this.operations.get(operationId);
    return operation ? clone(operation) : null;
  }

  async listOperations(): Promise<CodingPackOperationRecord[]> {
    return [...this.operations.values()].map(clone);
  }

  async listEvents(operationId: string): Promise<CodingPackEvent[]> {
    return (this.events.get(operationId) ?? []).map(clone);
  }

  async getDestinationBinding(
    destinationBindingId: string,
  ): Promise<CodingPackDestinationBinding | null> {
    const binding = this.destinations.get(destinationBindingId);
    return binding ? clone(binding) : null;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
