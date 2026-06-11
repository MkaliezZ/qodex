/**
 * Qodex Project Runtime — Lightweight File Index
 *
 * Stores basic metadata about each indexed file.
 * No embeddings, no semantic search, no import graph.
 */

import type { ProjectIndex, ProjectIndexEntry } from "../types/project.js";
import type { FileSystemAdapter } from "../fs/adapter.js";
import { shouldIgnore, detectLanguage } from "../ignore/rules.js";

export class ProjectIndexer {
  private adapter: FileSystemAdapter;

  constructor(adapter: FileSystemAdapter) {
    this.adapter = adapter;
  }

  /**
   * Walk the entire project and build a flat index of all files.
   */
  async buildIndex(rootPath: string): Promise<ProjectIndex> {
    const entries: ProjectIndexEntry[] = [];
    await this.walkDirectory("", entries);
    return {
      rootPath,
      files: entries,
      indexedAt: new Date().toISOString(),
    };
  }

  private async walkDirectory(
    dirPath: string,
    result: ProjectIndexEntry[],
    depth = 0,
  ): Promise<void> {
    if (depth > 12) return; // Safety limit

    const children = await this.adapter.listDirectory(dirPath);

    for (const child of children) {
      if (child.type === "directory") {
        await this.walkDirectory(child.path, result, depth + 1);
      } else {
        result.push({
          path: child.path,
          size: child.size ?? 0,
          language: detectLanguage(child.name),
          lastModified: Date.now(),
        });
      }
    }
  }
}
