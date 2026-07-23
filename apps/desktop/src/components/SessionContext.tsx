import { isTauri } from "@tauri-apps/api/core";
import {
  InMemorySessionStore,
  SessionRuntime,
  type PersistenceInfo,
  type SessionStore,
  type SessionSummary,
} from "@qodex/session-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TauriSessionStore } from "../platform/tauriSessionStore";

interface SessionContextValue {
  runtime: SessionRuntime;
  sessions: SessionSummary[];
  persistence: PersistenceInfo | null;
  ready: boolean;
  error: string | null;
  refreshSessions(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const resolveSessionStore = createStableResolver(selectSessionStore);
const resolveSessionRuntime = createStableResolver(() => new SessionRuntime(resolveSessionStore()));
const initializeSessionRuntime = createSingleFlightByKey(async (runtime: SessionRuntime) => {
  const persistence = await runtime.getPersistenceInfo();
  await runtime.recoverIncompleteSessions();
  const sessions = await runtime.listSessions();
  return { persistence, sessions };
});

export function SessionContextProvider({ children }: { children: ReactNode }) {
  const runtime = useMemo(() => resolveSessionRuntime(), []);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [persistence, setPersistence] = useState<PersistenceInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setSessions(await runtime.listSessions());
  }, [runtime]);

  useEffect(() => {
    let active = true;
    void initializeSessionRuntime(runtime)
      .then((initialized) => {
        if (!active) return;
        setPersistence(initialized.persistence);
        setSessions(initialized.sessions);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Session history is unavailable.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, [runtime]);

  return (
    <SessionContext.Provider value={{ runtime, sessions, persistence, ready, error, refreshSessions }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionContextProvider is missing.");
  return value;
}

function selectSessionStore(): SessionStore {
  if (import.meta.env.DEV && window.__kerniqTestSessionStore) return window.__kerniqTestSessionStore;
  return isTauri() ? new TauriSessionStore() : new InMemorySessionStore();
}

export function createStableResolver<T>(select: () => T): () => T {
  let selected: T | null = null;
  return () => {
    selected ??= select();
    return selected;
  };
}

export function createSingleFlightByKey<Key extends object, Value>(
  initialize: (key: Key) => Promise<Value>,
): (key: Key) => Promise<Value> {
  const active = new WeakMap<Key, Promise<Value>>();
  return (key) => {
    const existing = active.get(key);
    if (existing) return existing;
    const pending = initialize(key);
    active.set(key, pending);
    return pending;
  };
}
