import { invoke } from "@tauri-apps/api/core";
import type {
  ProjectCommandDefinition,
  ProjectCommandResult,
  ProjectCommandRunner,
} from "@qodex/agent-runtime";

interface TauriCommandInvoker {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export function createTauriProjectCommandRunner(
  projectRoot: string,
  invokeCommand: TauriCommandInvoker = invoke,
): ProjectCommandRunner {
  return {
    run: async (command: ProjectCommandDefinition, runId: string): Promise<ProjectCommandResult> => {
      return invokeCommand<ProjectCommandResult>("run_project_command", {
        request: {
          runId,
          projectRoot,
          commandId: command.id,
        },
      });
    },
    cancel: async (runId: string): Promise<void> => {
      await invokeCommand<boolean>("cancel_project_command", { runId });
    },
  };
}
