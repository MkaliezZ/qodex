import { DiffViewer } from "./DiffViewer";
import { useRuntimeContext } from "./AppShell";

export function AgentTimeline() {
  const { streamedText, isRunning } = useRuntimeContext();

  const hasContent = streamedText.length > 0;

  return (
    <div className="panel-inner" style={{ gap: 12, padding: "12px 16px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 6,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span
          className="panel-header"
          style={{ padding: 0, border: "none" }}
        >
          Agent Workspace
        </span>
        {isRunning && (
          <span
            className="model-badge model-badge-cyan"
            style={{ fontSize: 10, padding: "2px 8px", gap: 4 }}
          >
            <span className="status-dot status-dot-active" />
            Streaming...
          </span>
        )}
      </div>

      {/* Content area */}
      {hasContent ? (
        <div
          className="text-code"
          style={{
            flex: 1,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "rgba(255,255,255,0.80)",
            fontSize: 13,
            lineHeight: 1.6,
            padding: "8px 4px",
          }}
        >
          {streamedText}
          {isRunning && (
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 16,
                background: "#48D6FF",
                marginLeft: 2,
                animation: "blink 1s step-end infinite",
              }}
            />
          )}
        </div>
      ) : (
        /* Empty state */
        <div
          className="empty-state"
          style={{ flex: 1, padding: "32px 16px" }}
        >
          <div className="empty-state-icon">💠</div>
          <div className="empty-state-text">
            Type a prompt and click <strong>Run</strong> to start.
          </div>
          <div className="text-caption" style={{ marginTop: 2 }}>
            Agent responses will appear here.
          </div>
        </div>
      )}

      {/* Diff Viewer placeholder */}
      <DiffViewer />
    </div>
  );
}
