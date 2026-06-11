/**
 * Qodex Project Runtime — Core Types
 */

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  openedAt: string;
}

export interface ProjectFile {
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
  language?: string;
}

export interface FileContent {
  path: string;
  content: string;
  language?: string;
}

export interface ProjectTree {
  root: ProjectFile;
  children: ProjectTreeNode[];
}

export interface ProjectTreeNode {
  file: ProjectFile;
  children: ProjectTreeNode[];
  /** Whether the node is expanded in the tree UI */
  expanded: boolean;
  /** Whether the node is selected by the user */
  selected: boolean;
}

export interface ProjectIndex {
  rootPath: string;
  files: ProjectIndexEntry[];
  indexedAt: string;
}

export interface ProjectIndexEntry {
  path: string;
  size: number;
  language?: string;
  lastModified: number;
}
