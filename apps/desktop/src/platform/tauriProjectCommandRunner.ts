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
  const activeRuns = new Map<string, {
    commandId: string;
    catalogDigest: string;
    operation: Promise<ProjectCommandResult>;
  }>();
  return {
    run: (command: ProjectCommandDefinition, runId: string): Promise<ProjectCommandResult> => {
      if (!command.catalogDigest) throw new Error("The cataloged command is missing its source digest.");
      const active = activeRuns.get(runId);
      if (active) {
        if (
          active.commandId !== command.id
          || active.catalogDigest !== command.catalogDigest
        ) {
          return Promise.reject(
            new Error("The native command run ID is already bound to another command."),
          );
        }
        return active.operation;
      }
      let operation: Promise<ProjectCommandResult>;
      operation = invokeCommand<ProjectCommandResult>("run_project_command", {
        request: {
          runId,
          projectRoot,
          commandId: command.id,
          catalogDigest: command.catalogDigest,
        },
      }).finally(() => {
        if (activeRuns.get(runId)?.operation === operation) {
          activeRuns.delete(runId);
        }
      });
      activeRuns.set(runId, {
        commandId: command.id,
        catalogDigest: command.catalogDigest,
        operation,
      });
      return operation;
    },
    cancel: async (runId: string): Promise<void> => {
      await invokeCommand<boolean>("cancel_project_command", { runId });
    },
  };
}
