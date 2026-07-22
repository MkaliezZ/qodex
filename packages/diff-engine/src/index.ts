/**
 * Qodex Diff Engine — Entry Point
 */

export type {
  PatchProposal,
  PatchFile,
  PatchHunk,
  DiffResult,
  ApplyResult,
  PatchConflict,
  PatchContractVersion,
  PatchError,
  PatchErrorCode,
} from "./models/patch.js";

export { DiffEngine } from "./engine.js";

export { DiffGenerator } from "./diff/generator.js";
export { PatchValidator } from "./validation/validator.js";
export type { ContentProvider } from "./validation/validator.js";
export { ApplyEngine } from "./apply/engine.js";
export type { ApplyTarget } from "./apply/engine.js";
export { PatchParser } from "./parser/parser.js";
export {
  PATCH_CONTRACT_VERSION,
  PATCH_ENVELOPE_OPEN,
  PATCH_ENVELOPE_CLOSE,
  extractAssistantText,
  isSafeProjectRelativePath,
  isUnsupportedBinaryPath,
  parseModelPatchResponse,
} from "./parser/model-output.js";
export type { ModelPatchParseResult } from "./parser/model-output.js";
export { PatchConflictError, ApplyError } from "./validation/errors.js";
