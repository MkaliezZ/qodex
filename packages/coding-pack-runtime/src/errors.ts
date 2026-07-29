export type CodingPackManifestErrorCode =
  | "bounds_exceeded"
  | "duplicate_path"
  | "identity_mismatch"
  | "invalid_digest"
  | "invalid_input"
  | "invalid_path"
  | "invalid_timestamp"
  | "invalid_utf8"
  | "path_overlap"
  | "unsupported_rules";

export class CodingPackManifestError extends Error {
  readonly code: CodingPackManifestErrorCode;

  constructor(code: CodingPackManifestErrorCode, message: string) {
    super(message);
    this.name = "CodingPackManifestError";
    this.code = code;
  }
}
