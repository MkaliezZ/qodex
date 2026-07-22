import { AgentToolRegistry, type AgentPatchProposal, type ProjectCommandDefinition, type ProjectCommandRunner } from "@qodex/agent-runtime";
import { DiffEngine } from "@qodex/diff-engine";
import { ProjectRuntime } from "@qodex/project-runtime";
import type { ProjectedSessionState, SessionEntry, SessionStatus, SessionSummary } from "@qodex/session-runtime";
import { useEffect, useMemo, useState } from "react";
import { TimelineHistory } from "../components/AgentTimeline";
import { useSessionContext } from "../components/SessionContext";
import { openProjectDirectory } from "../platform/openProjectDirectory";
import { projectBindingIdentity } from "../platform/projectBinding";
import { commandsMatch, recoveredCommand, recoveredPatch } from "../session/recoveryActions";
import { saveRedactedSessionExport } from "../session/exportSession";
import { safeRecoveredCommandResult } from "../session/agentSessionRecorder";
import { sessionEntriesToTimeline } from "../session/sessionTimeline";

type SessionFilter = "All" | "Active" | "Recovery Required" | "Completed" | "Failed" | "Cancelled";
type RecoveryAvailability = "reauthorize" | "ready" | "stale" | "changed" | "mismatch" | "unrecoverable";

interface SessionDetail {
  entries: SessionEntry[];
  projection: ProjectedSessionState;
}

interface RecoveryTarget {
  availability: RecoveryAvailability;
  patch: AgentPatchProposal | null;
  command: ProjectCommandDefinition | null;
  diff: DiffEngine | null;
  runner: ProjectCommandRunner | null;
  message: string;
}

const FILTERS: SessionFilter[] = ["All", "Active", "Recovery Required", "Completed", "Failed", "Cancelled"];

export function SessionsView() {
  const { runtime, sessions, persistence, ready, error, refreshSessions } = useSessionContext();
  const [filter, setFilter] = useState<SessionFilter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [recovery, setRecovery] = useState<RecoveryTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = sessions.find((session) => session.id === selectedId) ?? null;
  const filtered = useMemo(() => sessions.filter((session) => matchesFilter(session.status, filter)), [filter, sessions]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    void Promise.all([runtime.loadActivePath(selectedId), runtime.projectCurrentState(selectedId)])
      .then(([entries, projection]) => {
        if (active) setDetail({ entries, projection });
      })
      .catch((cause) => {
        if (active) setNotice(cause instanceof Error ? cause.message : "Session detail is unavailable.");
      });
    return () => { active = false; };
  }, [runtime, selectedId, sessions]);

  const selectSession = (sessionId: string) => {
    setSelectedId(sessionId);
    setRecovery(null);
    setNotice(null);
  };

  const reauthorize = async () => {
    if (!selected || !detail?.projection.pendingAction || !selected.projectBindingId) return;
    setBusy(true);
    setNotice(null);
    try {
      const opened = await openProjectDirectory();
      if (!opened) return;
      const identity = await projectBindingIdentity(opened);
      const matches = await runtime.verifyProjectBinding(selected.projectBindingId, {
        privateRootPath: identity.privateRootPath,
        projectFingerprint: identity.projectFingerprint,
      });
      if (!matches) {
        setRecovery(emptyRecovery("mismatch", "This is not the project bound to the recovered session. No action is available."));
        return;
      }
      const project = new ProjectRuntime({ adapter: opened.adapter });
      await project.openProject(opened.name);
      await runtime.upsertProjectBinding({
        ...identity,
        bindingId: selected.projectBindingId,
        lastOpenedAt: new Date().toISOString(),
      });
      const pending = detail.projection.pendingAction;
      if (pending.kind === "patch") {
        const patch = recoveredPatch(pending.payload);
        const proposalEntry = detail.entries.find((entry) => entry.id === pending.proposalEntryId);
        if (!patch || proposalEntry?.safeMetadata.recoverable === false) {
          setRecovery(emptyRecovery("unrecoverable", "Sensitive or malformed patch evidence can be inspected but cannot be reapplied."));
          return;
        }
        const diff = new DiffEngine(project.fileAccess, project.fileAccess);
        const conflicts = await diff.validateProposal(patch);
        if (conflicts.length > 0) {
          setRecovery({
            availability: "stale",
            patch,
            command: null,
            diff,
            runner: null,
            message: "Target files changed after the proposal. Apply is unavailable and no files were written.",
          });
          return;
        }
        setRecovery({
          availability: "ready",
          patch,
          command: null,
          diff,
          runner: null,
          message: "Matching project verified and target files reread. Review the patch and approve it again.",
        });
        return;
      }
      if (pending.kind === "command") {
        const stored = recoveredCommand(pending.payload);
        const runner = opened.commandRunner
          ?? (import.meta.env.DEV ? window.__kerniqTestCommandRunner ?? null : null);
        if (!stored || !runner) {
          setRecovery(emptyRecovery("unrecoverable", "The recovered command cannot run in this environment."));
          return;
        }
        const registry = new AgentToolRegistry({
          listFiles: () => project.index?.files.map((file) => ({ path: file.path, size: file.size })) ?? [],
          readFile: (path) => project.fileAccess.readFile(path),
          commandExecutionAvailable: true,
        });
        const resolved = await registry.resolveCommand({
          id: pending.actionId,
          name: "run_project_command",
          arguments: { commandId: stored.id },
        });
        if (!resolved.command || !commandsMatch(stored, resolved.command)) {
          setRecovery(emptyRecovery("changed", "The cataloged command is absent or changed. Approval is unavailable and no process was started."));
          return;
        }
        setRecovery({
          availability: "ready",
          patch: null,
          command: resolved.command,
          diff: null,
          runner,
          message: "Matching project and command catalog verified. Review the command and approve it again.",
        });
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Project reauthorization failed.");
    } finally {
      setBusy(false);
    }
  };

  const approveRecovered = async () => {
    if (!selected || !detail?.projection.pendingAction || recovery?.availability !== "ready") return;
    setBusy(true);
    setNotice(null);
    const pending = detail.projection.pendingAction;
    const approvalId = crypto.randomUUID();
    try {
      if (pending.kind === "patch" && recovery.patch && recovery.diff) {
        await runtime.appendEntry(selected.id, {
          type: "PATCH_APPROVED",
          payload: { actionId: pending.actionId },
          safeMetadata: { actionId: pending.actionId, approvalId },
        });
        const results = await recovery.diff.apply(recovery.patch);
        const success = results.length === recovery.patch.files.length
          && results.every((result) => result.success && result.readbackVerified === true);
        await runtime.appendEntry(selected.id, {
          type: success ? "PATCH_APPLIED" : "ACTION_FAILED",
          payload: {
            actionId: pending.actionId,
            results: results.map((result) => ({
              path: result.path,
              success: result.success,
              readbackVerified: result.readbackVerified === true,
              ...(result.code ? { code: result.code } : {}),
            })),
          },
          safeMetadata: { actionId: pending.actionId, approvalId, executionStatus: success ? "success" : "failed" },
        });
        if (!success) throw new Error("The recovered patch failed verified application.");
      } else if (pending.kind === "command" && recovery.command && recovery.runner) {
        await runtime.appendEntry(selected.id, {
          type: "COMMAND_APPROVED",
          payload: { actionId: pending.actionId },
          safeMetadata: { actionId: pending.actionId, approvalId, toolCallId: pending.actionId },
        });
        const executionReceiptId = crypto.randomUUID();
        await runtime.appendEntry(selected.id, {
          type: "COMMAND_STARTED",
          payload: { actionId: pending.actionId, commandId: recovery.command.id },
          safeMetadata: {
            actionId: pending.actionId,
            approvalId,
            toolCallId: pending.actionId,
            executionReceiptId,
            executionStatus: "running",
          },
        });
        const result = await recovery.runner.run(recovery.command, crypto.randomUUID());
        await runtime.appendEntry(selected.id, {
          type: "COMMAND_COMPLETED",
          payload: { actionId: pending.actionId, ...safeRecoveredCommandResult(result) },
          safeMetadata: {
            actionId: pending.actionId,
            approvalId,
            toolCallId: pending.actionId,
            executionReceiptId,
            executionStatus: result.cancelled ? "cancelled" : "completed",
          },
        });
      } else {
        throw new Error("The recovered action is not available.");
      }
      await runtime.appendEntry(selected.id, { type: "RECOVERY_COMPLETED", payload: { actionId: pending.actionId } });
      await runtime.appendEntry(selected.id, {
        type: "SESSION_COMPLETED",
        payload: { reason: "Recovered action completed after explicit reapproval. Provider continuation was not resumed." },
      });
      setRecovery(null);
      setNotice("Recovered action completed after explicit reapproval.");
      await refreshSessions();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Recovered action failed.";
      setNotice(message);
      try {
        const current = await runtime.projectCurrentState(selected.id);
        if (!["Completed", "Failed", "Cancelled", "LimitReached"].includes(current.status)) {
          await runtime.appendEntry(selected.id, { type: "SESSION_FAILED", payload: { reason: message } });
        }
      } catch {
        // Preserve the original recovery error if the persistence layer is also unavailable.
      }
      await refreshSessions();
    } finally {
      setBusy(false);
    }
  };

  const abandon = async () => {
    if (!selected) return;
    await runtime.appendEntry(selected.id, {
      type: "SESSION_CANCELLED",
      payload: { reason: "Marked abandoned by the user after restart." },
    });
    setRecovery(null);
    await refreshSessions();
  };

  const remove = async (session: SessionSummary) => {
    if (!window.confirm(`Delete local KerniQ history for “${session.title}”? Project files and credentials are not affected.`)) return;
    await runtime.deleteSession(session.id);
    if (selectedId === session.id) setSelectedId(null);
    await refreshSessions();
  };

  const exportSession = async (session: SessionSummary) => {
    const exported = await runtime.exportRedactedSession(session.id);
    const saved = await saveRedactedSessionExport(session.title, exported);
    setNotice(saved ? "Redacted session JSON exported." : "Export cancelled.");
  };

  return (
    <div className="sessions-surface" data-testid="sessions-view">
      <header className="sessions-header">
        <div>
          <span className="eyebrow">Universal Session Ledger</span>
          <h1>Sessions</h1>
          <p>Local evidence, approval history, and restart-safe recovery.</p>
        </div>
        <div className={`persistence-badge ${persistence?.persistent ? "is-persistent" : "is-memory"}`} data-testid="session-persistence-status">
          {persistence?.persistent
            ? "SQLite local history"
            : persistence
              ? "Browser memory only"
              : ready
                ? "Persistence unavailable"
                : "Checking persistence"}
        </div>
      </header>

      <div className="session-persistence-note">
        {error ?? persistence?.message ?? (ready ? "Session storage ready." : "Initializing session storage...")}
      </div>

      <div className="session-filters" role="tablist" aria-label="Session status filters">
        {FILTERS.map((candidate) => (
          <button
            key={candidate}
            className={filter === candidate ? "is-active" : ""}
            data-testid={`session-filter-${candidate.toLowerCase().replace(/ /g, "-")}`}
            onClick={() => setFilter(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>

      <div className="sessions-layout">
        <section className="session-list" data-testid="session-list">
          {filtered.length === 0 ? (
            <div className="sessions-empty">No sessions match this filter.</div>
          ) : filtered.map((session) => (
            <article key={session.id} className={`session-row ${selectedId === session.id ? "is-selected" : ""}`} data-testid="session-row">
              <button className="session-row-main" onClick={() => selectSession(session.id)}>
                <div className="session-row-title"><strong>{session.title}</strong><StatusPill status={session.status} /></div>
                <div className="session-row-meta">
                  <span>{session.projectDisplayName ?? "No project"}</span>
                  <span>{[session.providerId, session.modelId].filter(Boolean).join(" / ") || "Provider unavailable"}</span>
                  <span>{formatTime(session.updatedAt)}</span>
                </div>
                <div className="session-row-counts">
                  <span>{session.patchCount} patches</span>
                  <span>{session.commandCount} commands</span>
                  <span>{lastTestResult(session)}</span>
                </div>
              </button>
              <div className="session-row-actions">
                <button onClick={() => selectSession(session.id)}>{session.status === "RecoveryRequired" || session.status === "Interrupted" ? "Resume recovery" : "Open"}</button>
                <button data-testid="export-session" onClick={() => void exportSession(session)}>Export redacted JSON</button>
                <button data-testid="delete-session" className="danger" onClick={() => void remove(session)}>Delete local history</button>
              </div>
            </article>
          ))}
        </section>

        <section className="session-detail" data-testid="session-detail">
          {!selected || !detail ? (
            <div className="sessions-empty">Open a session to inspect its reconstructed active path.</div>
          ) : (
            <>
              <div className="session-detail-header">
                <div><span className="eyebrow">Active path</span><h2>{selected.title}</h2></div>
                <StatusPill status={detail.projection.status} />
              </div>
              {detail.projection.recoveryRequirement ? (
                <div className="recovery-banner" data-testid="recovery-banner">
                  <strong>{recoveryTitle(detail.projection)}</strong>
                  <p>{recovery?.message ?? recoveryInstruction(detail.projection)}</p>
                  <div className="recovery-actions">
                    {detail.projection.recoveryRequirement.reason !== "interrupted"
                      && (!recovery || recovery.availability === "reauthorize") ? (
                      <button className="qodex-button" data-testid="reauthorize-project" disabled={busy} onClick={() => void reauthorize()}>
                        Reopen project
                      </button>
                    ) : null}
                    {recovery?.availability === "ready" ? (
                      <button className="qodex-button" data-testid="approve-recovered-action" disabled={busy} onClick={() => void approveRecovered()}>
                        {recovery.patch ? "Review and apply patch" : "Review and run command"}
                      </button>
                    ) : null}
                    <button className="qodex-button qodex-button-secondary" data-testid="abandon-session" disabled={busy} onClick={() => void abandon()}>
                      Mark task abandoned
                    </button>
                  </div>
                </div>
              ) : null}
              {notice ? <div className="session-notice" data-testid="session-notice">{notice}</div> : null}
              <div className="session-timeline" data-testid="reconstructed-timeline">
                <TimelineHistory entries={sessionEntriesToTimeline(detail.entries)} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: SessionStatus }) {
  return <span className={`session-status status-${status.toLowerCase()}`}>{status}</span>;
}

function matchesFilter(status: SessionStatus, filter: SessionFilter): boolean {
  if (filter === "All") return true;
  if (filter === "Active") return status === "Active";
  if (filter === "Recovery Required") return status === "RecoveryRequired" || status === "Interrupted";
  return status === filter;
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function lastTestResult(session: SessionSummary): string {
  const result = session.lastCommandResult;
  if (typeof result === "object" && result !== null && !Array.isArray(result) && typeof result.summary === "string") {
    return result.summary;
  }
  return "No test result";
}

function recoveryTitle(projection: ProjectedSessionState): string {
  if (projection.recoveryRequirement?.reason === "patch_reapproval") return "Patch approval expired at restart";
  if (projection.recoveryRequirement?.reason === "command_reapproval") return "Command approval expired at restart";
  return "Execution was interrupted";
}

function recoveryInstruction(projection: ProjectedSessionState): string {
  if (projection.recoveryRequirement?.reason === "patch_reapproval") return "Reopen the matching project, reread target files, then review the patch again.";
  if (projection.recoveryRequirement?.reason === "command_reapproval") return "Reopen the matching project, rediscover the command catalog, then review the command again.";
  return "No provider, patch, or command was restarted. Review the evidence or mark the task abandoned.";
}

function emptyRecovery(availability: RecoveryAvailability, message: string): RecoveryTarget {
  return { availability, patch: null, command: null, diff: null, runner: null, message };
}
