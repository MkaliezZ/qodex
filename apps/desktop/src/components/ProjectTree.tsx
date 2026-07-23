import { ChevronRight, File, Folder } from "lucide-react";
import type { ProjectTreeNode } from "@qodex/project-runtime";

export function ProjectTree({
  nodes,
  onFileSelect,
}: {
  nodes: ProjectTreeNode[];
  onFileSelect?: (path: string) => void;
}) {
  const renderNode = (node: ProjectTreeNode, depth = 0) => {
    const isDirectory = node.file.type === "directory";
    return (
      <div key={node.file.path}>
        <button
          type="button"
          className={`project-tree-row${node.selected ? " is-selected" : ""}`}
          style={{ "--tree-depth": depth } as React.CSSProperties}
          disabled={isDirectory || !onFileSelect}
          onClick={() => {
            if (!isDirectory) onFileSelect?.(node.file.path);
          }}
          title={node.file.path}
        >
          {isDirectory ? (
            <ChevronRight
              className={node.expanded ? "project-tree-chevron is-expanded" : "project-tree-chevron"}
              size={12}
              aria-hidden="true"
            />
          ) : (
            <span className="project-tree-spacer" aria-hidden="true" />
          )}
          {isDirectory
            ? <Folder size={14} strokeWidth={1.7} aria-hidden="true" />
            : <File size={14} strokeWidth={1.7} aria-hidden="true" />}
          <span className="project-tree-name">{node.file.name}</span>
        </button>
        {isDirectory && node.expanded
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return <div className="project-tree">{nodes.map((node) => renderNode(node))}</div>;
}
