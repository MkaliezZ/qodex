import { isTauri } from "@tauri-apps/api/core";
import {
  CodingPackStore,
  type CreateCodingPackExportProposalInput,
} from "@qodex/coding-pack-store";
import {
  verifyCodingPackPreviewConfirmation,
  type CodingPackPreview,
  type CodingPackPreviewConfirmation,
} from "../codingPack/preview";
import { BrowserCodingPackStoreAdapter } from "./browserCodingPackStore";
import { TauriCodingPackStoreAdapter } from "./tauriCodingPackStore";

let selectedStore: CodingPackStore | null = null;

export function getCodingPackStore(): CodingPackStore {
  selectedStore ??= new CodingPackStore(
    isTauri()
      ? new TauriCodingPackStoreAdapter()
      : new BrowserCodingPackStoreAdapter(),
  );
  return selectedStore;
}

export async function createVerifiedCodingPackExportProposal(input: {
  readonly store: CodingPackStore;
  readonly preview: CodingPackPreview;
  readonly confirmation: CodingPackPreviewConfirmation;
  readonly proposalInput: CreateCodingPackExportProposalInput;
}) {
  await verifyCodingPackPreviewConfirmation(input.confirmation, input.preview);
  return input.store.createCodingPackExportProposal(input.proposalInput);
}
