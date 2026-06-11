/**
 * Qodex Project Runtime — File Reader
 *
 * Reads file contents through the file system adapter.
 * Handles binary detection and multi-file reads.
 */

import type { FileContent } from "../types/project.js";
import type { FileSystemAdapter } from "../fs/adapter.js";
import { isBinaryFile, detectLanguage } from "../ignore/rules.js";

export class FileReader {
  private adapter: FileSystemAdapter;

  constructor(adapter: FileSystemAdapter) {
    this.adapter = adapter;
  }

  /**
   * Read a single file. Returns the content or a binary indicator.
   */
  async readFile(filePath: string): Promise<FileContent> {
    if (isBinaryFile(filePath)) {
      return {
        path: filePath,
        content: "Unsupported Binary File",
        language: undefined,
      };
    }

    const content = await this.adapter.readTextFile(filePath);
    return {
      path: filePath,
      content,
      language: detectLanguage(filePath),
    };
  }

  /**
   * Read multiple files. Skips binary files.
   */
  async readFiles(filePaths: string[]): Promise<FileContent[]> {
    const results: FileContent[] = [];
    for (const fp of filePaths) {
      try {
        results.push(await this.readFile(fp));
      } catch {
        // Skip unreadable files
      }
    }
    return results;
  }

  /**
   * Read files and concatenate them into a single context block.
   */
  async readFilesAsContext(filePaths: string[]): Promise<string> {
    const files = await this.readFiles(filePaths);
    return files
      .map((f) => {
        const lang = f.language ? ` (${f.language})` : "";
        return `--- ${f.path}${lang} ---\n${f.content}\n`;
      })
      .join("\n");
  }
}
