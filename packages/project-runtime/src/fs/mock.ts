/**
 * Qodex Project Runtime — Mock File System Adapter
 *
 * Simulates a file system for testing without actual disk access.
 */

import type { ProjectFile } from "../types/project.js";
import { shouldIgnore, isBinaryFile, detectLanguage } from "../ignore/rules.js";
import type { FileSystemAdapter } from "./adapter.js";

interface MockFileEntry {
  path: string;
  name: string;
  content: string;
  isDir: boolean;
}

export class MockFileSystemAdapter implements FileSystemAdapter {
  private files: MockFileEntry[];

  constructor(files: MockFileEntry[] = []) {
    this.files = files;
  }

  private findChildren(dirPath: string): MockFileEntry[] {
    const prefix = dirPath ? `${dirPath}/` : "";
    return this.files.filter((f) => {
      if (f.path === dirPath) return false;
      if (!f.path.startsWith(prefix)) return false;
      const rest = f.path.slice(prefix.length);
      return !rest.includes("/");
    });
  }

  async listDirectory(dirPath: string): Promise<ProjectFile[]> {
    const children = this.findChildren(dirPath);
    const entries: ProjectFile[] = [];

    for (const child of children) {
      if (shouldIgnore(child.path)) continue;
      entries.push({
        path: child.path,
        name: child.name,
        type: child.isDir ? "directory" : "file",
        language: !child.isDir ? detectLanguage(child.name) : undefined,
        size: child.content.length,
      });
    }

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  async readTextFile(filePath: string): Promise<string> {
    const entry = this.files.find(
      (f) => f.path === filePath && !f.isDir,
    );
    if (!entry) throw new Error(`File not found: ${filePath}`);
    if (isBinaryFile(filePath)) {
      throw new Error(`Unsupported Binary File: ${filePath}`);
    }
    return entry.content;
  }

  async readTextFiles(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    for (const fp of filePaths) {
      try {
        results.set(fp, await this.readTextFile(fp));
      } catch {
        // Skip
      }
    }
    return results;
  }

  async exists(_path: string): Promise<boolean> {
    return true;
  }

  getProjectName(rootPath: string): string {
    return rootPath.split("/").pop() ?? rootPath;
  }
}
