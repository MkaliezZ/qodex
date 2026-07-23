import type { AgentPatchProposal, ProjectCommandDefinition } from "@qodex/agent-runtime";
import type { SafeJson } from "@qodex/session-runtime";

export function recoveredPatch(payload: SafeJson): AgentPatchProposal | null {
  if (!isRecord(payload)
    || typeof payload.actionId !== "string"
    || typeof payload.taskId !== "string"
    || typeof payload.summary !== "string"
    || typeof payload.createdAt !== "string"
    || !Array.isArray(payload.files)) return null;
  const files = payload.files.map((file) => {
    if (!isRecord(file)
      || typeof file.path !== "string"
      || typeof file.oldContent !== "string"
      || typeof file.newContent !== "string") return null;
    return { path: file.path, oldContent: file.oldContent, newContent: file.newContent };
  });
  if (files.some((file) => file === null)) return null;
  return {
    id: payload.actionId,
    taskId: payload.taskId,
    summary: payload.summary,
    createdAt: payload.createdAt,
    files: files as AgentPatchProposal["files"],
  };
}

export function recoveredCommand(payload: SafeJson): ProjectCommandDefinition | null {
  if (!isRecord(payload) || !isRecord(payload.command)) return null;
  const command = payload.command;
  if (typeof command.id !== "string"
    || typeof command.label !== "string"
    || typeof command.executable !== "string"
    || !Array.isArray(command.args)
    || !command.args.every((argument) => typeof argument === "string")
    || typeof command.cwd !== "string"
    || typeof command.catalogDigest !== "string"
    || (command.source !== "package.json" && command.source !== "cargo")
    || !["test", "check", "lint", "typecheck", "build"].includes(String(command.category))) return null;
  return {
    id: command.id,
    label: command.label,
    executable: command.executable,
    args: command.args as string[],
    cwd: command.cwd,
    source: command.source,
    category: command.category as ProjectCommandDefinition["category"],
    catalogDigest: command.catalogDigest,
  };
}

export function commandsMatch(stored: ProjectCommandDefinition, discovered: ProjectCommandDefinition): boolean {
  return stored.id === discovered.id
    && stored.label === discovered.label
    && stored.executable === discovered.executable
    && stored.cwd === discovered.cwd
    && stored.source === discovered.source
    && stored.category === discovered.category
    && Boolean(stored.catalogDigest)
    && stored.catalogDigest === discovered.catalogDigest
    && stored.args.length === discovered.args.length
    && stored.args.every((argument, index) => argument === discovered.args[index]);
}

function isRecord(value: SafeJson): value is Record<string, SafeJson> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
