import { useRuntimeContext } from "./AppShell";
import type { ActiveView } from "./AppShell";
import type { ProjectTreeNode } from "@qodex/project-runtime";

export function ProjectRail() {
  const { projectName, fileTree, openProject, toggleFileSelection, activeView, setActiveView } =
    useRuntimeContext();

  const navItems: { label: string; view: ActiveView }[] = [
    { label: "Files", view: "files" },
    { label: "Sessions", view: "sessions" },
    { label: "Skills", view: "skills" },
    { label: "Git", view: "git" },
    { label: "Settings", view: "settings" },
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
            color: node.selected
              ? "#5B8CFF"
              : "rgba(255,255,255,0.60)",
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
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
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
    <div
      className="glass-panel"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Project header */}
      <div
        style={{
          padding: "14px 14px 6px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            background: "linear-gradient(135deg, #5B8CFF, #9B5CFF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          Q
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {projectName ?? "Qodex"}
          </div>
          <div className="text-caption" style={{ fontSize: 11 }}>
            {projectName ? "Project opened" : "No project"}
          </div>
        </div>
      </div>

      <div className="qodex-divider" style={{ margin: "2px 12px" }} />

      {/* Navigation */}
      <div className="panel-inner" style={{ gap: 1, padding: "8px 12px" }}>
        {navItems.map((item) => {
          const isActive = activeView === item.view;
          return (
            <button
              key={item.label}
              className="qodex-button qodex-button-secondary"
              onClick={() => setActiveView(item.view)}
              style={{
                width: "100%",
                justifyContent: "flex-start",
                padding: "7px 10px",
                borderRadius: 8,
                background: isActive
                  ? "rgba(91, 140, 255, 0.10)"
                  : "transparent",
                border: isActive
                  ? "1px solid rgba(91, 140, 255, 0.15)"
                  : "1px solid transparent",
                color: isActive
                  ? "rgba(255,255,255,0.90)"
                  : "rgba(255,255,255,0.40)",
                fontWeight: isActive ? 600 : 400,
                fontSize: 13,
                letterSpacing: "0.01em",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* File Tree - only in agent/files views when project loaded */}
      {activeView === "agent" && projectName && fileTree ? (
        <div
          className="panel-inner"
          style={{ gap: 0, padding: "8px 12px", overflow: "auto", flex: 1 }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.30)", padding: "0 0 6px", letterSpacing: "0.05em" }}>
            {projectName}
          </div>
          {fileTree.children.map((child: ProjectTreeNode) => renderTreeNode(child))}
        </div>
      ) : activeView === "agent" ? (
        <div
          className="panel-inner"
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <button className="qodex-button" onClick={openProject} style={{ width: "100%", justifyContent: "center" }}>
            Open Project
          </button>
        </div>
      ) : null}

      {/* Footer */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="status-dot status-dot-active" />
          <span className="text-caption" style={{ fontSize: 11 }}>
            {projectName ? "Project loaded" : "Ready"}
          </span>
        </div>
      </div>
    </div>
  );
}
