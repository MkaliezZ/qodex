import { invoke } from "@tauri-apps/api/core";
import type {
  CodingPackDestinationBinding,
  CodingPackEvent,
  CodingPackOperationRecord,
  CodingPackStoreAdapter,
} from "@qodex/coding-pack-store";

export interface TauriCodingPackInvoker {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export class TauriCodingPackStoreAdapter implements CodingPackStoreAdapter {
  constructor(private readonly invokeCommand: TauriCodingPackInvoker = invoke) {}

  async registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void> {
    const stored = await this.getDestinationBinding(binding.destinationBindingId);
    if (
      !stored
      || stored.destinationFingerprint !== binding.destinationFingerprint
      || stored.displayLabel !== binding.displayLabel
      || stored.restartAvailable !== true
    ) {
      throw new Error("coding_pack_destination_unavailable");
    }
  }

  async createOperation(
    operation: CodingPackOperationRecord,
    proposedEvent: CodingPackEvent,
  ): Promise<void> {
    await this.invokeCommand("coding_pack_store_create", {
      request: { operation, proposedEvent },
    });
  }

  async appendConfirmation(
    operation: CodingPackOperationRecord,
    confirmedEvent: CodingPackEvent,
  ): Promise<void> {
    await this.invokeCommand("coding_pack_store_confirm", {
      request: { operation, confirmedEvent },
    });
  }

  getOperation(operationId: string): Promise<CodingPackOperationRecord | null> {
    return this.invokeCommand("coding_pack_store_get", { operationId });
  }

  listOperations(): Promise<CodingPackOperationRecord[]> {
    return this.invokeCommand("coding_pack_store_list");
  }

  listEvents(operationId: string): Promise<CodingPackEvent[]> {
    return this.invokeCommand("coding_pack_store_events", { operationId });
  }

  getDestinationBinding(
    destinationBindingId: string,
  ): Promise<CodingPackDestinationBinding | null> {
    return this.invokeCommand("coding_pack_destination_get", { destinationBindingId });
  }
}
