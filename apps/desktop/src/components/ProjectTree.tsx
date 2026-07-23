import { ChevronRight, File, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectTreeNode } from "@qodex/project-runtime";

export function ProjectTree({
  nodes,
  onDirectoryToggle,
  onFileSelect,
}: {
  nodes: ProjectTreeNode[];
  onDirectoryToggle?: (path: string) => void;
  onFileSelect?: (path: string) => void;
}) {
  const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>(
    () => collectDirectoryExpansion(nodes),
  );

  useEffect(() => {
    setExpandedByPath((current) => collectDirectoryExpansion(nodes, current));
  }, [nodes]);

  const renderNode = (node: ProjectTreeNode, depth = 0) => {
    const isDirectory = node.file.type === "directory";
    const isExpanded = isDirectory && Boolean(expandedByPath[node.file.path]);
    return (
      <div key={node.file.path}>
        <button
          type="button"
          className={`project-tree-row${node.selected ? " is-selected" : ""}`}
          style={{ "--tree-depth": depth } as React.CSSProperties}
          disabled={!isDirectory && !onFileSelect}
          onClick={() => {
            if (isDirectory) {
              setExpandedByPath((current) => ({
                ...current,
                [node.file.path]: !current[node.file.path],
              }));
              onDirectoryToggle?.(node.file.path);
              return;
            }
            onFileSelect?.(node.file.path);
          }}
          aria-expanded={isDirectory ? isExpanded : undefined}
          aria-label={isDirectory
            ? `${isExpanded ? "Collapse" : "Expand"} ${node.file.name}`
            : undefined}
          title={node.file.path}
        >
          {isDirectory ? (
            <ChevronRight
              className={isExpanded ? "project-tree-chevron is-expanded" : "project-tree-chevron"}
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
        {isDirectory && isExpanded
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return <div className="project-tree">{nodes.map((node) => renderNode(node))}</div>;
}

function collectDirectoryExpansion(
  nodes: ProjectTreeNode[],
  current: Record<string, boolean> = {},
): Record<string, boolean> {
  const next: Record<string, boolean> = {};

  const visit = (node: ProjectTreeNode) => {
    if (node.file.type === "directory") {
      next[node.file.path] = Object.prototype.hasOwnProperty.call(current, node.file.path)
        ? current[node.file.path]
        : node.expanded;
      node.children.forEach(visit);
    }
  };

  nodes.forEach(visit);
  return next;
}
