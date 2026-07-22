import type { PatchErrorCode } from "@qodex/diff-engine";
import type { FileSystemAdapter } from "@qodex/project-runtime";
import type { ProjectCommandRunner } from "@qodex/agent-runtime";

export type ProjectAccessSource = "tauri" | "browser";

export interface OpenedProjectDirectory {
  name: string;
  adapter: FileSystemAdapter;
  source: ProjectAccessSource;
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
