import {
  CheckCircle2,
  Download,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionContext } from "./SessionContext";
import {
  createManagedPythonBridge,
  type AgentFuseSelfCheckResult,
  type ManagedPythonRuntimeInfo,
} from "../platform/managedPythonBridge";
import {
  prepareAgentFuseProof,
  type AgentFuseProofFixture,
  type PreparedAgentFuseProof,
} from "./agentFuseProof";
import { StatusIndicator } from "./WorkbenchPrimitives";

const PROOF_ENABLED = import.meta.env.VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF === "1";

export function ManagedPythonSettings() {
  const bridge = useMemo(createManagedPythonBridge, []);
  const { runtime: sessionRuntime, refreshSessions } = useSessionContext();
  const [runtimeInfo, setRuntimeInfo] = useState<ManagedPythonRuntimeInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfCheck, setSelfCheck] = useState<AgentFuseSelfCheckResult | null>(null);
  const [prepared, setPrepared] = useState<PreparedAgentFuseProof | null>(null);
  const [proofResult, setProofResult] = useState<string | null>(null);

  const inspect = useCallback(async () => {
    if (!bridge) return;
    try {
      setRuntimeInfo(await bridge.inspect());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, "Managed Python runtime status is unavailable."));
    }
  }, [bridge]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  const runRuntimeAction = useCallback(async (
    label: string,
    operation: () => Promise<ManagedPythonRuntimeInfo>,
  ) => {
    setBusy(label);
    setError(null);
    setSelfCheck(null);
    try {
      setRuntimeInfo(await operation());
    } catch (cause) {
      setError(messageOf(cause, `${label} failed.`));
      await inspect();
    } finally {
      setBusy(null);
    }
  }, [inspect]);

  const runSelfCheck = useCallback(async () => {
    if (!bridge) return;
    setBusy("Self-check");
    setError(null);
    setSelfCheck(null);
    try {
      setSelfCheck(await bridge.selfCheck());
      await inspect();
    } catch (cause) {
      setError(messageOf(cause, "AgentFuse self-check failed."));
    } finally {
      setBusy(null);
    }
  }, [bridge, inspect]);

  const prepareProof = useCallback(async (fixture: AgentFuseProofFixture) => {
    if (!bridge) return;
    setBusy(`Prepare ${fixture} proof`);
    setError(null);
    setProofResult(null);
    try {
      setPrepared(await prepareAgentFuseProof({
        fixture,
        bridge,
        sessionRuntime,
        refreshSessions,
      }));
    } catch (cause) {
      setError(messageOf(cause, "AgentFuse proof could not be prepared."));
    } finally {
      setBusy(null);
    }
  }, [bridge, refreshSessions, sessionRuntime]);

  const approveProof = useCallback(async () => {
    if (!prepared) return;
    setBusy("Run proof");
    setError(null);
    try {
      const result = await prepared.approveAndRun();
      const counter = prepared.counterStore.snapshot();
      setProofResult(
        result.state === "Completed"
          ? `Allowed, dispatched once, counter=${counter.count}.`
          : `${result.state}; handler invocations=${counter.handlerInvocations}.`,
      );
      setPrepared(null);
      await refreshSessions();
    } catch (cause) {
      setError(messageOf(cause, "AgentFuse proof failed closed."));
    } finally {
      setBusy(null);
    }
  }, [prepared, refreshSessions]);

  if (!bridge) {
    return (
      <div className="managed-runtime-card">
        <RuntimeCopy />
        <div className="managed-runtime-message">
          Native runtime controls are available in the KerniQ desktop application.
        </div>
      </div>
    );
  }

  const state = runtimeInfo?.state ?? "Loading";
  const ready = state === "Ready";
  const broken = state === "Broken";
  const notInstalled = state === "NotInstalled";

  return (
    <div className="managed-runtime-card">
      <RuntimeCopy />

      <div className="managed-runtime-summary">
        <div className="managed-runtime-status">
          <StatusIndicator
            label={state}
            tone={ready ? "success" : broken ? "danger" : "neutral"}
          />
          <span>{runtimeInfo?.message ?? "Inspecting private runtime state..."}</span>
        </div>
        <dl className="managed-runtime-grid">
          <RuntimeDatum label="Python" value={runtimeInfo?.pythonVersion ?? "Not installed"} />
          <RuntimeDatum
            label="AgentFuse revision"
            value={abbreviate(runtimeInfo?.agentFuseCommit)}
          />
          <RuntimeDatum
            label="Bridge protocol"
            value={runtimeInfo?.bridgeProtocolVersion ?? "Unavailable"}
          />
          <RuntimeDatum label="Integrity" value={runtimeInfo?.integrity ?? "Unknown"} />
          <RuntimeDatum
            label="Last verified"
            value={formatVerification(runtimeInfo?.lastVerifiedAt)}
          />
        </dl>
      </div>

      <div className="managed-runtime-actions" aria-label="Managed Python runtime actions">
        {notInstalled ? (
          <button
            className="qodex-button"
            disabled={busy !== null}
            onClick={() => void runRuntimeAction("Install runtime", () => bridge.provision())}
          >
            <Download size={13} aria-hidden="true" /> Install runtime
          </button>
        ) : null}
        {ready ? (
          <>
            <button
              className="qodex-button qodex-button-secondary"
              disabled={busy !== null}
              onClick={() => void runRuntimeAction("Verify runtime", () => bridge.verify())}
            >
              <RefreshCw size={13} aria-hidden="true" /> Verify runtime
            </button>
            <button
              className="qodex-button qodex-button-secondary"
              disabled={busy !== null}
              onClick={() => void runSelfCheck()}
            >
              <ShieldCheck size={13} aria-hidden="true" /> Run AgentFuse self-check
            </button>
          </>
        ) : null}
        {broken ? (
          <button
            className="qodex-button"
            disabled={busy !== null}
            onClick={() => void runRuntimeAction("Repair runtime", () => bridge.provision())}
          >
            <Wrench size={13} aria-hidden="true" /> Repair runtime
          </button>
        ) : null}
        {(ready || broken) ? (
          <button
            className="qodex-button qodex-button-danger"
            disabled={busy !== null}
            onClick={() => void runRuntimeAction("Remove runtime", () => bridge.remove())}
          >
            <Trash2 size={13} aria-hidden="true" /> Remove runtime
          </button>
        ) : null}
        {busy ? <span className="managed-runtime-busy">{busy}...</span> : null}
      </div>

      {selfCheck ? (
        <div className="managed-runtime-result" role="status">
          <CheckCircle2 size={14} aria-hidden="true" />
          Bridge and canonical import verified. Allow={selfCheck.allowDecision};
          deny={selfCheck.denyDecision}; deny dispatches={selfCheck.denyHandlerInvocations}.
        </div>
      ) : null}
      {error ? <div className="managed-runtime-error" role="alert">{error}</div> : null}

      {PROOF_ENABLED && ready ? (
        <div className="agentfuse-proof">
          <div className="agentfuse-proof-heading">
            <FlaskConical size={14} aria-hidden="true" />
            <div>
              <strong>Development proof action</strong>
              <span>Uses one private in-memory counter; no project path or command is accepted.</span>
            </div>
          </div>
          {prepared ? (
            <div className="agentfuse-proof-approval">
              <div>
                <strong>{prepared.proposal.title}</strong>
                <span>
                  Approve this exact {prepared.fixture} fixture proposal. AgentFuse decides
                  before dispatch.
                </span>
              </div>
              <button
                className="qodex-button"
                disabled={busy !== null}
                onClick={() => void approveProof()}
              >
                Approve and run proof
              </button>
            </div>
          ) : (
            <div className="managed-runtime-actions">
              <button
                className="qodex-button qodex-button-secondary"
                disabled={busy !== null}
                onClick={() => void prepareProof("allow")}
              >
                Prepare allow proof
              </button>
              <button
                className="qodex-button qodex-button-secondary"
                disabled={busy !== null}
                onClick={() => void prepareProof("deny")}
              >
                Prepare deny proof
              </button>
            </div>
          )}
          {proofResult ? (
            <div className="managed-runtime-result" role="status">{proofResult}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RuntimeCopy() {
  return (
    <div className="managed-runtime-copy">
      <p>
        KerniQ installs a private Python runtime used only by KerniQ. It does not
        change your system Python or project environment.
      </p>
      <p>
        AgentFuse evaluates the proposed action before KerniQ dispatches it. An
        allow decision does not mean the action succeeded.
      </p>
    </div>
  );
}

function RuntimeDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mono-value">{value}</dd>
    </div>
  );
}

function abbreviate(value: string | undefined): string {
  return value ? value.slice(0, 12) : "Unavailable";
}

function formatVerification(value: string | null | undefined): string {
  if (!value) return "Never";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric * 1_000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function messageOf(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  if (typeof cause === "string" && cause.trim()) return cause;
  return fallback;
}
