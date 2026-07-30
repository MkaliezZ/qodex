/**
 * Qodex Project Runtime — Mock File System Adapter
 *
 * Simulates a file system for testing without actual disk access.
 */

import type { ProjectFile } from "../types/project.js";
import { shouldIgnore, isBinaryFile, detectLanguage } from "../ignore/rules.js";
import type { FileSystemAdapter } from "./adapter.js";
import {
  CODING_PACK_PROJECT_SOURCE_MAX_BYTES,
  CodingPackProjectSourceError,
} from "./codingPackSource.js";
import { assertSafeProjectRelativePath } from "./path.js";

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
    if (dirPath) assertSafeProjectRelativePath(dirPath);
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
    assertSafeProjectRelativePath(filePath);
    const entry = this.files.find(
      (f) => f.path === filePath && !f.isDir,
    );
    if (!entry) throw new Error(`File not found: ${filePath}`);
    if (isBinaryFile(filePath)) {
      throw new Error(`Unsupported Binary File: ${filePath}`);
    }
    return entry.content;
  }

  async readFileBytes(filePath: string): Promise<Uint8Array> {
    try {
      assertSafeProjectRelativePath(filePath);
      const entry = this.files.find(
        (file) => file.path === filePath && !file.isDir,
      );
      if (!entry) {
        throw new CodingPackProjectSourceError(
          "coding_pack_read_failed",
          "KerniQ could not read the selected project file.",
        );
      }
      const bytes = new TextEncoder().encode(entry.content);
      if (bytes.byteLength > CODING_PACK_PROJECT_SOURCE_MAX_BYTES) {
        throw new CodingPackProjectSourceError(
          "coding_pack_source_too_large",
          "The selected project file exceeds the Coding Pack preview limit.",
        );
      }
      return bytes;
    } catch (error) {
      if (error instanceof CodingPackProjectSourceError) throw error;
      throw new CodingPackProjectSourceError(
        "coding_pack_read_failed",
        "KerniQ could not read the selected project file.",
      );
    }
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    assertSafeProjectRelativePath(filePath);
    const entry = this.files.find((file) => file.path === filePath && !file.isDir);
    if (!entry) throw new Error(`File not found: ${filePath}`);
    if (isBinaryFile(filePath)) {
      throw new Error(`Unsupported Binary File: ${filePath}`);
    }
    entry.content = content;
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

  async exists(path: string): Promise<boolean> {
    assertSafeProjectRelativePath(path);
    return this.files.some((file) => file.path === path);
  }

  getProjectName(rootPath: string): string {
    return rootPath.split("/").pop() ?? rootPath;
  }
}
