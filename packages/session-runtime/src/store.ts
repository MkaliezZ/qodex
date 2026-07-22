import type {
  PersistenceInfo,
  ProjectBinding,
  ProjectBindingCandidate,
  ProjectBindingInput,
  SessionEntry,
  SessionMutation,
  SessionRecord,
} from "./types.js";

export interface SessionStore {
  createSession(session: SessionRecord, firstEntry: SessionEntry): Promise<void>;
  appendEntry(entry: SessionEntry, mutation: SessionMutation): Promise<void>;
  getSession(id: string): Promise<SessionRecord | null>;
  listSessions(): Promise<SessionRecord[]>;
  listEntries(sessionId: string): Promise<SessionEntry[]>;
  deleteSession(id: string): Promise<boolean>;
  upsertProjectBinding(binding: ProjectBindingInput): Promise<ProjectBinding>;
  getProjectBinding(bindingId: string): Promise<ProjectBinding | null>;
  verifyProjectBinding(bindingId: string, candidate: ProjectBindingCandidate): Promise<boolean>;
  getPersistenceInfo(): Promise<PersistenceInfo>;
}
