import { GitBranch } from "lucide-react";
import { StatusIndicator, ViewTitle } from "../components/WorkbenchPrimitives";

export function GitView() {
  return (
    <div className="workbench-view git-view">
      <ViewTitle title="Source control" description="Repository status and available Git actions." icon={GitBranch} />
      <div className="source-control-summary">
        <div className="data-row">
          <span>Current branch</span>
          <strong className="mono-value">main</strong>
        </div>
        <div className="data-row">
          <span>Working tree</span>
          <StatusIndicator label="No repository detected" tone="neutral" />
        </div>
        <div className="data-row">
          <span>Checkpoints</span>
          <strong>Unavailable in development mode</strong>
        </div>
      </div>
      <p className="view-footnote">Git integration is available in production builds.</p>
    </div>
  );
}
