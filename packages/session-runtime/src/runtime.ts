import { SessionExportService } from "./export.js";
import { SessionProjector } from "./projector.js";
import { SessionRecoveryService } from "./recovery.js";
import type { SessionStore } from "./store.js";
import type {
  AppendEntryInput,
  NewSessionInput,
  PersistenceInfo,
  ProjectBinding,
  ProjectBindingCandidate,
  ProjectBindingInput,
  ProjectedSessionState,
  RedactedSessionExport,
  SessionEntry,
  SessionRecord,
  SessionStatus,
  SessionSummary,
} from "./types.js";
import { SESSION_SCHEMA_VERSION } from "./types.js";
import { validateEntry, validateSession } from "./validation.js";

const TERMINAL_ENTRY_STATUS: Partial<Record<SessionEntry["type"], SessionStatus>> = {
  SESSION_COMPLETED: "Completed",
  DELIVERY_COMPLETED: "Completed",
  SESSION_FAILED: "Failed",
  SESSION_CANCELLED: "Cancelled",
  SESSION_LIMIT_REACHED: "LimitReached",
  SESSION_INTERRUPTED: "Interrupted",
  RECOVERY_REQUIRED: "RecoveryRequired",
};

export class SessionRuntime {
  readonly projector = new SessionProjector();
  readonly recovery = new SessionRecoveryService(this);
  readonly exporter = new SessionExportService(this);

  constructor(
    readonly store: SessionStore,
    private readonly now: () => Date = () => new Date(),
    private readonly randomId: () => string = () => crypto.randomUUID(),
  ) {}

  async createSession(input: NewSessionInput): Promise<SessionRecord> {
    const createdAt = input.createdAt ?? this.timestamp();
    const id = input.id ?? this.randomId();
    const firstEntryId = this.randomId();
    const session: SessionRecord = {
      id,
      schemaVersion: SESSION_SCHEMA_VERSION,
      title: input.title,
      status: "Active",
      activeLeafId: firstEntryId,
      projectBindingId: input.projectBindingId ?? null,
      providerId: input.providerId ?? null,
      modelId: input.modelId ?? null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
    };
    const entry: SessionEntry = {
      id: firstEntryId,
      sessionId: id,
      parentEntryId: null,
      sequence: 1,
      type: "SESSION_CREATED",
      payloadVersion: 1,
      payload: { title: input.title },
      safeMetadata: {},
      createdAt,
    };
    validateSession(session);
    validateEntry(entry);
    await this.store.createSession(session, entry);
    return session;
  }

  async appendEntry(sessionId: string, input: AppendEntryInput): Promise<SessionEntry> {
    const session = await this.requireSession(sessionId);
    const allEntries = await this.store.listEntries(sessionId);
    const activePath = buildActivePath(allEntries, session.activeLeafId);
    const createdAt = input.createdAt ?? this.timestamp();
    const entry: SessionEntry = {
      id: input.id ?? this.randomId(),
      sessionId,
      parentEntryId: input.parentEntryId === undefined ? session.activeLeafId : input.parentEntryId,
      sequence: (allEntries.at(-1)?.sequence ?? 0) + 1,
      type: input.type,
      payloadVersion: input.payloadVersion ?? 1,
      payload: input.payload ?? {},
      safeMetadata: input.safeMetadata ?? {},
      createdAt,
    };
    validateEntry(entry);
    if (entry.parentEntryId !== session.activeLeafId && !allEntries.some((candidate) => candidate.id === entry.parentEntryId)) {
      throw new Error("The selected ledger parent does not exist.");
    }
    const candidatePath = entry.parentEntryId === session.activeLeafId
      ? [...activePath, entry]
      : [...buildActivePath(allEntries, entry.parentEntryId), entry];
    const projected = this.projector.project(candidatePath);
    const explicitStatus = TERMINAL_ENTRY_STATUS[entry.type];
    await this.store.appendEntry(entry, {
      activeLeafId: entry.id,
      status: explicitStatus ?? projected.status,
      updatedAt: createdAt,
      completedAt: projected.completedAt,
    });
    return entry;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.store.getSession(id);
  }

  async listSessions(): Promise<SessionSummary[]> {
    const sessions = await this.store.listSessions();
    return Promise.all(sessions.map(async (session) => {
      const projection = await this.projectCurrentState(session.id);
      const binding = session.projectBindingId
        ? await this.store.getProjectBinding(session.projectBindingId)
        : null;
      return {
        ...projection,
        id: session.id,
        title: session.title,
        projectBindingId: session.projectBindingId,
        projectDisplayName: binding?.displayName ?? null,
        providerId: session.providerId,
        modelId: session.modelId,
      };
    }));
  }

  async loadActivePath(sessionId: string): Promise<SessionEntry[]> {
    const session = await this.requireSession(sessionId);
    return buildActivePath(await this.store.listEntries(sessionId), session.activeLeafId);
  }

  async projectCurrentState(sessionId: string): Promise<ProjectedSessionState> {
    return this.projector.project(await this.loadActivePath(sessionId));
  }

  async recoverSession(sessionId: string): Promise<ProjectedSessionState> {
    const session = await this.requireSession(sessionId);
    return this.recovery.recover(session, await this.projectCurrentState(sessionId));
  }

  async recoverIncompleteSessions(): Promise<void> {
    for (const session of await this.store.listSessions()) {
      await this.recoverSession(session.id);
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.store.deleteSession(sessionId);
  }

  async exportRedactedSession(sessionId: string): Promise<RedactedSessionExport> {
    return this.exporter.exportRedacted(sessionId);
  }

  async upsertProjectBinding(binding: ProjectBindingInput): Promise<ProjectBinding> {
    return this.store.upsertProjectBinding(binding);
  }

  async getProjectBinding(bindingId: string): Promise<ProjectBinding | null> {
    return this.store.getProjectBinding(bindingId);
  }

  async verifyProjectBinding(bindingId: string, candidate: ProjectBindingCandidate): Promise<boolean> {
    return this.store.verifyProjectBinding(bindingId, candidate);
  }

  async getPersistenceInfo(): Promise<PersistenceInfo> {
    return this.store.getPersistenceInfo();
  }

  private async requireSession(id: string): Promise<SessionRecord> {
    const session = await this.store.getSession(id);
    if (!session) throw new Error("Session not found.");
    if (session.schemaVersion > SESSION_SCHEMA_VERSION) throw new Error("Session was created by a newer KerniQ version.");
    return session;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

export function buildActivePath(entries: SessionEntry[], leafId: string | null): SessionEntry[] {
  if (!leafId) throw new Error("Session active leaf is missing.");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const path: SessionEntry[] = [];
  const seen = new Set<string>();
  let current: SessionEntry | undefined = byId.get(leafId);
  while (current) {
    if (seen.has(current.id)) throw new Error("Session ledger contains a parent cycle.");
    seen.add(current.id);
    path.push(current);
    current = current.parentEntryId ? byId.get(current.parentEntryId) : undefined;
    if (path.at(-1)?.parentEntryId && !current) throw new Error("Session ledger parent is missing.");
  }
  path.reverse();
  return path;
}
