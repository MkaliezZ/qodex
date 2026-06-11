/**
 * Qodex Diff Engine — Apply Engine
 *
 * Handles apply, preview, reject, and rollback of patches.
 * All operations are reviewable — no autonomous modifications.
 */

import type { PatchProposal, ApplyResult } from "../models/patch.js";
import { DiffGenerator } from "../diff/generator.js";

export interface ApplyTarget {
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
}

export class ApplyEngine {
  private applied = new Map<string, string>(); // path → previousContent for rollback
  private target?: ApplyTarget;

  constructor(target?: ApplyTarget) {
    this.target = target;
  }

  /**
   * Preview what would be applied (dry-run).
   * Returns the generated diff string without modifying files.
   */
  async preview(proposal: PatchProposal): Promise<string> {
    const generator = new DiffGenerator();
    const parts: string[] = [];

    parts.push(`Summary: ${proposal.summary}`);
    parts.push(`Files: ${proposal.files.length}`);
    parts.push("");

    for (const file of proposal.files) {
      const diff = generator.generateUnifiedDiff(file);
      if (diff) {
        parts.push(diff);
        parts.push("");
      }
    }

    return parts.join("\n");
  }

  /**
   * Apply a patch proposal to the target files.
   * Stores previous content for rollback.
   */
  async apply(proposal: PatchProposal): Promise<ApplyResult[]> {
    const results: ApplyResult[] = [];

    for (const file of proposal.files) {
      try {
        // Store previous content for rollback
        let previousContent: string | undefined;
        if (this.target) {
          try {
            previousContent = await this.target.readFile(file.path);
          } catch {
            // File might not exist yet (new file)
          }
        }

        // Apply the change
        if (this.target) {
          await this.target.writeFile(file.path, file.newContent);
        }

        if (previousContent !== undefined) {
          this.applied.set(file.path, previousContent);
        }

        results.push({
          success: true,
          path: file.path,
          previousContent,
        });
      } catch (err) {
        results.push({
          success: false,
          path: file.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  /**
   * Reject (discard) a patch without applying.
   * No-op on the file system — just clears the proposal.
   */
  reject(proposal: PatchProposal): void {
    // No file changes on reject — just acknowledge
  }

  /**
   * Rollback a previously applied patch.
   * Restores the previous content for each file.
   */
  async rollback(proposal: PatchProposal): Promise<ApplyResult[]> {
    const results: ApplyResult[] = [];

    for (const file of proposal.files) {
      const previousContent = this.applied.get(file.path);
      if (!previousContent) {
        results.push({
          success: false,
          path: file.path,
          error: "No rollback data available",
        });
        continue;
      }

      try {
        if (this.target) {
          await this.target.writeFile(file.path, previousContent);
        }
        this.applied.delete(file.path);
        results.push({ success: true, path: file.path });
      } catch (err) {
        results.push({
          success: false,
          path: file.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  /**
   * In-memory apply (for browser dev mode — stores in map).
   * No actual disk writes.
   */
  applyInMemory(proposal: PatchProposal): Map<string, string> {
    const result = new Map<string, string>();
    for (const file of proposal.files) {
      // Store old content for potential rollback
      this.applied.set(file.path, file.oldContent);
      result.set(file.path, file.newContent);
    }
    return result;
  }
}
