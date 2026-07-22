/**
 * Qodex Diff Engine — Patch Validator
 *
 * Validates a patch proposal before display or application.
 * Ensures patches are safe, consistent, and applicable.
 */

import type { PatchProposal, PatchConflict } from "../models/patch.js";
import { isSafeProjectRelativePath, isUnsupportedBinaryPath } from "../parser/model-output.js";

export interface ContentProvider {
  readFile(path: string): Promise<string>;
}

export class PatchValidator {
  private contentProvider?: ContentProvider;

  constructor(contentProvider?: ContentProvider) {
    this.contentProvider = contentProvider;
  }

  /**
   * Validate an entire patch proposal.
   * Returns array of conflicts (empty = valid).
   */
  async validateProposal(proposal: PatchProposal): Promise<PatchConflict[]> {
    const conflicts: PatchConflict[] = [];
    const seenPaths = new Set<string>();

    if (proposal.files.length === 0) {
      return [{ path: "", type: "empty_patch", detail: "Patch proposal contains no files" }];
    }

    for (const file of proposal.files) {
      if (!file.path) {
        conflicts.push({
          path: file.path,
          type: "empty_patch",
          detail: "File path is empty",
        });
        continue;
      }

      if (!isSafeProjectRelativePath(file.path)) {
        conflicts.push({
          path: file.path,
          type: "unsafe_path",
          detail: "File path must remain inside the opened project root",
        });
        continue;
      }

      if (seenPaths.has(file.path)) {
        conflicts.push({
          path: file.path,
          type: "duplicate_patch_path",
          detail: "The same file appears more than once in the proposal",
        });
        continue;
      }
      seenPaths.add(file.path);

      if (isUnsupportedBinaryPath(file.path) || file.oldContent.includes("\0") || file.newContent.includes("\0")) {
        conflicts.push({
          path: file.path,
          type: "binary_file_unsupported",
          detail: "Binary file patches are not supported",
        });
        continue;
      }

      if (!file.newContent && !file.oldContent) {
        conflicts.push({
          path: file.path,
          type: "empty_patch",
          detail: "Both old and new content are empty",
        });
        continue;
      }

      if (file.oldContent === file.newContent) {
        conflicts.push({
          path: file.path,
          type: "empty_patch",
          detail: "No changes in file content",
        });
        continue;
      }

      // If we have a content provider, verify old content matches
      if (this.contentProvider) {
        try {
          const currentContent = await this.contentProvider.readFile(file.path);
          if (currentContent !== file.oldContent) {
            conflicts.push({
              path: file.path,
              type: "content_mismatch",
              detail: "File content has changed since patch creation",
            });
          }
        } catch {
          conflicts.push({
            path: file.path,
            type: "file_not_found",
            detail: `File ${file.path} not found on disk`,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Quick validation for a single file patch.
   */
  async validateFile(path: string, oldContent: string, newContent: string): Promise<PatchConflict | null> {
    if (!path) {
      return { path: "", type: "empty_patch", detail: "File path is empty" };
    }
    if (!isSafeProjectRelativePath(path)) {
      return { path, type: "unsafe_path", detail: "Unsafe project-relative path" };
    }
    if (isUnsupportedBinaryPath(path) || oldContent.includes("\0") || newContent.includes("\0")) {
      return { path, type: "binary_file_unsupported", detail: "Binary file patches are not supported" };
    }
    if (oldContent === newContent) {
      return { path, type: "empty_patch", detail: "No changes" };
    }

    if (this.contentProvider) {
      try {
        const current = await this.contentProvider.readFile(path);
        if (current !== oldContent) {
          return { path, type: "content_mismatch", detail: "Content mismatch" };
        }
      } catch {
        return { path, type: "file_not_found", detail: "File not found" };
      }
    }

    return null;
  }
}
