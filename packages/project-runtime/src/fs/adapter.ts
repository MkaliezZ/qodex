/**
 * Qodex Project Runtime — File System Adapter
 *
 * Abstracts file system operations so the runtime can work
 * in both browser (File System Access API) and Tauri environments.
 */

import type { ProjectFile } from "../types/project.js";
import { shouldIgnore, isBinaryFile, detectLanguage } from "../ignore/rules.js";
import { assertSafeProjectRelativePath } from "./path.js";
import {
  CODING_PACK_PROJECT_SOURCE_MAX_BYTES,
  CodingPackProjectSourceError,
  type CodingPackProjectSourceAdapter,
} from "./codingPackSource.js";

/**
 * Interface that must be implemented for each platform.
 */
export interface FileSystemAdapter extends CodingPackProjectSourceAdapter {
  /** List entries (files + directories) in a directory */
  listDirectory(dirPath: string): Promise<ProjectFile[]>;
  /** Read a file as UTF-8 text */
  readTextFile(filePath: string): Promise<string>;
  /** Read multiple files as UTF-8 text */
  readTextFiles(filePaths: string[]): Promise<Map<string, string>>;
  /** Replace an existing UTF-8 text file */
  writeTextFile(filePath: string, content: string): Promise<void>;
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
  private pathMap = new Map<string, FileSystemFileHandle | FileSystemDirectoryHandle>();

  constructor(private rootHandle: FileSystemDirectoryHandle) {
  }

  async listDirectory(dirPath: string): Promise<ProjectFile[]> {
    if (dirPath) assertSafeProjectRelativePath(dirPath);
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
    assertSafeProjectRelativePath(filePath);
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

  async readFileBytes(filePath: string): Promise<Uint8Array> {
    try {
      assertSafeProjectRelativePath(filePath);
      const handle = this.pathMap.get(filePath) as FileSystemFileHandle;
      if (!handle || handle.kind !== "file") {
        throw new CodingPackProjectSourceError(
          "coding_pack_read_failed",
          "KerniQ could not read the selected project file.",
        );
      }

      const file = await handle.getFile();
      if (file.size > CODING_PACK_PROJECT_SOURCE_MAX_BYTES) {
        throw new CodingPackProjectSourceError(
          "coding_pack_source_too_large",
          "The selected project file exceeds the Coding Pack preview limit.",
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
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
    if (isBinaryFile(filePath)) {
      throw new Error(`Unsupported Binary File: ${filePath}`);
    }

    const handle = this.pathMap.get(filePath) as FileSystemFileHandle;
    if (!handle || handle.kind !== "file") {
      throw new Error(`File not found: ${filePath}`);
    }

    const writable = await handle.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
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

  async exists(path: string): Promise<boolean> {
    assertSafeProjectRelativePath(path);
    return this.pathMap.has(path);
  }

  getProjectName(rootPath: string): string {
    return rootPath.split("/").pop() ?? rootPath;
  }
}
