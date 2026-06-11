/**
 * Qodex Project Runtime — File Tree Builder
 *
 * Builds and manages the project file tree hierarchy.
 * Pure runtime — contains no UI logic.
 */

import type { ProjectFile, ProjectTree, ProjectTreeNode } from "../types/project.js";
import type { FileSystemAdapter } from "../fs/adapter.js";

export class TreeBuilder {
  private adapter: FileSystemAdapter;
  private rootPath: string;

  constructor(adapter: FileSystemAdapter, rootPath: string) {
    this.adapter = adapter;
    this.rootPath = rootPath;
  }

  /**
   * Build the full project file tree starting from root.
   * Only expands the first level by default.
   */
  async buildTree(rootDir?: string): Promise<ProjectTree> {
    const dir = rootDir ?? "";
    const entries = await this.adapter.listDirectory(dir);

    const root: ProjectFile = {
      path: dir || "/",
      name: this.adapter.getProjectName(this.rootPath),
      type: "directory",
    };

    const children = await this.buildChildren(entries);

    return { root, children };
  }

  /**
   * Build children for a set of directory entries, expanding directories recursively.
   */
  private async buildChildren(
    entries: ProjectFile[],
    depth = 0,
  ): Promise<ProjectTreeNode[]> {
    // Limit recursion depth to avoid hangs
    if (depth > 10) return [];

    const nodes: ProjectTreeNode[] = [];

    for (const entry of entries) {
      const node: ProjectTreeNode = {
        file: entry,
        children: [],
        expanded: depth === 0 && entry.type === "directory"
          ? true
          : false,
        selected: false,
      };

      if (entry.type === "directory") {
        const subEntries = await this.adapter.listDirectory(entry.path);
        node.children = await this.buildChildren(subEntries, depth + 1);
      }

      nodes.push(node);
    }

    return nodes;
  }

  /**
   * Expand a specific directory node by its path.
   */
  expandNode(nodes: ProjectTreeNode[], targetPath: string): boolean {
    for (const node of nodes) {
      if (node.file.path === targetPath && node.file.type === "directory") {
        node.expanded = true;
        return true;
      }
      if (node.children.length > 0) {
        if (this.expandNode(node.children, targetPath)) return true;
      }
    }
    return false;
  }

  /**
   * Collapse a specific directory node.
   */
  collapseNode(nodes: ProjectTreeNode[], targetPath: string): boolean {
    for (const node of nodes) {
      if (node.file.path === targetPath && node.file.type === "directory") {
        node.expanded = false;
        return true;
      }
      if (node.children.length > 0) {
        if (this.collapseNode(node.children, targetPath)) return true;
      }
    }
    return false;
  }

  /**
   * Toggle selection on a node by path.
   */
  selectNode(nodes: ProjectTreeNode[], targetPath: string): boolean {
    for (const node of nodes) {
      if (node.file.path === targetPath) {
        node.selected = !node.selected;
        return true;
      }
      if (node.children.length > 0) {
        if (this.selectNode(node.children, targetPath)) return true;
      }
    }
    return false;
  }

  /**
   * Collect all currently selected file paths.
   */
  getSelectedPaths(nodes: ProjectTreeNode[]): string[] {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.selected && node.file.type === "file") {
        paths.push(node.file.path);
      }
      if (node.children.length > 0) {
        paths.push(...this.getSelectedPaths(node.children));
      }
    }
    return paths;
  }

  /**
   * Flatten tree nodes into a file path list (useful for indexing).
   */
  flattenPaths(nodes: ProjectTreeNode[]): string[] {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.file.type === "file") paths.push(node.file.path);
      if (node.children.length > 0) {
        paths.push(...this.flattenPaths(node.children));
      }
    }
    return paths;
  }
}
