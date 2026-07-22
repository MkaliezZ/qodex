/**
 * Applies approved full-file replacements and verifies every filesystem write.
 */

import type {
  ApplyResult,
  PatchErrorCode,
  PatchFile,
  PatchProposal,
} from "../models/patch.js";
import { DiffGenerator } from "../diff/generator.js";

export interface ApplyTarget {
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
}

class ApplyOperationError extends Error {
  constructor(
    readonly path: string,
    readonly code: PatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplyOperationError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function targetErrorCode(error: unknown, fallback: PatchErrorCode): PatchErrorCode {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "unsafe_path" || code === "binary_file_unsupported") return code;
  }
  return fallback;
}

export class ApplyEngine {
  private applied = new Map<string, Map<string, string>>();

  constructor(private target?: ApplyTarget) {}

  async preview(proposal: PatchProposal): Promise<string> {
    const generator = new DiffGenerator();
    const parts = [`Summary: ${proposal.summary}`, `Files: ${proposal.files.length}`, ""];

    for (const file of proposal.files) {
      const diff = generator.generateUnifiedDiff(file);
      if (diff) parts.push(diff, "");
    }

    return parts.join("\n");
  }

  async apply(proposal: PatchProposal): Promise<ApplyResult[]> {
    if (!this.target) {
      return proposal.files.map((file) => ({
        success: false,
        path: file.path,
        code: "write_target_unavailable",
        error: "No filesystem write target is configured.",
      }));
    }

    const originals = new Map<string, string>();
    const conflicts: ApplyResult[] = [];

    for (const file of proposal.files) {
      try {
        const current = await this.target.readFile(file.path);
        originals.set(file.path, current);
        if (current !== file.oldContent) {
          conflicts.push({
            success: false,
            path: file.path,
            code: "content_mismatch",
            error: "File content has changed since the proposal was created.",
          });
        }
      } catch (error) {
        conflicts.push({
          success: false,
          path: file.path,
          code: targetErrorCode(error, "file_not_found"),
          error: errorMessage(error),
        });
      }
    }

    if (conflicts.length > 0) return conflicts;

    const written: PatchFile[] = [];
    try {
      for (const file of proposal.files) {
        let latestContent: string;
        try {
          latestContent = await this.target.readFile(file.path);
        } catch (error) {
          throw new ApplyOperationError(
            file.path,
            targetErrorCode(error, "file_not_found"),
            `Unable to re-check file before write: ${errorMessage(error)}`,
          );
        }
        if (latestContent !== originals.get(file.path)) {
          throw new ApplyOperationError(
            file.path,
            "content_mismatch",
            "File content changed during apply; no newer content was overwritten.",
          );
        }

        written.push(file);
        try {
          await this.target.writeFile(file.path, file.newContent);
        } catch (error) {
          throw new ApplyOperationError(
            file.path,
            targetErrorCode(error, "write_failed"),
            `Write failed: ${errorMessage(error)}`,
          );
        }

        let readback: string;
        try {
          readback = await this.target.readFile(file.path);
        } catch (error) {
          throw new ApplyOperationError(
            file.path,
            "write_verification_failed",
            `Unable to verify written content: ${errorMessage(error)}`,
          );
        }
        if (readback !== file.newContent) {
          throw new ApplyOperationError(
            file.path,
            "write_verification_failed",
            "Written content did not match the proposed replacement.",
          );
        }
      }
    } catch (error) {
      const failure = error instanceof ApplyOperationError
        ? error
        : new ApplyOperationError("", "write_failed", errorMessage(error));
      const rollbackFailures = await this.restoreWrittenFiles(written, originals);

      return proposal.files.map((file) => {
        const rollbackFailure = rollbackFailures.get(file.path);
        const wasWritten = written.some((writtenFile) => writtenFile.path === file.path);
        if (rollbackFailure) {
          return {
            success: false,
            path: file.path,
            code: "rollback_failed" as const,
            error: `${failure.message} Automatic restore failed: ${rollbackFailure}`,
            rollbackSucceeded: false,
          };
        }
        return {
          success: false,
          path: file.path,
          code: file.path === failure.path ? failure.code : "write_failed",
          error: file.path === failure.path
            ? failure.message
            : "The proposal was not applied because another file failed.",
          ...(wasWritten ? { rollbackSucceeded: true } : {}),
        };
      });
    }

    this.applied.set(proposal.id, originals);
    return proposal.files.map((file) => ({
      success: true,
      path: file.path,
      previousContent: originals.get(file.path),
      readbackVerified: true,
    }));
  }

  reject(_proposal: PatchProposal): void {
    // Explicit rejection has no filesystem side effects.
  }

  async rollback(proposal: PatchProposal): Promise<ApplyResult[]> {
    if (!this.target) {
      return proposal.files.map((file) => ({
        success: false,
        path: file.path,
        code: "write_target_unavailable",
        error: "No filesystem write target is configured.",
      }));
    }

    const originals = this.applied.get(proposal.id);
    if (!originals) {
      return proposal.files.map((file) => ({
        success: false,
        path: file.path,
        code: "rollback_failed",
        error: "No rollback data is available for this proposal.",
      }));
    }

    const conflicts: ApplyResult[] = [];
    for (const file of proposal.files) {
      try {
        const current = await this.target.readFile(file.path);
        if (current !== file.newContent) {
          conflicts.push({
            success: false,
            path: file.path,
            code: "content_mismatch",
            error: "File content changed after apply; rollback was blocked.",
          });
        }
      } catch (error) {
        conflicts.push({
          success: false,
          path: file.path,
          code: "rollback_failed",
          error: `Unable to read file before rollback: ${errorMessage(error)}`,
        });
      }
    }
    if (conflicts.length > 0) return conflicts;

    const restored: PatchFile[] = [];
    try {
      for (const file of proposal.files) {
        const original = originals.get(file.path);
        if (original === undefined) {
          throw new ApplyOperationError(file.path, "rollback_failed", "Original content is unavailable.");
        }
        restored.push(file);
        await this.target.writeFile(file.path, original);
        const readback = await this.target.readFile(file.path);
        if (readback !== original) {
          throw new ApplyOperationError(
            file.path,
            "rollback_failed",
            "Rollback readback did not match the exact original content.",
          );
        }
      }
    } catch (error) {
      const failure = error instanceof ApplyOperationError
        ? error
        : new ApplyOperationError("", "rollback_failed", errorMessage(error));
      const reapplyFailures = await this.reapplyFiles(restored);
      return proposal.files.map((file) => ({
        success: false,
        path: file.path,
        code: "rollback_failed",
        error: reapplyFailures.get(file.path)
          ? `${failure.message} Recovery failed: ${reapplyFailures.get(file.path)}`
          : failure.message,
        rollbackSucceeded: false,
      }));
    }

    this.applied.delete(proposal.id);
    return proposal.files.map((file) => ({
      success: true,
      path: file.path,
      readbackVerified: true,
      rollbackSucceeded: true,
    }));
  }

  applyInMemory(proposal: PatchProposal): Map<string, string> {
    const result = new Map<string, string>();
    const originals = new Map<string, string>();
    for (const file of proposal.files) {
      originals.set(file.path, file.oldContent);
      result.set(file.path, file.newContent);
    }
    this.applied.set(proposal.id, originals);
    return result;
  }

  private async restoreWrittenFiles(
    written: PatchFile[],
    originals: Map<string, string>,
  ): Promise<Map<string, string>> {
    const failures = new Map<string, string>();
    if (!this.target) return failures;

    for (const file of [...written].reverse()) {
      const original = originals.get(file.path);
      if (original === undefined) continue;
      try {
        await this.target.writeFile(file.path, original);
        const readback = await this.target.readFile(file.path);
        if (readback !== original) failures.set(file.path, "Restored content verification failed.");
      } catch (error) {
        failures.set(file.path, errorMessage(error));
      }
    }
    return failures;
  }

  private async reapplyFiles(restored: PatchFile[]): Promise<Map<string, string>> {
    const failures = new Map<string, string>();
    if (!this.target) return failures;

    for (const file of [...restored].reverse()) {
      try {
        await this.target.writeFile(file.path, file.newContent);
        const readback = await this.target.readFile(file.path);
        if (readback !== file.newContent) failures.set(file.path, "Reapply verification failed.");
      } catch (error) {
        failures.set(file.path, errorMessage(error));
      }
    }
    return failures;
  }
}
