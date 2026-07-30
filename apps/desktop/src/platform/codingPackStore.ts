import { isTauri } from "@tauri-apps/api/core";
import { CodingPackStore } from "@qodex/coding-pack-store";
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
