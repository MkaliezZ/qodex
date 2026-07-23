import type { PatchErrorCode } from "@qodex/diff-engine";
import type { FileSystemAdapter } from "@qodex/project-runtime";
import type { ProjectCommandRunner } from "@qodex/agent-runtime";

export type ProjectAccessSource = "tauri" | "browser";

export interface OpenedProjectDirectory {
  name: string;
  adapter: FileSystemAdapter;
  source: ProjectAccessSource;
  /** Private local identity used only for binding verification; never sent to the model or exported. */
  privateRootPath: string;
  commandRunner?: ProjectCommandRunner;
}

export class ProjectAccessError extends Error {
  constructor(
    readonly code: PatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectAccessError";
  }
}
