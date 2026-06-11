/**
 * Qodex Diff Engine — Core Engine
 *
 * Single entry point for all diff operations.
 * Orchestrates generation, validation, application, and rejection.
 */

import type { PatchProposal, PatchFile, PatchConflict } from "./models/patch.js";
import { DiffGenerator } from "./diff/generator.js";
import { PatchValidator } from "./validation/validator.js";
import type { ContentProvider } from "./validation/validator.js";
import { ApplyEngine } from "./apply/engine.js";
import type { ApplyTarget } from "./apply/engine.js";
import { PatchParser } from "./parser/parser.js";

export class DiffEngine {
  private generator: DiffGenerator;
  private validator: PatchValidator;
  private applier: ApplyEngine;
  private parser: PatchParser;

  constructor(contentProvider?: ContentProvider, applyTarget?: ApplyTarget) {
    this.generator = new DiffGenerator();
    this.validator = new PatchValidator(contentProvider);
    this.applier = new ApplyEngine(applyTarget);
    this.parser = new PatchParser();
  }

  // ── Creation ──────────────────────────────────────

  createProposal(taskId: string, summary: string, files: PatchFile[]): PatchProposal {
    return {
      id: crypto.randomUUID(),
      taskId,
      summary,
      files,
      createdAt: new Date().toISOString(),
    };
  }

  // ── Diff Generation ───────────────────────────────

  generateDiff(file: PatchFile) {
    return this.generator.generateDiff(file);
  }

  generateUnifiedDiff(file: PatchFile): string {
    return this.generator.generateUnifiedDiff(file);
  }

  generateMultiDiff(files: PatchFile[]) {
    return this.generator.generateMultiDiff(files);
  }

  // ── Parsing ────────────────────────────────────────

  parsePatch(diffText: string, taskId: string, summary?: string): PatchProposal {
    return this.parser.parse(diffText, taskId, summary);
  }

  serializeProposal(proposal: PatchProposal): string {
    return this.parser.serialize(proposal);
  }

  // ── Validation ────────────────────────────────────

  async validateProposal(proposal: PatchProposal): Promise<PatchConflict[]> {
    return this.validator.validateProposal(proposal);
  }

  // ── Preview ────────────────────────────────────────

  async preview(proposal: PatchProposal): Promise<string> {
    return this.applier.preview(proposal);
  }

  // ── Apply / Reject / Rollback ────────────────────

  async apply(proposal: PatchProposal) {
    // Validation first
    const conflicts = await this.validateProposal(proposal);
    if (conflicts.length > 0) {
      return conflicts.map((c) => ({
        success: false,
        path: c.path,
        error: `${c.type}: ${c.detail}`,
      }));
    }
    return this.applier.apply(proposal);
  }

  reject(proposal: PatchProposal): void {
    this.applier.reject(proposal);
  }

  async rollback(proposal: PatchProposal) {
    return this.applier.rollback(proposal);
  }

  applyInMemory(proposal: PatchProposal): Map<string, string> {
    return this.applier.applyInMemory(proposal);
  }
}
