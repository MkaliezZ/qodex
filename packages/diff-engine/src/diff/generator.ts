/**
 * Qodex Diff Engine — Diff Generator
 *
 * Generates unified diff output from old/new file content.
 * Pure TypeScript — no external diff tool required.
 */

import type { PatchFile, PatchHunk, DiffResult } from "../models/patch.js";
import { PatchConflictError } from "../validation/errors.js";

const CONTEXT_LINES = 3;

/**
 * Line-by-line diff using a simple LCS-based approach.
 * Produces unified diff format compatible with standard patch tools.
 */
export class DiffGenerator {
  /**
   * Compare old and new content, return DiffResult per file.
   */
  generateDiff(file: PatchFile): DiffResult {
    const oldLines = file.oldContent.split("\n");
    const newLines = file.newContent.split("\n");

    // Handle trailing newline edge case
    if (file.oldContent.endsWith("\n")) oldLines.pop();
    if (file.newContent.endsWith("\n")) newLines.pop();

    const changes = this.computeChanges(oldLines, newLines);
    const hunks = this.buildHunks(changes, oldLines, newLines);

    let additions = 0;
    let deletions = 0;
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) additions++;
        else if (line.startsWith("-")) deletions++;
      }
    }

    return {
      path: file.path,
      additions,
      deletions,
      hunks,
    };
  }

  /**
   * Generate unified diff string from a PatchFile.
   */
  generateUnifiedDiff(file: PatchFile): string {
    const result = this.generateDiff(file);
    const lines: string[] = [];

    lines.push(`--- a/${file.path}`);
    lines.push(`+++ b/${file.path}`);

    for (const hunk of result.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      lines.push(...hunk.lines);
    }

    return lines.join("\n");
  }

  /**
   * Generate diffs for multiple files.
   */
  generateMultiDiff(files: PatchFile[]): DiffResult[] {
    return files.map((f) => this.generateDiff(f));
  }

  // ── Private: LCS-based change detection ──────────

  private computeChanges(oldLines: string[], newLines: string[]): number[] {
    // Simple approach: mark lines as 0=unchanged, 1=removed, 2=added
    // Uses longest common subsequence (via simple alignment)
    const changes: number[] = new Array(oldLines.length).fill(0);

    // For each line in old, try to find it in new (sequential scan)
    let newIdx = 0;
    for (let oldIdx = 0; oldIdx < oldLines.length; oldIdx++) {
      if (newIdx < newLines.length && oldLines[oldIdx] === newLines[newIdx]) {
        changes[oldIdx] = 0; // unchanged
        newIdx++;
      } else {
        changes[oldIdx] = 1; // removed
      }
    }

    return changes;
  }

  private buildHunks(
    changes: number[],
    oldLines: string[],
    newLines: string[],
  ): PatchHunk[] {
    const hunks: PatchHunk[] = [];

    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      // Skip unchanged lines
      if (oldIdx < oldLines.length && newIdx < newLines.length
          && oldLines[oldIdx] === newLines[newIdx]) {
        oldIdx++;
        newIdx++;
        continue;
      }

      // Found a change — build hunk
      const hunkStartOld = Math.max(1, oldIdx - CONTEXT_LINES + 1);
      const hunkStartNew = Math.max(1, newIdx - CONTEXT_LINES + 1);
      const hunkLines: string[] = [];

      // Context lines before change
      let contextOld = oldIdx - CONTEXT_LINES;
      let contextNew = newIdx - CONTEXT_LINES;
      if (contextOld < 0) contextOld = 0;
      if (contextNew < 0) contextNew = 0;

      while (contextOld < oldIdx && contextNew < newIdx) {
        if (contextOld < oldLines.length && contextNew < newLines.length
            && oldLines[contextOld] === newLines[contextNew]) {
          hunkLines.push(` ${oldLines[contextOld]}`);
          contextOld++;
          contextNew++;
        } else break;
      }

      // Changed lines
      while (oldIdx < oldLines.length
             && (newIdx >= newLines.length || oldLines[oldIdx] !== newLines[newIdx])) {
        hunkLines.push(`-${oldLines[oldIdx]}`);
        oldIdx++;
      }
      while (newIdx < newLines.length
             && (oldIdx >= oldLines.length || oldLines[oldIdx] !== newLines[newIdx])) {
        hunkLines.push(`+${newLines[newIdx]}`);
        newIdx++;
      }

      // Context lines after change
      let afterOld = oldIdx;
      let afterNew = newIdx;
      let ctxCount = 0;
      while (afterOld < oldLines.length && afterNew < newLines.length
             && oldLines[afterOld] === newLines[afterNew] && ctxCount < CONTEXT_LINES) {
        hunkLines.push(` ${oldLines[afterOld]}`);
        afterOld++;
        afterNew++;
        ctxCount++;
      }

      const oldCount = hunkLines.filter((l) => l.startsWith("-") || l.startsWith(" ")).length;
      const newCount = hunkLines.filter((l) => l.startsWith("+") || l.startsWith(" ")).length;

      hunks.push({
        oldStart: hunkStartOld,
        oldLines: oldCount,
        newStart: hunkStartNew,
        newLines: newCount,
        lines: hunkLines,
      });

      oldIdx = afterOld;
      newIdx = afterNew;
    }

    return hunks;
  }
}
