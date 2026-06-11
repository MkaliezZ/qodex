/**
 * Qodex Agent Runtime — In-Memory Session Store
 *
 * Holds sessions for the current runtime session.
 * No database persistence — sessions are ephemeral.
 */

import type { AgentSession } from "../types/session.js";

export class InMemorySessionStore {
  private sessions = new Map<string, AgentSession>();

  create(title: string): AgentSession {
    const session: AgentSession = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  list(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  remove(id: string): boolean {
    return this.sessions.delete(id);
  }

  clear(): void {
    this.sessions.clear();
  }

  get size(): number {
    return this.sessions.size;
  }
}
