/**
 * Qodex Diff Engine — Patch Models
 *
 * Core data structures for patch proposals and file changes.
 */

export interface PatchProposal {
  id: string;
  taskId: string;
  summary: string;
  files: PatchFile[];
  createdAt: string;
}

export interface PatchFile {
  path: string;
  oldContent: string;
  newContent: string;
}

export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface DiffResult {
  path: string;
  additions: number;
  deletions: number;
  hunks: PatchHunk[];
}

export interface ApplyResult {
  success: boolean;
  path: string;
  error?: string;
  previousContent?: string;
}

export interface PatchConflict {
  path: string;
  type: "file_not_found" | "content_mismatch" | "line_mismatch" | "empty_patch";
  detail: string;
}
