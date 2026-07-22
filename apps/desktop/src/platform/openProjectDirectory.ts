import { isTauri } from "@tauri-apps/api/core";
import {
  openBrowserProjectDirectory,
  type BrowserDirectoryPickerHost,
} from "./browserProjectDirectory";
import { tauriProjectBridge, type TauriProjectBridge } from "./tauriBridge";
import { TauriFileSystemAdapter } from "./tauriFileSystemAdapter";
import { ProjectAccessError, type OpenedProjectDirectory } from "./types";
import { createTauriProjectCommandRunner } from "./tauriProjectCommandRunner";

export type ProjectEnvironment = "tauri" | "browser" | "unsupported";

export interface ProjectDirectoryDependencies {
  isTauriRuntime?: () => boolean;
  browserHost?: BrowserDirectoryPickerHost;
  tauriBridge?: TauriProjectBridge;
}

export function detectProjectEnvironment(
  dependencies: ProjectDirectoryDependencies = {},
): ProjectEnvironment {
  if ((dependencies.isTauriRuntime ?? isTauri)()) return "tauri";
  const host = dependencies.browserHost
    ?? (typeof window === "undefined" ? undefined : window as BrowserDirectoryPickerHost);
  return host?.showDirectoryPicker ? "browser" : "unsupported";
}

export async function openProjectDirectory(
  dependencies: ProjectDirectoryDependencies = {},
): Promise<OpenedProjectDirectory | null> {
  const environment = detectProjectEnvironment(dependencies);
  if (environment === "tauri") {
    const bridge = dependencies.tauriBridge ?? tauriProjectBridge;
    const root = await bridge.pickDirectory();
    if (!root) return null;
    const adapter = await TauriFileSystemAdapter.create(root, bridge);
    return {
      name: adapter.getProjectName(""),
      adapter,
      source: "tauri",
      privateRootPath: root,
      commandRunner: createTauriProjectCommandRunner(root),
    };
  }

  if (environment === "browser") {
    const host = dependencies.browserHost ?? window as BrowserDirectoryPickerHost;
    return openBrowserProjectDirectory(host);
  }

  throw new ProjectAccessError(
    "write_target_unavailable",
    "This environment does not provide supported local project access.",
  );
}
