import { useRuntimeContext } from "./AppShell";

function SectionDivider() {
  return (
    <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 0 16px" }} />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function SectionValue({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
      {children}
    </div>
  );
}

function SectionValueMuted({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.35)" }}>
      {children}
    </div>
  );
}

export function ContextPanel() {
  const { selectedFileCount, selectedFileSize, projectName, lastBundle, estimatedTokens } = useRuntimeContext();

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
    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 0, overflow: "auto", flex: 1 }}>
      {/* Model */}
      <div>
        <SectionLabel>Model</SectionLabel>
        <SectionValue>DeepSeek V4 Pro</SectionValue>
      </div>

      <SectionDivider />

      {/* Context */}
      <div>
        <SectionLabel>Context Sources</SectionLabel>
        {sources.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            {sources.map((s) => (
              <div
                key={s.name}
                style={{
                  fontSize: 13,
                  color: s.active ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.18)",
                  fontWeight: s.active ? 500 : 400,
                }}
              >
                {s.name}
              </div>
            ))}
          </div>
        ) : (
          <SectionValueMuted>
            Run a prompt to generate context
          </SectionValueMuted>
        )}
      </div>

      <SectionDivider />

      {/* Selected Files */}
      <div>
        <SectionLabel>Selected Files</SectionLabel>
        {selectedFileCount > 0 ? (
          <SectionValue>
            {selectedFileCount} file{selectedFileCount !== 1 ? "s" : ""}
            <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
              {formatSize(selectedFileSize)}
            </span>
          </SectionValue>
        ) : (
          <SectionValueMuted>
            {projectName ? "Select files from the project tree." : "No project opened."}
          </SectionValueMuted>
        )}
      </div>

      <SectionDivider />

      {/* Tokens */}
      <div>
        <SectionLabel>Tokens</SectionLabel>
        <SectionValueMuted>
          {estimatedTokens > 0 ? `${estimatedTokens.toLocaleString()} / 128K` : "0 / 128K"}
        </SectionValueMuted>
        <div style={{ height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 1, overflow: "hidden", marginTop: 6 }}>
          <div style={{ width: estimatedTokens > 0 ? `${Math.min((estimatedTokens / 128000) * 100, 100)}%` : "0%", height: "100%", background: "#5B8CFF", borderRadius: 1, transition: "width 220ms ease" }} />
        </div>
      </div>

      <SectionDivider />

      {/* Mode */}
      <div>
        <SectionLabel>Mode</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4FFFC2", flexShrink: 0 }} />
          <SectionValue>Review Mode</SectionValue>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", marginTop: 2, paddingLeft: 11 }}>
          Generate diff · User approves writes
        </div>
      </div>

      <SectionDivider />

      {/* Git */}
      <div>
        <SectionLabel>Git</SectionLabel>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>main</span>
          <span style={{ color: "rgba(255,255,255,0.10)" }}>·</span>
          <span>0 changed</span>
        </div>
      </div>
    </div>
  );
}
