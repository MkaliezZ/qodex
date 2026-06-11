/**
 * Qodex Context Engine — Core Engine
 *
 * The central assembly pipeline.
 *
 * Flow:
 *   Prompt → Load Rules → Load Memory → Build Metadata → Attach Files
 *   → Estimate Tokens → Create ContextBundle
 *
 * After M5, this is the ONLY source of context passed to AgentRuntime.
 * PromptBar must never directly concatenate files again.
 */

import type { ContextRequest, ContextBundle, ContextSources } from "../types/context.js";
import { RulesLoader } from "../rules/loader.js";
import { MemoryLoader } from "../memory/loader.js";
import { ProjectMetadataBuilder } from "../project/metadata.js";
import { FileContextBuilder } from "../builders/files.js";
import { TokenEstimator } from "../budget/estimator.js";
import type { ProjectIndex } from "@qodex/project-runtime";

export interface ContextEngineOptions {
  rulesLoader?: RulesLoader;
  memoryLoader?: MemoryLoader;
  metadataBuilder?: ProjectMetadataBuilder;
  fileBuilder?: FileContextBuilder;
  tokenEstimator?: TokenEstimator;
  /** Project info for metadata generation */
  projectName?: string;
  projectIndex?: ProjectIndex | null;
}

export class ContextEngine {
  private rulesLoader: RulesLoader;
  private memoryLoader: MemoryLoader;
  private metadataBuilder: ProjectMetadataBuilder;
  private fileBuilder: FileContextBuilder;
  private tokenEstimator: TokenEstimator;
  private projectName: string;
  private projectIndex: ProjectIndex | null;

  constructor(options: ContextEngineOptions = {}) {
    this.rulesLoader = options.rulesLoader ?? new RulesLoader();
    this.memoryLoader = options.memoryLoader ?? new MemoryLoader();
    this.metadataBuilder = options.metadataBuilder ?? new ProjectMetadataBuilder();
    this.fileBuilder = options.fileBuilder ?? new FileContextBuilder();
    this.tokenEstimator = options.tokenEstimator ?? new TokenEstimator();
    this.projectName = options.projectName ?? "Unknown";
    this.projectIndex = options.projectIndex ?? null;
  }

  /** Update project info (called when project changes) */
  setProjectInfo(name: string, index: ProjectIndex | null): void {
    this.projectName = name;
    this.projectIndex = index;
  }

  /**
   * Build a complete ContextBundle from a ContextRequest.
   *
   * This is the primary entry point. Every prompt goes through this.
   */
  async buildContext(request: ContextRequest): Promise<ContextBundle> {
    // 1. Load sources in parallel
    const [rules, memory] = await Promise.all([
      this.rulesLoader.load(),
      this.memoryLoader.load(),
    ]);

    // 2. Build project metadata
    let projectMetadata = "";
    if (this.projectIndex && this.projectName) {
      projectMetadata = this.metadataBuilder.buildFromIndex(
        this.projectName,
        this.projectIndex,
        request.selectedFiles.length,
      );
    }

    // 3. Build file context
    const fileContext = this.fileBuilder.build(request.selectedFiles);

    // 4. Assemble the final prompt
    const sections: string[] = [];

    // Project rules
    if (rules) {
      sections.push(`=== Project Rules ===\n${rules}`);
    }

    // Memory
    if (memory) {
      sections.push(`=== Session Memory ===\n${memory}`);
    }

    // Project metadata
    if (projectMetadata) {
      sections.push(`=== Project Metadata ===\n${projectMetadata}`);
    }

    // Selected files
    if (fileContext) {
      sections.push(`=== Selected Files ===\n${fileContext}`);
    }

    // User prompt (always last)
    sections.push(`=== Task ===\n${request.prompt}`);

    const assembledPrompt = sections.join("\n\n");

    // 5. Estimate tokens
    const estimatedTokens = this.tokenEstimator.estimate(assembledPrompt);

    // 6. Build sources for UI display
    const sources: ContextSources = {
      prompt: request.prompt,
      projectRules: rules,
      memory: memory,
      projectMetadata,
      selectedFiles: fileContext,
    };

    return {
      assembledPrompt,
      sources,
      estimatedTokens,
    };
  }

  /**
   * Get individual source info for the Context Panel.
   */
  getContextSourceInfo(bundle: ContextBundle): Array<{
    name: string;
    label: string;
    content: string;
    tokens: number;
    active: boolean;
  }> {
    const sources = bundle.sources;
    return [
      {
        name: "rules",
        label: "Project Rules",
        content: sources.projectRules,
        tokens: this.tokenEstimator.estimate(sources.projectRules),
        active: sources.projectRules.length > 0,
      },
      {
        name: "memory",
        label: "Memory",
        content: sources.memory,
        tokens: this.tokenEstimator.estimate(sources.memory),
        active: sources.memory.length > 0,
      },
      {
        name: "metadata",
        label: "Project Metadata",
        content: sources.projectMetadata,
        tokens: this.tokenEstimator.estimate(sources.projectMetadata),
        active: sources.projectMetadata.length > 0,
      },
      {
        name: "files",
        label: "Selected Files",
        content: sources.selectedFiles,
        tokens: this.tokenEstimator.estimate(sources.selectedFiles),
        active: sources.selectedFiles.length > 0,
      },
    ];
  }
}
