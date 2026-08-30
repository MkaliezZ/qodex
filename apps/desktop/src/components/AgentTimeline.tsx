import type { AgentTimelineEntry } from "@qodex/agent-runtime";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileDiff,
  Info,
  PanelRightOpen,
  Terminal,
  Wrench,
} from "lucide-react";
import type { RefObject } from "react";
import type { ControlPlaneViewModel } from "../controlPlane/controlPlaneViewModel";
import { DiffViewer } from "./DiffViewer";
import { useRuntimeContext } from "./AppShell";

export function AgentTimeline({
  inspectorTriggerRef,
  onOpenInspector,
}: {
  inspectorTriggerRef: RefObject<HTMLButtonElement>;
  onOpenInspector: () => void;
}) {
  const {
    agentModeNotice,
    agentTask,
    approveCommand,
    controlPlaneError,
    controlPlaneIsRunning,
    controlPlaneView,
    denyCommand,
    isRunning,
    stopTask,
    streamedText,
  } = useRuntimeContext();
  const hasContent = streamedText.length > 0
    || Boolean(agentTask?.timeline.length)
    || controlPlaneView !== null;
  const pendingCommand = agentTask?.status === "WaitingForCommandApproval"
    ? agentTask.pendingCommand
    : null;
  return (
    <div className="panel-inner agent-workspace" data-testid="agent-timeline">
      <div className="agent-workspace-header">
        <div>
          <span className="panel-header">Agent activity</span>
          {agentTask ? <span className="agent-state" data-testid="agent-state">{agentTask.status}</span> : null}
          {controlPlaneView ? <span className="agent-state" data-testid="control-plane-state">{controlPlaneView.status}</span> : null}
        </div>
        <div className="agent-header-actions">
          <button
            ref={inspectorTriggerRef}
            type="button"
            className="compact-inspector-trigger"
            data-testid="open-context-inspector"
            aria-label="Open context inspector"
            onClick={onOpenInspector}
          >
            <PanelRightOpen size={14} aria-hidden="true" />
            Inspector
          </button>
          {isRunning && !controlPlaneIsRunning ? (
            <button className="qodex-button qodex-button-secondary agent-stop" data-testid="stop-agent" onClick={stopTask}>
              Stop
            </button>
          ) : null}
        </div>
      </div>

      {agentModeNotice ? (
        <div className="agent-mode-notice" data-testid="agent-mode-notice">{agentModeNotice}</div>
      ) : null}
      {controlPlaneError ? (
        <div className="agent-mode-notice is-error" data-testid="control-plane-error">{controlPlaneError}</div>
      ) : null}

      <div className="agent-timeline-scroll">
        {pendingCommand ? (
          <section className="decision-surface command-approval-card" data-testid="command-approval">
            <div className="agent-card-topline">
              <div className="decision-heading">
                <Terminal size={16} aria-hidden="true" />
                <div><strong>Command approval required</strong><span>Review this one-time execution request.</span></div>
              </div>
            </div>
            <div className="command-preview">
              <code data-testid="command-executable">{pendingCommand.command.executable}</code>
              <code data-testid="command-args">{pendingCommand.command.args.join(" ")}</code>
            </div>
            <dl className="command-metadata">
              <div><dt>Working directory</dt><dd>{pendingCommand.command.cwd}</dd></div>
              <div><dt>Source</dt><dd>{pendingCommand.command.source}</dd></div>
              <div><dt>Category</dt><dd>{pendingCommand.command.category}</dd></div>
            </dl>
            <p>Project scripts may have side effects. This approval applies only to this execution.</p>
            <div className="command-actions">
              <button className="qodex-button qodex-button-secondary" data-testid="deny-command" onClick={denyCommand}>Deny</button>
              <button className="qodex-button" data-testid="approve-command" onClick={approveCommand}>Approve and run</button>
            </div>
          </section>
        ) : null}

        {controlPlaneView ? <ControlPlaneTimeline view={controlPlaneView} /> : null}

        {!controlPlaneView ? <TimelineHistory entries={agentTask?.timeline ?? []} /> : null}

        {!agentTask && !controlPlaneView && hasContent ? (
          <div className="agent-legacy-response text-code">{streamedText}</div>
        ) : null}

        {!hasContent ? (
          <div className="agent-empty-state">
            <div className="agent-empty-copy">
              <strong>No task is running.</strong>
              <p>Describe what you want KerniQ to inspect or change.</p>
            </div>
            <div className="agent-examples" aria-label="Example tasks">
              <span>Inspect the project structure</span>
              <span>Review a failing test</span>
              <span>Propose a focused patch</span>
            </div>
          </div>
        ) : null}
      </div>

      <DiffViewer />
    </div>
  );
}

function ControlPlaneTimeline({ view }: { view: ControlPlaneViewModel }) {
  return (
    <section className="control-plane-task" data-testid="control-plane-task">
      <article className="timeline-entry is-important control-plane-supervisor">
        <div className="timeline-entry-icon" aria-hidden="true"><Wrench size={14} /></div>
        <div className="timeline-entry-content">
          <div className="agent-card-topline"><strong>Supervisor</strong><span className="agent-card-status">{view.status}</span></div>
          <p>Task: {view.title}</p>
        </div>
      </article>
      <div className="control-plane-workers">
        {view.workers.map((worker) => (
          <article key={worker.id} className="timeline-entry control-plane-worker" data-testid={`control-plane-worker-${worker.id}`}>
            <div className="timeline-entry-icon" aria-hidden="true"><Circle size={14} /></div>
            <div className="timeline-entry-content">
              <div className="agent-card-topline">
                <strong>{worker.label}</strong>
                <span className={`governance-tier tier-${worker.tier.toLowerCase()}`}>{worker.tier}</span>
                <span className="agent-card-status">{worker.status}</span>
              </div>
              <p>{worker.model} · {worker.mode.replace(/_/g, " ")}</p>
              {worker.evidence.map((evidence) => (
                <div key={`${worker.id}:${evidence.toolName}:${evidence.outcome}`} className="governance-evidence-card">
                  <div className="agent-card-topline"><strong>Tool: {evidence.toolName}</strong><span>{evidence.outcome}</span></div>
                  <dl>
                    <div><dt>Decision</dt><dd>{evidence.decision}</dd></div>
                    <div><dt>Dispatch</dt><dd>{evidence.dispatch}</dd></div>
                    <div><dt>Execution</dt><dd>{evidence.execution}</dd></div>
                    <div><dt>Evidence</dt><dd>{evidence.evidence}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      {view.reconciliation ? (
        <article className="timeline-entry is-important control-plane-result">
          <div className="timeline-entry-icon" aria-hidden="true"><CheckCircle2 size={14} /></div>
          <div className="timeline-entry-content">
            <div className="agent-card-topline"><strong>Supervisor result</strong><span>{view.reconciliation.classification}</span></div>
            <p>{view.reconciliation.summary}</p>
          </div>
        </article>
      ) : null}
    </section>
  );
}

export function TimelineHistory({ entries }: { entries: AgentTimelineEntry[] }) {
  return <>{entries.map((entry) => <TimelineCard key={entry.id} entry={entry} />)}</>;
}

export function TimelineCard({ entry }: { entry: AgentTimelineEntry }) {
  const Icon = timelineIcon(entry.kind);
  const important = entry.kind === "patch_proposal"
    || entry.kind === "command_output"
    || entry.kind === "failure"
    || entry.kind === "limit"
    || entry.kind === "final";
  return (
    <article
      className={`timeline-entry timeline-entry-${entry.kind}${important ? " is-important" : ""}`}
      data-testid={`timeline-${entry.kind}`}
    >
      <div className="timeline-entry-icon" aria-hidden="true"><Icon size={14} strokeWidth={1.8} /></div>
      <div className="timeline-entry-content">
        <div className="agent-card-topline">
          <strong>{entry.title}</strong>
          <span className={`agent-card-status status-${entry.status}`}>{entry.status}</span>
        </div>
        <p>{entry.summary}</p>
        {entry.detail ? (
          <details>
            <summary>View bounded result</summary>
            <pre>{entry.detail}</pre>
          </details>
        ) : null}
        {entry.durationMs !== undefined ? <span className="agent-duration">{entry.durationMs} ms</span> : null}
      </div>
    </article>
  );
}

function timelineIcon(kind: AgentTimelineEntry["kind"]) {
  switch (kind) {
    case "tool_request": return Wrench;
    case "tool_result": return Info;
    case "patch_proposal": return FileDiff;
    case "command_output": return Terminal;
    case "failure":
    case "limit": return AlertTriangle;
    case "final": return CheckCircle2;
    default: return Circle;
  }
}
