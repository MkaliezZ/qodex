import { useRuntimeContext } from "../components/AppShell";

export function FilesView() {
  const { projectName, fileTree, openProject } = useRuntimeContext();

  if (!projectName || !fileTree) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 32 }}>
        <div className="empty-state-icon">📁</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.35)" }}>No project opened</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", textAlign: "center" }}>
          Open a project directory to browse files.
        </div>
        <button className="qodex-button" onClick={openProject} style={{ marginTop: 8, fontSize: 13 }}>
          Open Project
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.30)", marginBottom: 8, letterSpacing: "0.05em" }}>
        {projectName}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {fileTree.children.map((child) => {
          const renderNode = (node: typeof child, depth = 0) => (
            <div key={node.file.path}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 0 3px",
                  paddingLeft: 8 + depth * 14,
                  cursor: "default",
                  fontSize: 13,
                  color: node.selected ? "#5B8CFF" : "rgba(255,255,255,0.60)",
                  fontWeight: node.selected ? 500 : 400,
                  borderRadius: 4,
                }}
              >
                <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 0 }}>
                  {node.file.type === "directory" ? "▸" : "·"}
                </span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {node.file.name}
                </span>
              </div>
              {node.file.type === "directory" && node.expanded && node.children.map((c: typeof child) => renderNode(c, depth + 1))}
            </div>
          );
          return renderNode(child);
        })}
      </div>
    </div>
  );
}
