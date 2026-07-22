import type { AgentTimelineEntry } from "@qodex/agent-runtime";
import { DiffViewer } from "./DiffViewer";
import { useRuntimeContext } from "./AppShell";

export function AgentTimeline() {
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
  const pendingCommand = agentTask?.pendingCommand;

  return (
    <div className="panel-inner agent-workspace" data-testid="agent-timeline">
      <div className="agent-workspace-header">
        <div>
          <span className="panel-header">Agent Workspace</span>
          {agentTask ? <span className="agent-state" data-testid="agent-state">{agentTask.status}</span> : null}
        </div>
        {isRunning ? (
          <button className="qodex-button qodex-button-secondary agent-stop" data-testid="stop-agent" onClick={stopTask}>
            Stop
          </button>
        ) : null}
      </div>

      {agentModeNotice ? (
        <div className="agent-mode-notice" data-testid="agent-mode-notice">{agentModeNotice}</div>
      ) : null}

      <div className="agent-timeline-scroll">
        {agentTask?.timeline.map((entry) => <TimelineCard key={entry.id} entry={entry} />)}

        {pendingCommand ? (
          <div className="agent-card command-approval-card" data-testid="command-approval">
            <div className="agent-card-topline">
              <strong>Command approval required</strong>
              <span className="agent-card-status status-pending">Pending</span>
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
          </div>
        ) : null}

        {!agentTask && hasContent ? (
          <div className="agent-legacy-response text-code">{streamedText}</div>
        ) : null}

        {!hasContent ? (
          <div className="empty-state agent-empty-state">
            <div className="empty-state-icon">K</div>
            <div className="empty-state-text">Type a prompt and click <strong>Run</strong> to start.</div>
            <div className="text-caption">Agent inspection, approvals, command evidence, and results appear here.</div>
          </div>
        ) : null}
      </div>

      <DiffViewer />
    </div>
  );
}

function TimelineCard({ entry }: { entry: AgentTimelineEntry }) {
  return (
    <article className={`agent-card agent-card-${entry.kind}`} data-testid={`timeline-${entry.kind}`}>
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
    </article>
  );
}
