import { useRuntimeContext } from "../components/AppShell";
import { Files } from "lucide-react";
import { ProjectTree } from "../components/ProjectTree";
import { EmptyState, ViewTitle } from "../components/WorkbenchPrimitives";
import { CodingPackPreviewPanel } from "../components/CodingPackPreviewPanel";

export function FilesView() {
  const { projectName, fileTree, openProject, toggleFileSelection } = useRuntimeContext();

  return (
    <div className="workbench-view files-view">
      <ViewTitle
        title="Files"
        description={projectName ? `Project explorer for ${projectName}.` : "Browse the currently opened project."}
        icon={Files}
      />
      <div className="files-workspace">
        <div className="files-browser">
          {!projectName || !fileTree ? (
            <EmptyState
              icon={Files}
              title="No project opened"
              description="Open a project directory to inspect its file tree."
              action={<button className="qodex-button" onClick={openProject}>Open Project</button>}
            />
          ) : (
            <>
              <div className="file-table-header" aria-hidden="true">
                <span>Path</span><span>Type</span><span>Selection</span>
              </div>
              <div className="file-list">
                <ProjectTree
                  nodes={fileTree.children}
                  onFileSelect={toggleFileSelection}
                />
              </div>
            </>
          )}
        </div>
        <CodingPackPreviewPanel />
      </div>
    </div>
  );
}
