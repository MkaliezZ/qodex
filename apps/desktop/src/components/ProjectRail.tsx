import { useRuntimeContext } from "./AppShell";
import type { ActiveView } from "./AppShell";
import type { ProjectTreeNode } from "@qodex/project-runtime";

export function ProjectRail() {
  const { projectName, fileTree, openProject, toggleFileSelection, activeView, setActiveView } =
    useRuntimeContext();

  const navItems: { label: string; view: ActiveView; glyph: string }[] = [
    { label: "Agent", view: "agent", glyph: "A" },
    { label: "Files", view: "files", glyph: "F" },
    { label: "Sessions", view: "sessions", glyph: "S" },
    { label: "Skills", view: "skills", glyph: "K" },
    { label: "Git", view: "git", glyph: "G" },
    { label: "Settings", view: "settings", glyph: "C" },
    { label: "Marketplace", view: "marketplace", glyph: "M" },
  ];

  const renderTreeNode = (node: ProjectTreeNode, depth: number = 0) => {
    const paddingLeft = 8 + depth * 14;
    const isDir = node.file.type === "directory";

    return (
      <div key={node.file.path}>
        <div
          onClick={() => {
            if (isDir) return;
            toggleFileSelection(node.file.path);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 0 3px",
            paddingLeft,
            cursor: isDir ? "default" : "pointer",
            fontSize: 12,
            color: node.selected ? "#7ba3ff" : "rgba(255,255,255,0.60)",
            fontWeight: node.selected ? 500 : 400,
            borderRadius: 4,
            transition: "color 120ms ease",
          }}
        >
          <span
            style={{
              fontSize: 11,
              opacity: 0.4,
              flexShrink: 0,
              color: isDir ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)",
            }}
          >
            {isDir ? "▸" : "·"}
          </span>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.file.name}
          </span>
        </div>
        {isDir &&
          node.expanded &&
          node.children.map((child: ProjectTreeNode) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="glass-panel project-rail">
      <div className="project-header">
        <div className="project-mark">Q</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="project-name">{projectName ?? "KerniQ"}</div>
          <div className="project-state">{projectName ? "Project opened" : "Local agent workbench"}</div>
        </div>
      </div>

      <div className="qodex-divider rail-divider" />

      <div className="rail-navigation">
        <div className="rail-section-label">Workspace</div>
        {navItems.map((item) => {
          const isActive = activeView === item.view;
          return (
            <button
              key={item.label}
              className={`rail-nav-item${isActive ? " rail-nav-item-active" : ""}`}
              onClick={() => setActiveView(item.view)}
            >
              <span className="rail-nav-glyph">{item.glyph}</span>
              <span>{item.label}</span>
              {item.view === "marketplace" && <span className="rail-nav-beta">BETA</span>}
            </button>
          );
        })}
      </div>

      {activeView === "agent" && projectName && fileTree ? (
        <div className="panel-inner" style={{ gap: 0, padding: "8px 12px", overflow: "auto", flex: 1 }}>
          <div className="rail-section-label" style={{ padding: "0 0 6px" }}>{projectName}</div>
          {fileTree.children.map((child: ProjectTreeNode) => renderTreeNode(child))}
        </div>
      ) : activeView === "agent" ? (
        <div className="rail-open-project">
          <button className="qodex-button" onClick={openProject} style={{ width: "100%" }}>
            Open Project
          </button>
        </div>
      ) : <div style={{ flex: 1 }} />}

      <div className="rail-footer">
        <div className="rail-status">
          <div className="status-dot status-dot-active" />
          <span>{projectName ? "Project loaded" : "Local runtime ready"}</span>
        </div>
      </div>
    </div>
  );
}
