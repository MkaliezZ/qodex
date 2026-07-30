import { invoke } from "@tauri-apps/api/core";
import type {
  CodingPackDestinationBinding,
  CodingPackEvent,
  CodingPackOperationRecord,
  CodingPackStoreAdapter,
  CodingPackStoredSnapshotData,
} from "@qodex/coding-pack-store";

export interface TauriCodingPackInvoker {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export class TauriCodingPackStoreAdapter implements CodingPackStoreAdapter {
  constructor(private readonly invokeCommand: TauriCodingPackInvoker = invoke) {}

  async registerDestinationBinding(binding: CodingPackDestinationBinding): Promise<void> {
    const stored = await this.invokeCommand<CodingPackDestinationBinding | null>(
      "coding_pack_destination_get",
      { destinationBindingId: binding.destinationBindingId },
    );
    if (
      !stored
      || stored.destinationFingerprint !== binding.destinationFingerprint
      || stored.displayLabel !== binding.displayLabel
      || stored.createdAt !== binding.createdAt
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

  async appendDecision(
    operation: CodingPackOperationRecord,
    decidedEvent: CodingPackEvent,
  ): Promise<void> {
    await this.invokeCommand("coding_pack_store_decide", {
      request: { operation, decidedEvent },
    });
  }

  getOperationSnapshotData(
    operationId: string,
  ): Promise<CodingPackStoredSnapshotData | null> {
    return this.invokeCommand("coding_pack_store_snapshot", { operationId });
  }

  listOperationIds(): Promise<readonly string[]> {
    return this.invokeCommand("coding_pack_store_operation_ids");
  }
}
