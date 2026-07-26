export type PythonRuntimeErrorCode =
  | "invalid_manifest"
  | "unsupported_platform"
  | "invalid_state"
  | "message_too_large"
  | "protocol_mismatch"
  | "runtime_unavailable";

export class PythonRuntimeError extends Error {
  constructor(
    readonly code: PythonRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PythonRuntimeError";
  }
}
