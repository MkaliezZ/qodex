export const CODING_PACK_PROJECT_SOURCE_MAX_BYTES = 524_288;

export type CodingPackProjectSourceErrorCode =
  | "coding_pack_read_failed"
  | "coding_pack_source_too_large";

export class CodingPackProjectSourceError extends Error {
  constructor(
    readonly code: CodingPackProjectSourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CodingPackProjectSourceError";
  }
}

/**
 * Read-only exact-byte access bound to an already-authorized project root.
 *
 * Implementations must reject unsafe relative paths and enforce
 * CODING_PACK_PROJECT_SOURCE_MAX_BYTES before returning source bytes.
 */
export interface CodingPackProjectSourceAdapter {
  readFileBytes(relativePath: string): Promise<Uint8Array>;
}
