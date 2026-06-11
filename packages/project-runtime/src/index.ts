/**
 * Qodex Project Runtime — Entry Point
 */

// ── Types ────────────────────────────────────────────
export type {
  Project,
  ProjectFile,
  FileContent,
  ProjectTree,
  ProjectTreeNode,
  ProjectIndex,
  ProjectIndexEntry,
} from "./types/project.js";

// ── Runtime ──────────────────────────────────────────
export { ProjectRuntime } from "./project/runtime.js";
export type { ProjectRuntimeOptions } from "./project/runtime.js";

// ── File System Adapters ─────────────────────────────
export type { FileSystemAdapter } from "./fs/adapter.js";
export { WebFileSystemAdapter } from "./fs/adapter.js";
export { MockFileSystemAdapter } from "./fs/mock.js";

// ── Tree ─────────────────────────────────────────────
export { TreeBuilder } from "./tree/builder.js";

// ── Reader ───────────────────────────────────────────
export { FileReader } from "./files/reader.js";

// ── Ignore ───────────────────────────────────────────
export { shouldIgnore, isBinaryFile, detectLanguage } from "./ignore/rules.js";

// ── Indexing ─────────────────────────────────────────
export { ProjectIndexer } from "./indexing/index.js";
