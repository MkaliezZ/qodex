import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { RegistryRuntime } from "@qodex/marketplace-runtime";
import type { RegistrySource, RegistryEntry, UpdateCandidate, SyncResult } from "@qodex/marketplace-runtime";

interface RegistryCtxValue {
  rt: RegistryRuntime;
  sources: RegistrySource[];
  syncStatus: "idle" | "syncing" | "completed" | "failed";
  lastSyncResult: SyncResult | null;
  searchResults: RegistryEntry[];
  selectedEntry: RegistryEntry | null;
  updateCandidates: UpdateCandidate[];
  refreshSources: () => void;
  addSource: (s: RegistrySource) => void;
  removeSource: (id: string) => void;
  sync: (sourceId?: string) => Promise<void>;
  search: (q: string) => RegistryEntry[];
  selectEntry: (id: string) => void;
  checkUpdates: (installed: Array<{ id: string; version: string }>) => void;
}

const RegistryCtx = createContext<RegistryCtxValue>({} as RegistryCtxValue);
export const useRegistryContext = () => useContext(RegistryCtx);

export function RegistryContextProvider({ children }: { children: React.ReactNode }) {
  const [rt] = useState(() => new RegistryRuntime());
  const [sources, setSources] = useState<RegistrySource[]>([]);
  const [syncStatus, setSyncStatus] = useState<RegistryCtxValue["syncStatus"]>("idle");
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [searchResults, setSearchResults] = useState<RegistryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<RegistryEntry | null>(null);
  const [updateCandidates, setUpdateCandidates] = useState<UpdateCandidate[]>([]);

  const refreshSources = useCallback(() => setSources(rt.listSources()), [rt]);
  const addSource = useCallback((s: RegistrySource) => { rt.addSource(s); refreshSources(); }, [rt, refreshSources]);
  const removeSource = useCallback((id: string) => { rt.removeSource(id); refreshSources(); }, [rt, refreshSources]);

  const sync = useCallback(async (sourceId?: string) => {
    setSyncStatus("syncing");
    try {
      const results = await rt.sync(sourceId);
      setLastSyncResult(results[0] ?? null);
      setSyncStatus("completed");
      refreshSources();
    } catch {
      setSyncStatus("failed");
    }
  }, [rt, refreshSources]);

  const search = useCallback((q: string) => {
    const r = rt.search(q);
    setSearchResults(r);
    return r;
  }, [rt]);

  const selectEntry = useCallback((id: string) => setSelectedEntry(rt.getEntry(id) ?? null), [rt]);

  const checkUpdatesFn = useCallback((installed: Array<{ id: string; version: string }>) => {
    setUpdateCandidates(rt.checkUpdates(installed));
  }, [rt]);

  useEffect(() => { refreshSources(); }, [refreshSources]);

  const value = useMemo(() => ({ rt, sources, syncStatus, lastSyncResult, searchResults, selectedEntry, updateCandidates, refreshSources, addSource, removeSource, sync, search, selectEntry, checkUpdates: checkUpdatesFn }), [rt, sources, syncStatus, lastSyncResult, searchResults, selectedEntry, updateCandidates, refreshSources, addSource, removeSource, sync, search, selectEntry, checkUpdatesFn]);

  return <RegistryCtx.Provider value={value}>{children}</RegistryCtx.Provider>;
}
