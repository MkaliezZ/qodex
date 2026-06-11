/**
 * Qodex Project Runtime — File System Adapter
 *
 * Abstracts file system operations so the runtime can work
 * in both browser (File System Access API) and Tauri environments.
 */

import type { ProjectFile } from "../types/project.js";
import { shouldIgnore, isBinaryFile, detectLanguage } from "../ignore/rules.js";

/**
 * Interface that must be implemented for each platform.
 */
export interface FileSystemAdapter {
  /** List entries (files + directories) in a directory */
  listDirectory(dirPath: string): Promise<ProjectFile[]>;
  /** Read a file as UTF-8 text */
  readTextFile(filePath: string): Promise<string>;
  /** Read multiple files as UTF-8 text */
  readTextFiles(filePaths: string[]): Promise<Map<string, string>>;
  /** Check if a path exists */
  exists(path: string): Promise<boolean>;
  /** Get project name from root path */
  getProjectName(rootPath: string): string;
}

/**
 * Browser Web API adapter using the File System Access API.
 * This is the primary adapter for the Vite dev environment.
 */
export class WebFileSystemAdapter implements FileSystemAdapter {
  private handle: FileSystemDirectoryHandle | null = null;
  private pathMap = new Map<string, FileSystemFileHandle | FileSystemDirectoryHandle>();

  constructor(private rootHandle: FileSystemDirectoryHandle) {
    this.handle = rootHandle;
  }

  async listDirectory(dirPath: string): Promise<ProjectFile[]> {
    const handle = dirPath === ""
      ? this.rootHandle!
      : (this.pathMap.get(dirPath) as FileSystemDirectoryHandle);

    if (!handle || handle.kind !== "directory") return [];

    const entries: ProjectFile[] = [];
    for await (const [name, child] of (handle as any).entries()) {
      const relativePath = dirPath ? `${dirPath}/${name}` : name;
      if (shouldIgnore(relativePath)) continue;

      this.pathMap.set(relativePath, child);
      entries.push({
        path: relativePath,
        name,
        type: child.kind === "directory" ? "directory" : "file",
        language: child.kind === "file" ? detectLanguage(name) : undefined,
      });
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  async readTextFile(filePath: string): Promise<string> {
    const handle = this.pathMap.get(filePath) as FileSystemFileHandle;
    if (!handle || handle.kind !== "file") {
      throw new Error(`File not found: ${filePath}`);
    }

    if (isBinaryFile(filePath)) {
      throw new Error(`Unsupported Binary File: ${filePath}`);
    }

    const file = await handle.getFile();
    return await file.text();
  }

  async readTextFiles(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    for (const fp of filePaths) {
      try {
        const content = await this.readTextFile(fp);
        results.set(fp, content);
      } catch {
        // Skip files that can't be read
      }
    }
    return results;
  }

  async exists(_path: string): Promise<boolean> {
    return true; // Handles are only created from existing files
  }

  getProjectName(rootPath: string): string {
    return rootPath.split("/").pop() ?? rootPath;
  }
}
