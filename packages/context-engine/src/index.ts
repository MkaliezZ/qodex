/**
 * Qodex Context Engine — Entry Point
 */

// ── Types ────────────────────────────────────────────
export type {
  ContextRequest,
  ContextBundle,
  ContextSources,
  ContextSourceInfo,
} from "./types/context.js";

// ── Engine ───────────────────────────────────────────
export { ContextEngine } from "./context/engine.js";
export type { ContextEngineOptions } from "./context/engine.js";

// ── Budget ───────────────────────────────────────────
export { TokenEstimator } from "./budget/estimator.js";

// ── Rules ────────────────────────────────────────────
export { RulesLoader } from "./rules/loader.js";
export type { RulesProvider } from "./rules/loader.js";

// ── Memory ───────────────────────────────────────────
export { MemoryLoader } from "./memory/loader.js";
export type { MemoryProvider } from "./memory/loader.js";

// ── Project ──────────────────────────────────────────
export { ProjectMetadataBuilder } from "./project/metadata.js";
export type { ProjectInfo } from "./project/metadata.js";

// ── File Builder ─────────────────────────────────────
export { FileContextBuilder } from "./builders/files.js";
