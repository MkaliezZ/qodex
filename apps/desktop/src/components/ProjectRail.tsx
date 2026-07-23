import { useRuntimeContext } from "./AppShell";
import type { ActiveView } from "./AppShell";
import {
  Bot,
  Boxes,
  Files,
  GitBranch,
  History,
  Package,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ProjectTree } from "./ProjectTree";
import { StatusIndicator } from "./WorkbenchPrimitives";

export function ProjectRail() {
  const { projectName, projectSource, fileTree, openProject, toggleFileSelection, activeView, setActiveView } =
    useRuntimeContext();

  const navItems: { label: string; view: ActiveView; icon: LucideIcon }[] = [
    { label: "Agent", view: "agent", icon: Bot },
    { label: "Files", view: "files", icon: Files },
    { label: "Sessions", view: "sessions", icon: History },
    { label: "Skills", view: "skills", icon: Boxes },
    { label: "Git", view: "git", icon: GitBranch },
    { label: "Settings", view: "settings", icon: Settings },
    { label: "Marketplace", view: "marketplace", icon: Package },
  ];

  return (
    <div className="project-rail">
      <div className="project-header">
        <img className="project-mark" src="/kerniq-icon.png" alt="" />
        <div className="project-identity">
          <div className="project-name">{projectName ?? "KerniQ"}</div>
          <div className="project-state">{projectName ? "Project workspace" : "Local workbench"}</div>
          {projectSource ? (
            <div
              className="project-state"
              data-testid="project-access-source"
              data-project-source={projectSource}
            >
              {projectSource === "tauri" ? "Native desktop access" : "Browser access"}
            </div>
          ) : null}
        </div>
      </div>

      <nav className="rail-navigation" aria-label="Primary navigation">
        <div className="rail-section-label">Workspace</div>
        {navItems.map((item) => {
          const isActive = activeView === item.view;
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className={`rail-nav-item${isActive ? " rail-nav-item-active" : ""}`}
              onClick={() => setActiveView(item.view)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="rail-nav-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
              {item.view === "marketplace" && <span className="rail-nav-beta">Beta</span>}
            </button>
          );
        })}
      </nav>

      {activeView === "agent" && projectName && fileTree ? (
        <div className="rail-project-explorer">
          <div className="rail-section-label">{projectName}</div>
          <ProjectTree nodes={fileTree.children} onFileSelect={toggleFileSelection} />
        </div>
      ) : activeView === "agent" ? (
        <div className="rail-open-project">
          <button className="qodex-button rail-open-project-button" onClick={openProject}>
            Open Project
          </button>
        </div>
      ) : <div className="rail-spacer" />}

      <div className="rail-footer">
        <StatusIndicator label={projectName ? "Project loaded" : "Local runtime ready"} tone="success" />
      </div>
    </div>
  );
}
