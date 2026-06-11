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
} from "./models/patch.js";

export { DiffEngine } from "./engine.js";

export { DiffGenerator } from "./diff/generator.js";
export { PatchValidator } from "./validation/validator.js";
export type { ContentProvider } from "./validation/validator.js";
export { ApplyEngine } from "./apply/engine.js";
export type { ApplyTarget } from "./apply/engine.js";
export { PatchParser } from "./parser/parser.js";
export { PatchConflictError, ApplyError } from "./validation/errors.js";
