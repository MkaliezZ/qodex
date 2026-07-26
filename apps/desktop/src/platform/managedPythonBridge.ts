import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AgentFuseBridgeClient,
  AgentFuseDecisionRequest,
} from "@qodex/agentfuse-adapter";

export type ManagedPythonRuntimeState = "NotInstalled" | "Ready" | "Broken";

export interface ManagedPythonRuntimeInfo {
  state: ManagedPythonRuntimeState;
  runtimeVersion: string;
  pythonVersion: string | null;
  agentFuseCommit: string;
  bridgeProtocolVersion: string;
  integrity: string;
  lastVerifiedAt: string | null;
  message: string;
}

export interface AgentFuseSelfCheckResult {
  handshakeMatched: boolean;
  canonicalImport: boolean;
  allowDecision: string;
  denyDecision: string;
  denyHandlerInvocations: number;
  agentFuseCommit: string;
  pythonVersion: string;
  bridgeProtocolVersion: string;
}

export interface ManagedPythonInvoker {
  (command: string, args?: Record<string, unknown>): Promise<unknown>;
}

export class TauriManagedPythonBridge implements AgentFuseBridgeClient {
  constructor(private readonly invokeCommand: ManagedPythonInvoker = invoke) {}

  inspect(): Promise<ManagedPythonRuntimeInfo> {
    return this.invokeCommand("managed_python_inspect") as Promise<ManagedPythonRuntimeInfo>;
  }

  provision(): Promise<ManagedPythonRuntimeInfo> {
    return this.invokeCommand("managed_python_provision") as Promise<ManagedPythonRuntimeInfo>;
  }

  verify(): Promise<ManagedPythonRuntimeInfo> {
    return this.invokeCommand("managed_python_verify") as Promise<ManagedPythonRuntimeInfo>;
  }

  remove(): Promise<ManagedPythonRuntimeInfo> {
    return this.invokeCommand("managed_python_remove") as Promise<ManagedPythonRuntimeInfo>;
  }

  selfCheck(): Promise<AgentFuseSelfCheckResult> {
    return this.invokeCommand("managed_python_self_check") as Promise<AgentFuseSelfCheckResult>;
  }

  requestDecision(request: AgentFuseDecisionRequest, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) return Promise.reject(abortError());
    return raceAbort(
      this.invokeCommand("agentfuse_decide", { request }).catch((cause) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Managed AgentFuse bridge process failed: ${message}`);
      }),
      signal,
    );
  }
}

export function createManagedPythonBridge(): TauriManagedPythonBridge | null {
  return isTauri() ? new TauriManagedPythonBridge() : null;
}

function raceAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function abortError(): DOMException {
  return new DOMException("Managed AgentFuse request was cancelled.", "AbortError");
}
