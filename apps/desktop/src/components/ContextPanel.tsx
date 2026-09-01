import { useRuntimeContext } from "./AppShell";
import { useProviderContext } from "./ProviderContext";
import { StatusIndicator } from "./WorkbenchPrimitives";

export function ContextPanel() {
  const {
    controlPlaneMode,
    controlPlaneView,
    selectedFileCount,
    selectedFileSize,
    projectName,
    lastBundle,
    estimatedTokens,
  } = useRuntimeContext();
  const { config } = useProviderContext();

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const sources = lastBundle
    ? [
        { name: "Rules", active: lastBundle.sources.projectRules.length > 0 },
        { name: "Memory", active: lastBundle.sources.memory.length > 0 },
        { name: "Metadata", active: lastBundle.sources.projectMetadata.length > 0 },
        { name: "Files", active: lastBundle.sources.selectedFiles.length > 0 },
      ]
    : [];

  return (
    <aside className="context-inspector" data-testid="context-inspector" aria-label="Context inspector">
      <header className="inspector-header">
        <h2>Inspector</h2>
        <span>Current task context</span>
      </header>

      {controlPlaneMode === "supervisor" ? (
        <section className="inspector-section">
          <h3>Context scope</h3>
          <div className="inspector-row">
            <span>Authorized repository</span>
            <strong>{projectName ?? "Not opened"}</strong>
          </div>
          <div className="inspector-row">
            <span>Prompt routing</span>
            <strong>Backend-managed</strong>
          </div>
        </section>
      ) : (
        <>
          <section className="inspector-section">
            <h3>Selected context</h3>
            <div className="inspector-row">
              <span>Project</span>
              <strong>{projectName ?? "Not opened"}</strong>
            </div>
            <div className="inspector-row">
              <span>Files</span>
              <strong>{selectedFileCount > 0
                ? `${selectedFileCount} · ${formatSize(selectedFileSize)}`
                : "None selected"}</strong>
            </div>
            {sources.length > 0 ? (
              <div className="inspector-sources">
                {sources.map((s) => (
                  <StatusIndicator key={s.name} label={s.name} tone={s.active ? "success" : "neutral"} />
                ))}
              </div>
            ) : (
              <p className="inspector-empty-copy">Run a prompt to assemble context sources.</p>
            )}
          </section>

          <section className="inspector-section">
            <h3>Context budget</h3>
            <div className="inspector-row">
              <span>Estimated tokens</span>
              <strong>{estimatedTokens > 0 ? estimatedTokens.toLocaleString() : "0"}</strong>
            </div>
            <div className="token-meter" aria-label={`${estimatedTokens} of 128000 estimated tokens`}>
              <span style={{ width: `${Math.min((estimatedTokens / 128000) * 100, 100)}%` }} />
            </div>
            <span className="inspector-limit">128K limit</span>
          </section>
        </>
      )}

      <section className="inspector-section">
        <h3>Runtime</h3>
        {controlPlaneMode === "supervisor" ? (
          <>
            <div className="inspector-row"><span>Runtime</span><strong>Supervisor</strong></div>
            <div className="inspector-row"><span>Agents</span><strong>Codex + DSH</strong></div>
            {controlPlaneView?.workers.map((worker) => (
              <div className="inspector-worker" key={worker.id}>
                <div className="inspector-row"><span>{worker.label}</span><strong>{worker.status}</strong></div>
                <div className="inspector-row"><span>Model</span><strong>{worker.model}</strong></div>
                <div className="inspector-row"><span>Governance</span><strong>{worker.tier} · {worker.mode.replace(/_/g, " ")}</strong></div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="inspector-row">
              <span>Provider</span>
              <strong>{config.providerId ?? "Not configured"}</strong>
            </div>
            <div className="inspector-row">
              <span>Model</span>
              <strong>{config.modelId ?? config.manualModelId ?? "Not selected"}</strong>
            </div>
          </>
        )}
        <div className="inspector-row">
          <span>Access</span>
          <strong>{projectName ? "Project bound" : "No project"}</strong>
        </div>
        <StatusIndicator
          label={controlPlaneMode === "supervisor" ? "Supervisor mode" : "Review Mode · approval required"}
          tone="accent"
        />
      </section>

      {controlPlaneMode === "single" ? (
        <section className="inspector-section">
          <h3>Git</h3>
          <div className="inspector-row"><span>Execution facts</span><strong>Unavailable</strong></div>
        </section>
      ) : null}
    </aside>
  );
}
