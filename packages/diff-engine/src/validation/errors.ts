/**
 * Qodex Diff Engine — Custom Errors
 */

export class PatchConflictError extends Error {
  constructor(
    public readonly path: string,
    public readonly conflictType: "file_not_found" | "content_mismatch" | "line_mismatch" | "empty_patch",
    detail: string,
  ) {
    super(`Patch conflict on ${path}: ${detail}`);
    this.name = "PatchConflictError";
  }
}

export class ApplyError extends Error {
  constructor(path: string, detail: string) {
    super(`Apply failed on ${path}: ${detail}`);
    this.name = "ApplyError";
  }
}
