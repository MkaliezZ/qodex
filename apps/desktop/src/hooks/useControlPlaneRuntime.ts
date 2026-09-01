import { isTauri } from "@tauri-apps/api/core";
import {
  CodexObservedBackend,
  ControlPlaneProductRuntime,
  DshGovernedBackend,
  type AgentBackend,
  type AgentBackendAdmission,
} from "@qodex/multi-agent-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionContext } from "../components/SessionContext";
import {
  failedControlPlaneView,
  runningControlPlaneView,
  settledControlPlaneView,
  type ControlPlaneViewModel,
} from "../controlPlane/controlPlaneViewModel";
import {
  createTauriCodexTransport,
  createTauriDshTransport,
} from "../platform/tauriControlPlaneTransport";
import { DesktopControlPlaneSessionLedger } from "../session/controlPlaneSessionLedger";

export type AgentExecutionMode = "single" | "supervisor";

export function useControlPlaneRuntime(workspace: string | null) {
  const { runtime: sessionRuntime, refreshSessions } = useSessionContext();
  const [mode, setMode] = useState<AgentExecutionMode>("single");
  const [view, setView] = useState<ControlPlaneViewModel | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admissions, setAdmissions] = useState<Readonly<Record<string, AgentBackendAdmission>>>({});
  const backends = useMemo(resolveProductBackends, []);
  const productRuntime = useMemo(() => new ControlPlaneProductRuntime({
    ledger: new DesktopControlPlaneSessionLedger(sessionRuntime, refreshSessions),
  }), [refreshSessions, sessionRuntime]);

  useEffect(() => {
    if (!backends) return;
    let active = true;
    void Promise.all(backends.map(async (backend) => [
      backend.id,
      await backend.probeCapabilities(),
    ] as const)).then((entries) => {
      if (active) setAdmissions(Object.freeze(Object.fromEntries(entries)));
    }).catch((cause) => {
      if (active) setError(messageOf(cause, "Control-plane backend admission is unavailable."));
    });
    return () => { active = false; };
  }, [backends]);

  const runTask = useCallback(async (prompt: string) => {
    if (isRunning || !prompt.trim()) return;
    if (!workspace) {
      setError("Open a local project before starting a Supervisor task.");
      return;
    }
    if (!backends) {
      setError("The governed control plane requires the KerniQ desktop runtime.");
      return;
    }
    const taskId = crypto.randomUUID();
    const title = taskTitle(prompt);
    setError(null);
    setIsRunning(true);
    setView(runningControlPlaneView(taskId, title, admissions));
    try {
      const result = await productRuntime.runTask({
        taskId,
        title,
        workspace,
        prompt,
        workers: [
          { backendId: "codex" },
          { backendId: "dsh-deepseek", governanceRequired: true },
        ],
      }, backends);
      setView(settledControlPlaneView(result));
    } catch (cause) {
      setView((current) => current ? failedControlPlaneView(current) : current);
      setError(messageOf(cause, "The Supervisor task failed before completion."));
    } finally {
      setIsRunning(false);
      await refreshSessions();
    }
  }, [admissions, backends, isRunning, productRuntime, refreshSessions, workspace]);

  return {
    mode,
    setMode,
    view,
    isRunning,
    error,
    available: backends !== null,
    runTask,
  };
}

function resolveProductBackends(): readonly [AgentBackend, AgentBackend] | null {
  if (import.meta.env.DEV && window.__kerniqTestControlPlaneBackends) {
    const [codex, dsh] = window.__kerniqTestControlPlaneBackends;
    return codex && dsh ? [codex, dsh] : null;
  }
  if (!isTauri()) return null;
  return [
    new CodexObservedBackend(createTauriCodexTransport()),
    new DshGovernedBackend(createTauriDshTransport()),
  ];
}

function taskTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}
