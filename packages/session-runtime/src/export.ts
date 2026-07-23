import type { SessionRuntime } from "./runtime.js";
import type { RedactedSessionExport, SafeJson, SessionEntry } from "./types.js";
import { redactJson } from "./validation.js";

export class SessionExportService {
  constructor(private readonly runtime: SessionRuntime) {}

  async exportRedacted(sessionId: string): Promise<RedactedSessionExport> {
    const session = await this.runtime.getSession(sessionId);
    if (!session) throw new Error("Session not found.");
    const binding = session.projectBindingId
      ? await this.runtime.getProjectBinding(session.projectBindingId)
      : null;
    const path = await this.runtime.loadActivePath(sessionId);
    const entries = path.map(redactEntry);
    const { projectBindingId: _, activeLeafId: __, ...safeSession } = session;
    const redactedSession = redactJson({
      ...safeSession,
      projectDisplayName: binding?.displayName ?? null,
    } as SafeJson) as RedactedSessionExport["session"];
    return {
      schemaVersion: session.schemaVersion,
      session: redactedSession,
      entries,
    };
  }
}

function redactEntry(entry: SessionEntry): SessionEntry {
  const payload = entry.type === "PATCH_PROPOSED"
    ? redactPatch(entry.payload)
    : redactJson(entry.payload);
  return {
    ...entry,
    payload,
    safeMetadata: redactJson(entry.safeMetadata as SafeJson) as SessionEntry["safeMetadata"],
  };
}

function redactPatch(value: SafeJson): SafeJson {
  if (!isRecord(value)) return {};
  const files: SafeJson[] = Array.isArray(value.files)
    ? value.files.map((file): SafeJson => isRecord(file)
      ? { path: redactJson(file.path ?? "") }
      : {})
    : [];
  return {
    actionId: typeof value.actionId === "string" ? value.actionId : "",
    summary: typeof value.summary === "string" ? redactJson(value.summary) : "",
    files,
  };
}

function isRecord(value: SafeJson): value is Record<string, SafeJson> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
