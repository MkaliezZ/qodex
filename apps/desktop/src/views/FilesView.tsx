import { useRuntimeContext } from "../components/AppShell";
import { Files } from "lucide-react";
import { ProjectTree } from "../components/ProjectTree";
import { EmptyState, ViewTitle } from "../components/WorkbenchPrimitives";

export function FilesView() {
  const { projectName, fileTree, openProject } = useRuntimeContext();

  if (!projectName || !fileTree) {
    return (
      <div className="workbench-view">
        <ViewTitle title="Files" description="Browse the currently opened project." icon={Files} />
        <EmptyState
          icon={Files}
          title="No project opened"
          description="Open a project directory to inspect its file tree."
          action={<button className="qodex-button" onClick={openProject}>Open Project</button>}
        />
      </div>
    );
  }

  return (
    <div className="workbench-view files-view">
      <ViewTitle title="Files" description={`Project explorer for ${projectName}.`} icon={Files} />
      <div className="file-table-header" aria-hidden="true">
        <span>Path</span><span>Type</span><span>Selection</span>
      </div>
      <div className="file-list">
        <ProjectTree nodes={fileTree.children} />
      </div>
    </div>
  );
}
