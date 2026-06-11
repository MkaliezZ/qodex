/**
 * Qodex Context Engine — Memory Loader
 *
 * Loads session/project memory from qodex-config/memory.md.
 * In browser dev, memory is provided programmatically.
 * No semantic memory, no vector memory, no embeddings.
 */

export interface MemoryProvider {
  getMemory(): Promise<string> | string;
}

const DEFAULT_MEMORY = `# Qodex Session Memory

## Project Summary

- Mission: Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.
- Directory: ~/Desktop/Qodex
- Core philosophy: Codex Workflow, Any Model, Skills Included.

## Architecture

Tech stack: Tauri + React + TypeScript + SQLite + Drizzle ORM + pnpm Workspace
Layout: 3-column (Left Rail | Agent Workspace | Right Context Panel)
Design: Dark glassmorphism with fluid gradient background
`;

export class MemoryLoader {
  private provider: MemoryProvider;
  private cached: string | null = null;

  constructor(provider?: MemoryProvider) {
    this.provider = provider ?? {
      getMemory: () => DEFAULT_MEMORY,
    };
  }

  async load(): Promise<string> {
    if (this.cached !== null) return this.cached;
    this.cached = await this.provider.getMemory();
    return this.cached;
  }

  async reload(): Promise<string> {
    this.cached = null;
    return this.load();
  }

  clearCache(): void {
    this.cached = null;
  }

  get isCached(): boolean {
    return this.cached !== null;
  }
}
