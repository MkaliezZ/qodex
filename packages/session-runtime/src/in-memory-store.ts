import type { SessionStore } from "./store.js";
import type {
  PersistenceInfo,
  ProjectBinding,
  ProjectBindingCandidate,
  ProjectBindingInput,
  SessionEntry,
  SessionMutation,
  SessionRecord,
} from "./types.js";
import { validateEntry, validateSession } from "./validation.js";

interface PrivateBinding extends ProjectBinding {
  privateRootPath: string;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly entries = new Map<string, SessionEntry[]>();
  private readonly bindings = new Map<string, PrivateBinding>();

  constructor(private readonly persistence: PersistenceInfo = {
    kind: "memory",
    persistent: false,
    location: null,
    schemaVersion: 1,
    message: "Browser development uses in-memory session history. Reloading the app clears it.",
  }) {}

  async createSession(session: SessionRecord, firstEntry: SessionEntry): Promise<void> {
    validateSession(session);
    validateEntry(firstEntry);
    if (this.sessions.has(session.id)) throw new Error("Session already exists.");
    if (firstEntry.sessionId !== session.id || firstEntry.sequence !== 1 || firstEntry.parentEntryId !== null) {
      throw new Error("The first ledger entry is invalid.");
    }
    this.sessions.set(session.id, clone(session));
    this.entries.set(session.id, [clone(firstEntry)]);
  }

  async appendEntry(entry: SessionEntry, mutation: SessionMutation): Promise<void> {
    validateEntry(entry);
    const session = this.sessions.get(entry.sessionId);
    const entries = this.entries.get(entry.sessionId);
    if (!session || !entries) throw new Error("Session not found.");
    if (entries.some((candidate) => candidate.id === entry.id)) throw new Error("Ledger entry already exists.");
    const expectedSequence = (entries.at(-1)?.sequence ?? 0) + 1;
    if (entry.sequence !== expectedSequence) throw new Error("Ledger sequence is not append-only.");
    if (entry.parentEntryId !== null && !entries.some((candidate) => candidate.id === entry.parentEntryId)) {
      throw new Error("Ledger parent does not exist in this session.");
    }
    entries.push(clone(entry));
    this.sessions.set(session.id, clone({ ...session, ...mutation }));
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    return session ? clone(session) : null;
  }

  async listSessions(): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  async listEntries(sessionId: string): Promise<SessionEntry[]> {
    return (this.entries.get(sessionId) ?? []).map(clone);
  }

  async deleteSession(id: string): Promise<boolean> {
    this.entries.delete(id);
    return this.sessions.delete(id);
  }

  async upsertProjectBinding(binding: ProjectBindingInput): Promise<ProjectBinding> {
    const stored: PrivateBinding = { ...binding };
    this.bindings.set(binding.bindingId, stored);
    return publicBinding(stored);
  }

  async getProjectBinding(bindingId: string): Promise<ProjectBinding | null> {
    const binding = this.bindings.get(bindingId);
    return binding ? publicBinding(binding) : null;
  }

  async verifyProjectBinding(bindingId: string, candidate: ProjectBindingCandidate): Promise<boolean> {
    const binding = this.bindings.get(bindingId);
    return Boolean(binding
      && binding.projectFingerprint === candidate.projectFingerprint
      && binding.privateRootPath === candidate.privateRootPath);
  }

  async getPersistenceInfo(): Promise<PersistenceInfo> {
    return { ...this.persistence };
  }
}

function publicBinding(binding: PrivateBinding): ProjectBinding {
  const { privateRootPath: _, ...safe } = binding;
  return { ...safe };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
