import { invoke } from "@tauri-apps/api/core";
import type {
  PersistenceInfo,
  ProjectBinding,
  ProjectBindingCandidate,
  ProjectBindingInput,
  SessionEntry,
  SessionMutation,
  SessionRecord,
  SessionStore,
} from "@qodex/session-runtime";

export interface TauriSessionInvoker {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export class TauriSessionStore implements SessionStore {
  constructor(private readonly invokeCommand: TauriSessionInvoker = invoke) {}

  async createSession(session: SessionRecord, firstEntry: SessionEntry): Promise<void> {
    await this.invokeCommand("session_store_create", { request: { session, firstEntry } });
  }

  async appendEntry(entry: SessionEntry, mutation: SessionMutation): Promise<void> {
    await this.invokeCommand("session_store_append", { request: { entry, mutation } });
  }

  getSession(id: string): Promise<SessionRecord | null> {
    return this.invokeCommand("session_store_get", { sessionId: id });
  }

  listSessions(): Promise<SessionRecord[]> {
    return this.invokeCommand("session_store_list");
  }

  listEntries(sessionId: string): Promise<SessionEntry[]> {
    return this.invokeCommand("session_store_entries", { sessionId });
  }

  deleteSession(sessionId: string): Promise<boolean> {
    return this.invokeCommand("session_store_delete", { sessionId });
  }

  upsertProjectBinding(binding: ProjectBindingInput): Promise<ProjectBinding> {
    return this.invokeCommand("session_binding_upsert", { binding });
  }

  getProjectBinding(bindingId: string): Promise<ProjectBinding | null> {
    return this.invokeCommand("session_binding_get", { bindingId });
  }

  verifyProjectBinding(bindingId: string, candidate: ProjectBindingCandidate): Promise<boolean> {
    return this.invokeCommand("session_binding_verify", { bindingId, candidate });
  }

  getPersistenceInfo(): Promise<PersistenceInfo> {
    return this.invokeCommand("session_persistence_info");
  }
}
