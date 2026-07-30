import { isTauri } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import {
  createCodingPackDestinationBinding,
  type CodingPackDestinationBinding,
  type CodingPackStore,
} from "@qodex/coding-pack-store";

interface CodingPackDirectoryPickerHost {
  showDirectoryPicker?: (
    options?: { mode?: "read" | "readwrite" },
  ) => Promise<FileSystemDirectoryHandle>;
}

export interface CodingPackDestinationInvoker {
  <T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T>;
}

interface CodingPackDestinationDependencies {
  readonly isTauriRuntime?: () => boolean;
  readonly browserHost?: CodingPackDirectoryPickerHost;
  readonly invokeCommand?: CodingPackDestinationInvoker;
  readonly createId?: () => string;
  readonly now?: () => Date;
}

const browserDestinationCapabilities = new Map<string, FileSystemDirectoryHandle>();

export async function chooseCodingPackDestination(
  store: CodingPackStore,
  dependencies: CodingPackDestinationDependencies = {},
): Promise<CodingPackDestinationBinding | null> {
  const now = dependencies.now?.() ?? new Date();
  if ((dependencies.isTauriRuntime ?? isTauri)()) {
    const invokeCommand = dependencies.invokeCommand ?? invoke;
    const binding = await invokeCommand<CodingPackDestinationBinding | null>(
      "coding_pack_destination_pick_and_bind",
      { request: { createdAt: now.toISOString() } },
    );
    return binding ? store.registerDestinationBinding(binding) : null;
  }

  const host = dependencies.browserHost
    ?? (typeof window === "undefined" ? undefined : window as CodingPackDirectoryPickerHost);
  const picker = host?.showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker.call(host, { mode: "readwrite" });
    const capabilityId = dependencies.createId?.() ?? crypto.randomUUID();
    const binding = await createCodingPackDestinationBinding({
      privateIdentityMaterial: `browser-capability\0${capabilityId}`,
      displayLabel: handle.name,
      createdAt: now.toISOString(),
      restartAvailable: false,
    });
    browserDestinationCapabilities.set(binding.destinationBindingId, handle);
    return store.registerDestinationBinding(binding);
  } catch (error) {
    if (isCancellation(error)) return null;
    throw error;
  }
}

export function hasCodingPackDestinationCapability(
  binding: CodingPackDestinationBinding,
): boolean {
  return binding.restartAvailable
    || browserDestinationCapabilities.has(binding.destinationBindingId);
}

function isCancellation(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}
