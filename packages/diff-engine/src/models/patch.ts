/**
 * Qodex Diff Engine — Patch Models
 *
 * Core data structures for patch proposals and file changes.
 */

export interface PatchProposal {
  id: string;
  taskId: string;
  contractVersion?: PatchContractVersion;
  summary: string;
  files: PatchFile[];
  createdAt: string;
}

export type PatchContractVersion = "1";

export type PatchErrorCode =
  | "patch_not_present"
  | "patch_parse_failed"
  | "unsupported_patch_version"
  | "invalid_patch_shape"
  | "duplicate_patch_path"
  | "unsafe_path"
  | "file_not_found"
  | "binary_file_unsupported"
  | "content_mismatch"
  | "empty_patch"
  | "write_target_unavailable"
  | "write_failed"
  | "write_verification_failed"
  | "rollback_failed"
  | "provider_failed";

export interface PatchError {
  code: PatchErrorCode;
  message: string;
  path?: string;
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
  code?: PatchErrorCode;
  error?: string;
  previousContent?: string;
  readbackVerified?: boolean;
  rollbackSucceeded?: boolean;
}

export interface PatchConflict {
  path: string;
  type:
    | "file_not_found"
    | "content_mismatch"
    | "line_mismatch"
    | "empty_patch"
    | "duplicate_patch_path"
    | "unsafe_path"
    | "binary_file_unsupported";
  detail: string;
}
