/**
 * Qodex Context Engine — Core Types
 *
 * Defines the contract between the Context Engine and AgentRuntime.
 * After M5, AgentRuntime consumes ContextBundle exclusively.
 */

import type { FileContent } from "@qodex/project-runtime";

/** Input to the Context Engine assembly pipeline */
export interface ContextRequest {
  prompt: string;
  selectedFiles: FileContent[];
  projectId?: string;
  sessionId?: string;
  maxTokens?: number;
  mode?: "fast" | "balanced" | "deep";
}

/** Complete assembled context ready for consumption */
export interface ContextBundle {
  /** Final assembled prompt text (rules + memory + metadata + files + original prompt) */
  assembledPrompt: string;

  /** Individual source sections for UI display */
  sources: ContextSources;

  /** Estimated total token count */
  estimatedTokens: number;
}

/** Individual context sources (displayable in Context Panel) */
export interface ContextSources {
  prompt: string;
  projectRules: string;
  memory: string;
  projectMetadata: string;
  selectedFiles: string;
}

/** A single context source with metadata */
export interface ContextSourceInfo {
  name: string;
  label: string;
  content: string;
  tokens: number;
  active: boolean;
}
