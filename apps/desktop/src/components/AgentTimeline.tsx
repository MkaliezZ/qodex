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
    denyCommand,
    isRunning,
    stopTask,
    streamedText,
  } = useRuntimeContext();
  const hasContent = streamedText.length > 0 || Boolean(agentTask?.timeline.length);
  const pendingCommand = agentTask?.status === "WaitingForCommandApproval"
    ? agentTask.pendingCommand
    : null;
  return (
    <div className="panel-inner agent-workspace" data-testid="agent-timeline">
      <div className="agent-workspace-header">
        <div>
          <span className="panel-header">Agent activity</span>
          {agentTask ? <span className="agent-state" data-testid="agent-state">{agentTask.status}</span> : null}
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
          {isRunning ? (
            <button className="qodex-button qodex-button-secondary agent-stop" data-testid="stop-agent" onClick={stopTask}>
              Stop
            </button>
          ) : null}
        </div>
      </div>

      {agentModeNotice ? (
        <div className="agent-mode-notice" data-testid="agent-mode-notice">{agentModeNotice}</div>
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

        <TimelineHistory entries={agentTask?.timeline ?? []} />

        {!agentTask && hasContent ? (
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
