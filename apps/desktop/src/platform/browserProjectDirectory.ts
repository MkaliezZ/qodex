import { WebFileSystemAdapter } from "@qodex/project-runtime";
import type { OpenedProjectDirectory } from "./types";

export interface BrowserDirectoryPickerHost {
  showDirectoryPicker?: (
    options?: { mode?: "read" | "readwrite" },
  ) => Promise<FileSystemDirectoryHandle>;
}

function isCancellation(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

export async function openBrowserProjectDirectory(
  host: BrowserDirectoryPickerHost,
): Promise<OpenedProjectDirectory | null> {
  const picker = host.showDirectoryPicker;
  if (!picker) return null;

  try {
    const handle = await picker.call(host, { mode: "readwrite" });
    return {
      name: handle.name,
      adapter: new WebFileSystemAdapter(handle),
      source: "browser",
    };
  } catch (error) {
    if (isCancellation(error)) return null;
    throw error;
  }
}
