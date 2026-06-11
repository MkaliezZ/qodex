/**
 * Qodex Diff Engine — Patch Validator
 *
 * Validates a patch proposal before display or application.
 * Ensures patches are safe, consistent, and applicable.
 */

import type { PatchProposal, PatchConflict } from "../models/patch.js";
import { PatchConflictError } from "./errors.js";

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

    for (const file of proposal.files) {
      if (!file.path) {
        conflicts.push({
          path: file.path,
          type: "empty_patch",
          detail: "File path is empty",
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
